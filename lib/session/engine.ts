import { describeCorrect, isCorrect, sanitizeAnswer, slicesFor, summarize } from "./questions";
import { effectiveLlm, usesLlm } from "./templates";
import type { PublicState, Report, StudentEvent, ToStudent } from "./protocol";
import {
    id, toPublicQuestion,
    type AnswerValue, type AskedQuestion, type HostSession, type LogKind, type Question, type QuestionSource,
} from "./types";

/*
 * The live-session state machine (spec §4–§6). Pure functions: (session, input, now) → new session
 * plus any messages to send. The React hook in components/host/use-host-session.ts runs the clock,
 * the room connection, the LLM and the microphone around it.
 *
 * Time model: everything that must freeze while paused (question timers, the timeline, LLM checks,
 * the cooldown) is measured in "active milliseconds" — wall time spent in the running state.
 */

export const ANSWER_GRACE_MS = 2000;
const MAX_LOG = 2000;

export type Outbox = { cid: string; msg: ToStudent }[];
export type Step = { session: HostSession; outbox: Outbox };

/* ───────────── Clock ───────────── */

export function activeNow(s: HostSession, now: number): number {
    return s.activeMs + (s.status === "running" && s.resumedAt !== null ? Math.max(0, now - s.resumedAt) : 0);
}

export function remainingMs(s: HostSession, aq: AskedQuestion, now: number): number {
    return aq.openedActiveMs + aq.durationMs - activeNow(s, now);
}

export function activeQuestion(s: HostSession): AskedQuestion | null {
    return s.activeId ? s.asked.find(a => a.id === s.activeId) ?? null : null;
}

/* ───────────── Log ───────────── */

export function log(s: HostSession, kind: LogKind, message: string, now: number): HostSession {
    const entry = { id: id(), at: now, kind, message };
    const next = [...s.log, entry];
    return { ...s, log: next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next };
}

function studentName(s: HostSession, cid: string) {
    return s.students[cid]?.name ?? "A student";
}

function shortText(text: string, n = 60) {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t || "Untitled question";
}

/* ───────────── Lifecycle ───────────── */

export function start(s: HostSession, now: number): HostSession {
    if (s.status !== "lobby") return s;
    let next: HostSession = { ...s, status: "running", startedAt: now, resumedAt: now, pauseReason: null, heartbeatAt: now };
    next = log(next, "session.started", "Session started.", now);
    return next;
}

export function pause(s: HostSession, now: number, reason: "manual" | "disconnect"): HostSession {
    if (s.status !== "running") return s;
    const next: HostSession = { ...s, status: "paused", pauseReason: reason, activeMs: activeNow(s, now), resumedAt: null };
    return log(next, "session.paused", reason === "manual" ? "Paused." : "Paused because the teacher's tab was closed or lost connection.", now);
}

export function resume(s: HostSession, now: number): HostSession {
    if (s.status !== "paused") return s;
    const next: HostSession = { ...s, status: "running", pauseReason: null, resumedAt: now };
    return log(next, "session.resumed", "Resumed.", now);
}

/** Restore a session after the teacher's tab was closed or reloaded while running. */
export function recoverAfterReload(s: HostSession, now: number): HostSession {
    if (s.status !== "running" || s.resumedAt === null) return s;
    // Only count active time up to the last moment the tab was known to be alive.
    const aliveUntil = Math.min(now, Math.max(s.heartbeatAt, s.resumedAt));
    return pause(s, aliveUntil, "disconnect");
}

export function end(s: HostSession, now: number): HostSession {
    if (s.status === "ended") return s;
    let next = s;
    if (next.status === "running") next = { ...next, activeMs: activeNow(next, now), resumedAt: null };
    if (next.activeId) next = closeActive(next, now, "Session ended.");
    next = { ...next, status: "ended", endedAt: now, queue: [], llm: { ...next.llm, pending: null, transcript: [] } };
    return log(next, "session.ended", "Session ended.", now);
}

/* ───────────── Queue ───────────── */

