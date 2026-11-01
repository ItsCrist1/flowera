"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type PartySocket from "partysocket";
import * as E from "@/lib/session/engine";
import { STORAGE_KEYS, readStorage, writeStorage } from "@/lib/storage";
import { hostSessionSchema, LESSON_LANGUAGES, type HostSession, type Question } from "@/lib/session/types";
import { parseMessage, toHostSchema, type HostMessage, type PublicState, type StudentEvent } from "@/lib/session/protocol";
import { effectiveLlm, usesLlm } from "@/lib/session/templates";
import { openRoom, partyHost, ROOM_REJECT_CODE } from "@/lib/realtime";
import { randomPin } from "@/lib/session/create";
import { AsrController, type AsrStatus } from "@/lib/asr/controller";
import { runAnalysis, runCheck } from "@/lib/llm/questions";
import { historyListSchema, summaryForAnalysis, toHistoryEntry } from "@/lib/session/history";

export type RoomStatus = "connecting" | "connected" | "offline" | "unconfigured";

const TICK_MS = 250;
const PERSIST_MS = 400;
/** The most transcript the LLM sees at once (characters, newest kept). */
const MAX_TRANSCRIPT_CHARS = 24_000;

/** What goes to localStorage: everything except the live transcript, which stays in memory only (spec §9). */
function forStorage(s: HostSession): HostSession {
    return s.llm.transcript.length ? { ...s, llm: { ...s.llm, transcript: [] } } : s;
}

/*
 * Runs a live session in the teacher's browser around the pure engine in lib/session/engine.ts:
 * the clock, the room connection, LLM checks, the microphone, and persistence.
 * Every state change goes through `commit`, which persists the session, pushes the public snapshot
 * to students when it changed, and delivers per-student messages.
 */
