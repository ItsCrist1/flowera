import { routePartykitRequest, Server, type Connection, type ConnectionContext } from "partyserver";
import {
    hostMessageSchema, parseMessage, studentMessageSchema,
    type PublicState, type StudentEvent, type ToHost, type ToStudent,
} from "../../lib/session/protocol";

/*
 * One Room per session PIN (spec §11). The teacher's browser makes every decision; the room:
 *   - authenticates the host with the token from the first host connection,
 *   - relays student events to the host (buffering them while the host is away),
 *   - keeps the latest public snapshot so late joiners and reconnects see the current question,
 *   - pauses the session for students when the host drops,
 *   - forgets everything 24 h after the last activity.
 */

type Env = { Room: DurableObjectNamespace<Room> };
type ConnState = { role: "host" } | { role: "student"; cid: string };

const EXPIRE_MS = 24 * 60 * 60 * 1000;
const MAX_BUFFERED_EVENTS = 5000;

type Stored = {
    hostToken: string | null;
    state: PublicState | null;
    /** When `state` was stored (room clock), to age `remainingMs` for late joiners. */
    stateAt: number;
    events: StudentEvent[];
    seq: number;
    names: Record<string, string>;
};

const EMPTY: Stored = { hostToken: null, state: null, stateAt: 0, events: [], seq: 0, names: {} };

export class Room extends Server<Env> {
    static options = { hibernate: true };

    private data: Stored = EMPTY;

    async onStart() {
        this.data = { ...EMPTY, ...(await this.ctx.storage.get<Stored>("room")) };
    }

    private async save() {
        await this.ctx.storage.put("room", this.data);
        await this.ctx.storage.setAlarm(Date.now() + EXPIRE_MS);
    }

    async onAlarm() {
        await this.ctx.storage.deleteAll();
        this.data = EMPTY;
    }

    getConnectionTags(_conn: Connection, ctx: ConnectionContext) {
        const role = new URL(ctx.request.url).searchParams.get("role");
        return [role === "host" ? "host" : "student"];
    }

    async onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
        const params = new URL(ctx.request.url).searchParams;
        const role = params.get("role");

        if (role === "host") {
            const token = params.get("token") ?? "";
            if (token.length < 16) return this.reject(conn, { t: "error", code: "pin_taken", message: "Missing host token." });
            if (this.data.hostToken && this.data.hostToken !== token)
                return this.reject(conn, { t: "error", code: "pin_taken", message: "This PIN is in use by another session." });
            if (!this.data.hostToken) {
                this.data.hostToken = token;
                await this.save();
            }
            conn.setState({ role: "host" });
            this.sendHost(conn, { t: "welcome", connected: this.connectedStudents(), events: this.data.events });
            return;
        }

        const cid = params.get("cid") ?? "";
        if (!/^[\w-]{8,64}$/.test(cid)) return this.reject(conn, { t: "error", code: "bad_message", message: "Invalid client id." });
        if (!this.data.hostToken || !this.data.state)
            return this.reject(conn, { t: "error", code: "not_found", message: "No session with this PIN." });
        if (this.data.state.status === "ended" && !this.data.state.report)
            return this.reject(conn, { t: "error", code: "ended", message: "This session has ended." });

        conn.setState({ role: "student", cid });
        this.sendStudent(conn, { t: "state", state: this.agedState() });
    }

    async onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer) {
        const st = conn.state;
        if (!st) return;

        if (st.role === "host") {
            const msg = parseMessage(hostMessageSchema, raw);
            if (!msg) return this.sendHost(conn, { t: "error", code: "bad_message", message: "Unreadable message." });
            switch (msg.t) {
                case "state":
                    this.data.state = msg.state;
                    this.data.stateAt = Date.now();
                    await this.save();
                    this.broadcastStudents({ t: "state", state: msg.state });
                    break;
                case "to":
                    for (const c of this.studentConnections(msg.cid)) this.sendStudent(c, msg.msg);
                    break;
                case "ackEvents":
                    this.data.events = this.data.events.filter(e => e.seq > msg.upTo);
                    await this.save();
                    break;
            }
            return;
        }

        const msg = parseMessage(studentMessageSchema, raw);
        if (!msg) return this.sendStudent(conn, { t: "error", code: "bad_message", message: "Unreadable message." });
        const at = Date.now();
        const cid = st.cid;
        switch (msg.t) {
            case "hello": {
                const name = cleanName(msg.name);
                this.data.names[cid] = name;
                await this.push({ t: "hello", seq: 0, cid, name, at });
                break;
            }
            case "answer":
                await this.push({ t: "answer", seq: 0, cid, askedId: msg.askedId, value: msg.value, at });
                break;
            case "rename": {
                const name = cleanName(msg.name);
                this.data.names[cid] = name;
                await this.push({ t: "rename", seq: 0, cid, name, at });
                break;
            }
            case "leave":
                await this.push({ t: "leave", seq: 0, cid, at });
                conn.close(1000, "left");
                break;
        }
    }

    async onClose(conn: Connection<ConnState>) {
        const st = conn.state;
        if (!st) return;
        if (st.role === "host") {
            // Last host tab gone: pause for students until the teacher is back.
            if ([...this.getConnections("host")].length === 0 && this.data.state?.status === "running") {
                this.data.state = { ...this.data.state, status: "paused" };
                this.data.stateAt = Date.now();
                await this.save();
                this.broadcastStudents({ t: "state", state: this.agedState() });
            }
            return;
        }
        // Only report a disconnect if this student has no other open tab.
        if (this.studentConnections(st.cid).length === 0)
            await this.push({ t: "disconnect", seq: 0, cid: st.cid, at: Date.now() });
    }

    /* ───────────── helpers ───────────── */

    private async push(event: StudentEvent) {
        // Assign the sequence number and forward synchronously, before any await, so the host always
        // receives events in sequence order even when several messages are processed concurrently.
        event.seq = ++this.data.seq;
        this.data.events.push(event);
        if (this.data.events.length > MAX_BUFFERED_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_BUFFERED_EVENTS);
        for (const h of this.getConnections("host")) this.sendHost(h, { t: "event", event });
        await this.save();
    }

    /** The stored snapshot with the open question's remaining time adjusted for how long ago it was stored. */
    private agedState(): PublicState {
        const s = this.data.state!;
        if (s.status !== "running" || !s.question) return s;
        const elapsed = Date.now() - this.data.stateAt;
        return { ...s, question: { ...s.question, remainingMs: Math.max(0, s.question.remainingMs - elapsed) } };
    }

    private connectedStudents(): string[] {
        const ids = new Set<string>();
        for (const c of this.getConnections<ConnState>("student")) if (c.state?.role === "student") ids.add(c.state.cid);
        return [...ids];
    }

    private studentConnections(cid: string): Connection<ConnState>[] {
        return [...this.getConnections<ConnState>("student")].filter(c => c.state?.role === "student" && c.state.cid === cid);
    }

    private broadcastStudents(msg: ToStudent) {
        const text = JSON.stringify(msg);
        for (const c of this.getConnections("student")) c.send(text);
    }

    private sendStudent(conn: Connection, msg: ToStudent) {
        conn.send(JSON.stringify(msg));
    }

    private sendHost(conn: Connection, msg: ToHost) {
        conn.send(JSON.stringify(msg));
    }

    private reject(conn: Connection, msg: ToHost | ToStudent) {
        conn.send(JSON.stringify(msg));
        conn.close(4000, msg.t === "error" ? msg.code : "rejected");
    }
}

function cleanName(name: string) {
    const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
    return n || "Student";
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/health") return Response.json({ ok: true });
        return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;