export function enqueue(s: HostSession, question: Question, source: QuestionSource, now: number): HostSession {
    const item = { id: id(), question: structuredClone(question), source, queuedAt: now };
    let next: HostSession = { ...s, queue: [...s.queue, item] };
    if (source !== "llm") next = { ...next, llm: { ...next.llm, teacherQuestionSinceCheck: true } };
    if (s.activeId) next = log(next, "question.queued", `Queued (${sourceLabel(source)}): ${shortText(question.text)}`, now);
    return next;
}

export function removeQueued(s: HostSession, queueId: string): HostSession {
    return { ...s, queue: s.queue.filter(q => q.id !== queueId) };
}

export function moveQueued(s: HostSession, queueId: string, dir: -1 | 1): HostSession {
    const i = s.queue.findIndex(q => q.id === queueId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.queue.length) return s;
    const queue = [...s.queue];
    [queue[i], queue[j]] = [queue[j], queue[i]];
    return { ...s, queue };
}

function sourceLabel(source: QuestionSource) {
    return source === "llm" ? "AI" : source === "timeline" ? "timeline" : "manual";
}

function onlineStudentIds(s: HostSession) {
    return Object.values(s.students).filter(st => st.status === "online").map(st => st.id);
}

/** Open the next queued question if nothing is active and the session is running. */
export function openNext(s: HostSession, now: number): HostSession {
    if (s.status !== "running" || s.activeId || s.queue.length === 0) return s;
    const [item, ...rest] = s.queue;
    const durationMs = (item.question.timeLimitSec ?? s.config.defaults.timeLimitSec) * 1000;
    const aq: AskedQuestion = {
        id: id(),
        question: item.question,
        source: item.source,
        openedAt: now,
        openedActiveMs: activeNow(s, now),
        durationMs,
        closedAt: null,
        eligible: onlineStudentIds(s),
        answers: {},
    };
    let next: HostSession = { ...s, queue: rest, asked: [...s.asked, aq], activeId: aq.id };
    if (item.source === "llm") next = { ...next, llm: { ...next.llm, lastLlmQuestionActiveMs: aq.openedActiveMs } };
    return log(next, "question.sent", `Sent (${sourceLabel(item.source)}): ${shortText(item.question.text)}`, now);
}

export function closeActive(s: HostSession, now: number, reason = "Time's up."): HostSession {
    const aq = activeQuestion(s);
    if (!aq) return s;
    const closed: AskedQuestion = { ...aq, closedAt: now };
    const next: HostSession = { ...s, activeId: null, asked: s.asked.map(a => (a.id === aq.id ? closed : a)) };
    const sum = summarize(closed);
    return log(next, "question.closed", `Closed: ${shortText(aq.question.text, 40)} · ${sum.answered}/${sum.eligible} answered · ${reason}`, now);
}

/* ───────────── Clock tick ───────────── */

/** Advance timers: close an expired question, fire the timeline, open the next queued question. */
export function tick(s: HostSession, now: number): HostSession {
    let next: HostSession = { ...s, heartbeatAt: now };
    if (next.status !== "running") return next;

    const aq = activeQuestion(next);
    if (aq && remainingMs(next, aq, now) <= 0) next = closeActive(next, now);
    else if (aq && next.config.defaults.closeWhenAllAnswered && everyoneAnswered(next, aq)) next = closeActive(next, now, "Everyone answered.");

    next = fireTimeline(next, now);
    return openNext(next, now);
}

function everyoneAnswered(s: HostSession, aq: AskedQuestion) {
    const online = onlineStudentIds(s).filter(cid => aq.eligible.includes(cid));
    return online.length > 0 && online.every(cid => aq.answers[cid]);
}

export function timelineQuestions(s: HostSession): Question[] {
    if (s.config.template !== "hardcoded" && s.config.template !== "customized") return [];
    return s.config.questions.filter(q => q.onTimeline);
}

export function nextTimelineDueInMs(s0: HostSession, now: number): number | null {
    const s = skipSent(s0);
    if (s.timeline.nextIndex >= timelineQuestions(s).length) return null;
    const interval = s.config.timelineIntervalMin * 60_000;
    return Math.max(0, s.timeline.lastTickActiveMs + interval - activeNow(s, now));
}