export function useHostSession() {
    const [session, setSession] = useState<HostSession | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [room, setRoom] = useState<RoomStatus>("connecting");
    const [asr, setAsr] = useState<AsrStatus>({ backend: "none", listening: false, warning: null, level: 0, pending: 0 });
    const [llmBusy, setLlmBusy] = useState<null | "check" | "generate" | "analysis">(null);
    const [llmError, setLlmError] = useState<string | null>(null);
    const [otherTab, setOtherTab] = useState(false);

    const ref = useRef<HostSession | null>(null);
    const socket = useRef<PartySocket | null>(null);
    const lastPublic = useRef<string>("");
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const asrRef = useRef<AsrController | null>(null);
    const llmAbort = useRef<AbortController | null>(null);

    /* ───────────── core commit ───────────── */

    const send = useCallback((msg: HostMessage) => {
        const ws = socket.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }, []);

    const publish = useCallback((s: HostSession, force = false) => {
        const state = E.buildPublicState(s, Date.now());
        // remainingMs changes every tick; students count down locally, so only push structural changes.
        const key = JSON.stringify({ ...state, question: state.question ? { ...state.question, remainingMs: 0 } : null });
        if (!force && key === lastPublic.current) return;
        lastPublic.current = key;
        send({ t: "state", state });
    }, [send]);

    // Throttled (not debounced): the clock commits every tick, so a debounce would never fire.
    const persist = useCallback((s: HostSession, immediate = false) => {
        const write = () => {
            persistTimer.current = null;
            writeStorage(STORAGE_KEYS.hostSession, forStorage(ref.current ?? s));
        };
        if (immediate) {
            if (persistTimer.current) clearTimeout(persistTimer.current);
            write();
        } else if (!persistTimer.current) {
            persistTimer.current = setTimeout(write, PERSIST_MS);
        }
    }, []);

    const commit = useCallback((fn: (s: HostSession) => HostSession | E.Step, opts?: { persistNow?: boolean }) => {
        const cur = ref.current;
        if (!cur) return;
        const result = fn(cur);
        const step: E.Step = "session" in result ? result : { session: result, outbox: [] };
        if (step.session === cur && step.outbox.length === 0) return;
        ref.current = step.session;
        setSession(step.session);
        persist(step.session, opts?.persistNow);
        publish(step.session);
        for (const o of step.outbox) send({ t: "to", cid: o.cid, msg: o.msg });
    }, [persist, publish, send]);

    /* ───────────── load / single-tab lock ───────────── */

    useEffect(() => {
        const stored = readStorage(STORAGE_KEYS.hostSession, hostSessionSchema);
        const recovered = stored ? E.recoverAfterReload(stored, Date.now()) : null;
        ref.current = recovered;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
        setSession(recovered);
        setLoaded(true);
        if (recovered && recovered !== stored) writeStorage(STORAGE_KEYS.hostSession, forStorage(recovered));
    }, []);

    const sessionId = session?.id ?? null;

    useEffect(() => {
        if (!sessionId || !("locks" in navigator)) return;
        let release: (() => void) | null = null;
        const held = new Promise<void>(r => (release = r));
        navigator.locks.request(`flowera-host-${sessionId}`, { ifAvailable: true }, async lock => {
            setOtherTab(!lock);
            if (lock) await held;
        });
        return () => release?.();
    }, [sessionId]);

    /* ───────────── room connection ───────────── */

    const pin = session?.pin ?? null;
    const token = session?.hostToken ?? null;

    useEffect(() => {
        if (!pin || !token || otherTab) return;
        if (!partyHost()) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- static configuration problem
            setRoom("unconfigured");
            return;
        }
        const ws = openRoom(pin, { role: "host", token });
        socket.current = ws;
        setRoom("connecting");

        const applyEvents = (events: StudentEvent[]) => {
            if (!events.length) return;
            const sorted = [...events].sort((a, b) => a.seq - b.seq);
            commit(s => {
                let cur = s;
                const outbox: E.Outbox = [];
                for (const ev of sorted) {
                    const step = E.applyStudentEvent(cur, ev, Date.now());
                    cur = step.session;
                    outbox.push(...step.outbox);
                }
                return { session: cur, outbox };
            });
            send({ t: "ackEvents", upTo: sorted.at(-1)!.seq });
        };

        ws.addEventListener("open", () => {
            setRoom("connected");
            if (ref.current) publish(ref.current, true);
        });
        ws.addEventListener("close", e => {
            setRoom("offline");
            if (e.code === ROOM_REJECT_CODE) ws.close();
        });
        ws.addEventListener("message", e => {
            const msg = parseMessage(toHostSchema, e.data);
            if (!msg) return;
            switch (msg.t) {
                case "welcome":
                    commit(s => E.reconcilePresence(s, msg.connected, Date.now()));
                    applyEvents(msg.events);
                    break;
                case "event":
                    applyEvents([msg.event]);
                    break;
                case "error":
                    if (msg.code === "pin_taken") {
                        if (ref.current?.status === "lobby") commit(s => ({ ...s, pin: randomPin() }), { persistNow: true });
                        else toast.error("Another device has taken over this session's PIN.");
                    }
                    break;
            }
        });
        return () => {
            ws.close();
            socket.current = null;
        };
    }, [pin, token, otherTab, commit, publish, send]);

    /* ───────────── clock, timeline, approvals, LLM schedule ───────────── */

    const runLlm = useCallback(async (mode: "scheduled" | "generate") => {
        const s = ref.current;
        if (!s || llmAbort.current) return;
        const llm = effectiveLlm(s.config);
        if (!llm.enabled || !llm.model) return;

        const checkActiveMs = E.activeNow(s, Date.now());
        if (mode === "scheduled" && s.llm.teacherQuestionSinceCheck) {
            commit(cur => E.log({ ...cur, llm: { ...cur.llm, lastCheckActiveMs: checkActiveMs, teacherQuestionSinceCheck: false } },
                "llm.skipped", "AI check skipped: you or the timeline sent a question since the last check.", Date.now()));
            return;
        }

        const ctrl = new AbortController();
        llmAbort.current = ctrl;
        setLlmBusy(mode === "generate" ? "generate" : "check");
        setLlmError(null);
        try {
            await asrRef.current?.flush();
            const snapshot = ref.current!;
            const pieces = snapshot.llm.transcript;
            const lines = pieces.map(p => (p.speaker !== null ? `[Speaker ${p.speaker}] ${p.text}` : p.text));
            // Keep the newest speech if a lot accumulated (e.g. "only when I ask" mode).
            let text = lines.join("\n");
            if (text.length > MAX_TRANSCRIPT_CHARS) text = `…${text.slice(text.length - MAX_TRANSCRIPT_CHARS)}`;
            const usedCount = pieces.length;
            const consume = (cur: HostSession): HostSession => ({
                ...cur,
                llm: { ...cur.llm, lastCheckActiveMs: checkActiveMs, teacherQuestionSinceCheck: false, transcript: cur.llm.transcript.slice(usedCount) },
            });

            if (!text.trim()) {
                commit(cur => E.log(consume(cur), "llm.skipped", "AI check skipped: nothing was said since the last check.", Date.now()));
                if (mode === "generate") toast.info("Nothing has been said since the last check, so there's nothing to ask about yet.");
                return;
            }

            const force = mode === "generate" || llm.trigger === "interval";
            const result = await runCheck({
                provider: llm.provider,
                model: llm.model,
                language: llm.language,
                lessonContext: llm.systemPrompt,
                transcript: text,
                previous: snapshot.asked.map(a => a.question.text).concat(snapshot.queue.map(q => q.question.text)),
                force,
                signal: ctrl.signal,
            });

            commit(cur => {
                let next = consume(cur);
                const now = Date.now();
                if (!result.ask) return E.log(next, "llm.declined", `AI decided not to ask: ${result.reason}`, now);
                if (mode === "scheduled" && E.cooldownLeftMs(next, now) > 0)
                    return E.log(next, "llm.declined", `AI question dropped: the cooldown hasn't passed. (${result.question.text})`, now);
                if (llm.requireApproval) {
                    next = { ...next, llm: { ...next.llm, pending: { id: result.question.id, question: result.question, reason: result.reason, requestedAt: now } } };
                    return E.log(next, "approval.requested", `AI proposes: ${result.question.text}`, now);
                }
                next = E.log(next, "llm.asked", `AI question: ${result.question.text}${result.reason ? ` (${result.reason})` : ""}`, now);
                return E.openNext(E.enqueue(next, result.question, "llm", now), now);
            });
        } catch (e) {
            if (ctrl.signal.aborted) return;
            const message = e instanceof Error ? e.message : String(e);
            setLlmError(message);
            // Don't hammer a failing provider: count the attempt as a check.
            commit(cur => E.log({ ...cur, llm: { ...cur.llm, lastCheckActiveMs: checkActiveMs } }, "llm.error", `AI check failed: ${message}`, Date.now()));
            if (mode === "generate") toast.error(message);
        } finally {
            llmAbort.current = null;
            setLlmBusy(null);
        }
    }, [commit]);

    useEffect(() => {
        if (!sessionId || otherTab) return;
        const t = setInterval(() => {
            const s = ref.current;
            if (!s || s.status === "ended") return;
            const now = Date.now();
            commit(cur => {
                let next = E.tick(cur, now);
                // Approval timeout.
                const p = next.llm.pending;
                const policy = next.config.llm.approvalTimeout;
                if (p && next.status === "running" && policy.mode !== "wait" && now - p.requestedAt >= policy.seconds * 1000) {
                    next = { ...next, llm: { ...next.llm, pending: null } };
                    if (policy.mode === "approve") {
                        next = E.log(next, "approval.timeout", `No answer in ${policy.seconds}s, sent automatically: ${p.question.text}`, now);
                        next = E.openNext(E.enqueue(next, p.question, "llm", now), now);
                    } else {
                        next = E.log(next, "approval.timeout", `No answer in ${policy.seconds}s, dropped: ${p.question.text}`, now);
                    }
                }
                return next;
            });
            const after = ref.current;
            if (after?.status === "running" && !llmAbort.current && !after.llm.pending) {
                const due = E.llmCheckDueInMs(after, now);
                if (due === 0) void runLlm("scheduled");
            }
        }, TICK_MS);
        return () => clearInterval(t);
    }, [sessionId, otherTab, commit, runLlm]);

    /* ───────────── microphone / transcription ───────────── */

    const status = session?.status;
    const wantsMic = Boolean(session && usesLlm(session.config) && status === "running" && !otherTab);
    const lang = session ? LESSON_LANGUAGES[session.config.llm.language].speechTag : "en-US";

    useEffect(() => {
        if (!wantsMic) return;
        const ctrl = new AsrController({
            lang,
            onPieces: pieces => commit(s => ({ ...s, llm: { ...s.llm, transcript: [...s.llm.transcript, ...pieces] } })),
            onStatus: setAsr,
            onWarning: w => commit(s => E.log(s, w ? "asr.warning" : "asr.ok", w ?? "Transcription is back on the GPU server.", Date.now())),
        });
        asrRef.current = ctrl;
        void ctrl.start();
        return () => {
            asrRef.current = null;
            void ctrl.stop();
        };
    }, [wantsMic, lang, commit]);

    /* ───────────── persistence on exit ───────────── */

    useEffect(() => {
        const save = () => {
            if (ref.current) writeStorage(STORAGE_KEYS.hostSession, forStorage({ ...ref.current, heartbeatAt: Date.now() }));
        };
        window.addEventListener("pagehide", save);
        return () => {
            window.removeEventListener("pagehide", save);
            save();
        };
    }, []);

    /* ───────────── actions ───────────── */

    const now = () => Date.now();

    const actions = {
        start: () => commit(s => E.start(s, now()), { persistNow: true }),
        pause: () => commit(s => E.pause(s, now(), "manual"), { persistNow: true }),
        resume: () => commit(s => E.resume(s, now()), { persistNow: true }),
        end: () => {
            llmAbort.current?.abort();
            commit(s => E.end(s, now()), { persistNow: true });
            const ended = ref.current;
            if (ended) {
                const list = readStorage(STORAGE_KEYS.history, historyListSchema) ?? [];
                writeStorage(STORAGE_KEYS.history, [toHistoryEntry(ended), ...list.filter(h => h.id !== ended.id)]);
            }
        },
        send: (q: Question) => commit(s => E.openNext(E.enqueue(s, q, "manual", now()), now())),
        closeActive: () => commit(s => E.openNext(E.closeActive(s, now(), "Closed by the teacher."), now())),
        removeQueued: (queueId: string) => commit(s => E.removeQueued(s, queueId)),
        moveQueued: (queueId: string, dir: -1 | 1) => commit(s => E.moveQueued(s, queueId, dir)),
        setShowAnswers: (v: boolean) => commit(s => ({ ...s, showAnswers: v })),
        generate: () => void runLlm("generate"),
        approve: (q: Question) => commit(s => {
            const t = now();
            let next: HostSession = { ...s, llm: { ...s.llm, pending: null } };
            next = E.log(next, "approval.approved", `Approved: ${q.text}`, t);
            return E.openNext(E.enqueue(next, q, "llm", t), t);
        }),
        reject: () => commit(s => s.llm.pending
            ? E.log({ ...s, llm: { ...s.llm, pending: null } }, "approval.rejected", `Rejected: ${s.llm.pending.question.text}`, now())
            : s),
        shareReport: () => {
            commit(s => E.log({ ...s, reportShared: true }, "report.shared", "Shared the anonymous report with every student.", now()), { persistNow: true });
            toast.success("Report sent to every connected student.");
        },
        analyze: async () => {
            const s = ref.current;
            if (!s) return;
            const llm = effectiveLlm(s.config);
            setLlmBusy("analysis");
            try {
                const text = await runAnalysis({
                    provider: llm.provider,
                    model: llm.model || "kilo-auto/free",
                    language: llm.language,
                    lessonContext: llm.systemPrompt,
                    summary: summaryForAnalysis(toHistoryEntry(s)),
                });
                commit(cur => ({ ...cur, analysis: text }), { persistNow: true });
                // Keep history in sync.
                const list = readStorage(STORAGE_KEYS.history, historyListSchema) ?? [];
                writeStorage(STORAGE_KEYS.history, list.map(h => (h.id === s.id ? { ...h, analysis: text } : h)));
            } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
            } finally {
                setLlmBusy(null);
            }
        },
        /** Forget the finished session so a new one can start (it stays in history). */
        discard: () => {
            llmAbort.current?.abort();
            ref.current = null;
            setSession(null);
            writeStorage(STORAGE_KEYS.hostSession, null);
        },
    };

    return { session, loaded, room, asr, llmBusy, llmError, otherTab, actions };
}

export type HostActions = ReturnType<typeof useHostSession>["actions"];
export type { PublicState };