/** Questions already sent or waiting in the queue are skipped by the timeline. */
function skipSent(s: HostSession): HostSession {
    const list = timelineQuestions(s);
    const sent = new Set([...s.asked.map(a => a.question.id), ...s.queue.map(q => q.question.id)]);
    let i = s.timeline.nextIndex;
    while (i < list.length && sent.has(list[i].id)) i++;
    return i === s.timeline.nextIndex ? s : { ...s, timeline: { ...s.timeline, nextIndex: i } };
}

function fireTimeline(s0: HostSession, now: number): HostSession {
    const s = skipSent(s0);
    const list = timelineQuestions(s);
    if (s.timeline.nextIndex >= list.length) return s;
    const interval = s.config.timelineIntervalMin * 60_000;
    const active = activeNow(s, now);
    if (active - s.timeline.lastTickActiveMs < interval) return s;
    const q = list[s.timeline.nextIndex];
    const next: HostSession = { ...s, timeline: { nextIndex: s.timeline.nextIndex + 1, lastTickActiveMs: active } };
    return enqueue(next, q, "timeline", now);
}

/* ───────────── Students ───────────── */

export function applyStudentEvent(s: HostSession, e: StudentEvent, now: number): Step {
    if (e.seq <= s.lastEventSeq) return { session: s, outbox: [] };
    let next: HostSession = { ...s, lastEventSeq: e.seq };
    const outbox: Outbox = [];
    const existing = next.students[e.cid];

    switch (e.t) {
        case "hello": {
            const isNew = !existing;
            next = { ...next, students: { ...next.students, [e.cid]: { id: e.cid, name: e.name, joinedAt: existing?.joinedAt ?? e.at, status: "online" } } };
            if (isNew) next = log(next, "student.joined", `${e.name} joined.`, now);
            else if (existing.status !== "online") next = log(next, "student.reconnected", `${e.name} ${existing.status === "left" ? "came back" : "reconnected"}.`, now);
            if (existing && existing.name !== e.name) next = log(next, "student.renamed", `${existing.name} is now ${e.name}.`, now);
            // A student who (re)joins while a question is open can still answer it.
            const aq = activeQuestion(next);
            if (aq && !aq.eligible.includes(e.cid))
                next = { ...next, asked: next.asked.map(a => (a.id === aq.id ? { ...a, eligible: [...a.eligible, e.cid] } : a)) };
            // Restore their submitted answer on their device after a reconnect.
            if (aq?.answers[e.cid]) outbox.push({ cid: e.cid, msg: { t: "ack", askedId: aq.id, accepted: true, value: aq.answers[e.cid].value } });
            outbox.push({ cid: e.cid, msg: { t: "named", name: e.name } });
            break;
        }
        case "rename": {
            if (!existing || existing.name === e.name) break;
            next = { ...next, students: { ...next.students, [e.cid]: { ...existing, name: e.name } } };
            next = log(next, "student.renamed", `${existing.name} is now ${e.name}.`, now);
            outbox.push({ cid: e.cid, msg: { t: "named", name: e.name } });
            break;
        }
        case "leave": {
            if (!existing) break;
            next = { ...next, students: { ...next.students, [e.cid]: { ...existing, status: "left" } } };
            next = log(next, "student.left", `${existing.name} left.`, now);
            break;
        }
        case "disconnect": {
            if (!existing || existing.status !== "online") break;
            next = { ...next, students: { ...next.students, [e.cid]: { ...existing, status: "offline" } } };
            next = log(next, "student.disconnected", `${existing.name} disconnected.`, now);
            break;
        }
        case "answer": {
            const r = recordAnswer(next, e.cid, e.askedId, e.value, now);
            next = r.session;
            outbox.push(...r.outbox);
            break;
        }
    }
    return { session: next, outbox };
}

export function recordAnswer(s: HostSession, cid: string, askedId: string, value: AnswerValue, now: number): Step {
    const refuse = (reason: string): Step => ({ session: s, outbox: [{ cid, msg: { t: "ack", askedId, accepted: false, value: null, reason } }] });
    const aq = s.asked.find(a => a.id === askedId);
    if (!aq) return refuse("This question is no longer open.");
    const isActive = s.activeId === aq.id;
    const justClosed = aq.closedAt !== null && now - aq.closedAt <= ANSWER_GRACE_MS;
    if (!isActive && !justClosed) return refuse("Time's up.");
    if (isActive && s.status !== "running") return refuse("The session is paused.");

    const clean = sanitizeAnswer(aq.question, value);
    if (!clean) return refuse("That answer isn't valid for this question.");

    const previous = aq.answers[cid];
    if (previous && !s.config.defaults.allowChange)
        return { session: s, outbox: [{ cid, msg: { t: "ack", askedId, accepted: false, value: previous.value, reason: "Answers can't be changed." } }] };

    const updated: AskedQuestion = {
        ...aq,
        eligible: aq.eligible.includes(cid) ? aq.eligible : [...aq.eligible, cid],
        answers: { ...aq.answers, [cid]: { value: clean, at: now } },
    };
    let next: HostSession = { ...s, asked: s.asked.map(a => (a.id === aq.id ? updated : a)) };
    if (!previous) next = log(next, "question.answered", `${studentName(s, cid)} answered.`, now);
    return { session: next, outbox: [{ cid, msg: { t: "ack", askedId, accepted: true, value: clean } }] };
}

/** Mark who is connected according to the room after the host (re)connects. */
export function reconcilePresence(s: HostSession, connected: string[], now: number): HostSession {
    const set = new Set(connected);
    let next = s;
    for (const st of Object.values(s.students)) {
        if (st.status === "online" && !set.has(st.id)) {
            next = { ...next, students: { ...next.students, [st.id]: { ...st, status: "offline" } } };
            next = log(next, "student.disconnected", `${st.name} disconnected.`, now);
        }
    }
    return next;
}

/* ───────────── LLM bookkeeping ───────────── */

export function llmCheckDueInMs(s: HostSession, now: number): number | null {
    if (!usesLlm(s.config)) return null;
    const llm = effectiveLlm(s.config);
    if (llm.trigger === "manual") return null;
    const interval = Math.max(llm.checkIntervalMin * 60_000, 15_000);
    return Math.max(0, s.llm.lastCheckActiveMs + interval - activeNow(s, now));
}

export function cooldownLeftMs(s: HostSession, now: number): number {
    if (s.llm.lastLlmQuestionActiveMs === null) return 0;
    return Math.max(0, s.llm.lastLlmQuestionActiveMs + s.config.llm.cooldownMin * 60_000 - activeNow(s, now));
}

/* ───────────── What students see ───────────── */

export function buildPublicState(s: HostSession, now: number): PublicState {
    const aq = activeQuestion(s);
    const last = [...s.asked].reverse().find(a => a.closedAt !== null);
    return {
        status: s.status,
        title: s.config.title,
        question: aq ? {
            askedId: aq.id,
            question: toPublicQuestion(aq.question),
            remainingMs: Math.max(0, remainingMs(s, aq, now)),
            durationMs: aq.durationMs,
            allowChange: s.config.defaults.allowChange,
        } : null,
        reveal: !aq && last && s.config.defaults.revealCorrect
            ? { askedId: last.id, text: last.question.text, correctLabel: describeCorrect(last.question) }
            : null,
        report: s.reportShared ? buildReport(s) : null,
    };
}

/** The anonymous report: question texts, distributions and correct answers. No names, ever. */
export function buildReport(s: Pick<HostSession, "asked" | "config" | "endedAt">): Report {
    return {
        title: s.config.title,
        endedAt: s.endedAt,
        questions: s.asked.filter(a => a.closedAt !== null).map(a => {
            const sum = summarize(a);
            return {
                text: a.question.text,
                type: a.question.type,
                correctLabel: describeCorrect(a.question),
                slices: slicesFor(a).map(({ label, count, correct }) => ({ label, count, correct })),
                answered: sum.answered,
                eligible: sum.eligible,
            };
        }),
    };
}

export { isCorrect };
