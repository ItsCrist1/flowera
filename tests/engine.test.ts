import { describe, expect, it } from "vitest";
import * as E from "@/lib/session/engine";
import { createHostSession } from "@/lib/session/create";
import { createDefaultConfig } from "@/lib/session/templates";
import { newQuestion } from "@/lib/session/questions";
import type { HostSession, Question } from "@/lib/session/types";
import type { StudentEvent } from "@/lib/session/protocol";

const T0 = 1_700_000_000_000;

function tf(text: string, onTimeline = true): Question {
    return { ...newQuestion("true_false", onTimeline), text, correct: true } as Question;
}

function session(questions: Question[] = [], patch: Partial<HostSession["config"]> = {}): HostSession {
    const config = { ...createDefaultConfig("hardcoded"), questions, timelineIntervalMin: 5, ...patch };
    return createHostSession(config);
}

let seq = 0;
function hello(s: HostSession, cid: string, name = cid, at = T0) {
    const ev: StudentEvent = { t: "hello", seq: ++seq, cid, name, at };
    return E.applyStudentEvent(s, ev, at).session;
}

describe("clock", () => {
    it("freezes active time while paused", () => {
        let s = E.start(session(), T0);
        expect(E.activeNow(s, T0 + 10_000)).toBe(10_000);
        s = E.pause(s, T0 + 10_000, "manual");
        expect(E.activeNow(s, T0 + 60_000)).toBe(10_000);
        s = E.resume(s, T0 + 60_000);
        expect(E.activeNow(s, T0 + 65_000)).toBe(15_000);
    });

    it("recovers a reloaded session as paused at the last heartbeat", () => {
        let s = E.start(session(), T0);
        s = E.tick(s, T0 + 30_000); // heartbeat at +30 s
        const r = E.recoverAfterReload(s, T0 + 600_000);
        expect(r.status).toBe("paused");
        expect(r.pauseReason).toBe("disconnect");
        expect(r.activeMs).toBe(30_000);
    });
});

describe("questions and timers", () => {
    it("closes a question when its time runs out, pauses excluded", () => {
        let s = E.start(hello(session(), "a"), T0);
        s = E.openNext(E.enqueue(s, tf("Q"), "manual", T0), T0);
        const aq = E.activeQuestion(s)!;
        expect(aq.durationMs).toBe(60_000);
        s = E.pause(s, T0 + 30_000, "manual");
        s = E.tick(E.resume(s, T0 + 500_000), T0 + 500_000);
        expect(E.activeQuestion(s)).not.toBeNull(); // 30 s left after the pause
        s = E.tick(s, T0 + 530_001);
        expect(E.activeQuestion(s)).toBeNull();
        expect(s.asked[0].closedAt).not.toBeNull();
    });

    it("closes early once every connected student has answered", () => {
        let s = E.start(hello(hello(session(), "a"), "b"), T0);
        s = E.openNext(E.enqueue(s, tf("Q"), "manual", T0), T0);
        const id = s.activeId!;
        s = E.recordAnswer(s, "a", id, { type: "true_false", value: true }, T0 + 1000).session;
        expect(E.tick(s, T0 + 1500).activeId).toBe(id);
        s = E.recordAnswer(s, "b", id, { type: "true_false", value: false }, T0 + 2000).session;
        expect(E.tick(s, T0 + 2500).activeId).toBeNull();
    });

    it("queues questions while one is open and opens them in order", () => {
        let s = E.start(hello(session(), "a"), T0);
        s = E.openNext(E.enqueue(s, tf("first"), "manual", T0), T0);
        s = E.openNext(E.enqueue(s, tf("second"), "manual", T0), T0);
        expect(s.queue).toHaveLength(1);
        s = E.closeActive(s, T0 + 5000);
        s = E.openNext(s, T0 + 5000);
        expect(E.activeQuestion(s)?.question.text).toBe("second");
    });

    it("refuses answers after time is up (beyond the grace period) and changes when not allowed", () => {
        let s = E.start(hello(session([], { defaults: { timeLimitSec: 60, allowChange: false, revealCorrect: false, closeWhenAllAnswered: false } }), "a"), T0);
        s = E.openNext(E.enqueue(s, tf("Q"), "manual", T0), T0);
        const id = s.activeId!;
        const first = E.recordAnswer(s, "a", id, { type: "true_false", value: true }, T0 + 1000);
        expect(first.outbox[0].msg).toMatchObject({ t: "ack", accepted: true });
        const change = E.recordAnswer(first.session, "a", id, { type: "true_false", value: false }, T0 + 2000);
        expect(change.outbox[0].msg).toMatchObject({ t: "ack", accepted: false });
        const closed = E.closeActive(first.session, T0 + 3000);
        const late = E.recordAnswer(closed, "b", id, { type: "true_false", value: true }, T0 + 3000 + E.ANSWER_GRACE_MS + 1);
        expect(late.outbox[0].msg).toMatchObject({ t: "ack", accepted: false });
    });

    it("rejects answers outside a number question's input limit", () => {
        const q: Question = { ...newQuestion("number"), text: "n", inputMin: 0, inputMax: 10, correctMin: 2, correctMax: 2 } as Question;
        let s = E.start(hello(session(), "a"), T0);
        s = E.openNext(E.enqueue(s, q, "manual", T0), T0);
        const r = E.recordAnswer(s, "a", s.activeId!, { type: "number", value: 42 }, T0 + 1000);
        expect(r.outbox[0].msg).toMatchObject({ accepted: false });
    });
});

describe("timeline", () => {
    it("fires on-timeline questions in order every interval and skips manual-only ones", () => {
        const qs = [tf("one"), tf("manual", false), tf("two")];
        let s = E.start(hello(session(qs), "a"), T0);
        s = E.tick(s, T0 + 4 * 60_000);
        expect(s.activeId).toBeNull();
        s = E.tick(s, T0 + 5 * 60_000);
        expect(E.activeQuestion(s)?.question.text).toBe("one");
        s = E.closeActive(s, T0 + 6 * 60_000);
        s = E.tick(s, T0 + 10 * 60_000);
        expect(E.activeQuestion(s)?.question.text).toBe("two");
        expect(E.nextTimelineDueInMs(s, T0 + 10 * 60_000)).toBeNull();
    });

    it("skips timeline questions the teacher already sent manually", () => {
        const one = tf("one"), two = tf("two");
        let s = E.start(hello(session([one, two]), "a"), T0);
        s = E.openNext(E.enqueue(s, one, "manual", T0), T0);
        s = E.closeActive(s, T0 + 1000);
        s = E.tick(s, T0 + 5 * 60_000);
        expect(E.activeQuestion(s)?.question.text).toBe("two");
    });

    it("marks that a teacher question went out since the last AI check", () => {
        let s = E.start(session(), T0);
        expect(s.llm.teacherQuestionSinceCheck).toBe(false);
        s = E.enqueue(s, tf("x"), "manual", T0);
        expect(s.llm.teacherQuestionSinceCheck).toBe(true);
    });
});

describe("students", () => {
    it("ignores replayed room events", () => {
        let s = session();
        const ev: StudentEvent = { t: "hello", seq: 7, cid: "a", name: "Ana", at: T0 };
        s = E.applyStudentEvent(s, ev, T0).session;
        s = E.applyStudentEvent(s, { ...ev, name: "Changed" }, T0).session;
        expect(s.students.a.name).toBe("Ana");
    });

    it("tracks leave, disconnect and reconnect", () => {
        let s = hello(session(), "a", "Ana");
        s = E.applyStudentEvent(s, { t: "disconnect", seq: ++seq, cid: "a", at: T0 }, T0).session;
        expect(s.students.a.status).toBe("offline");
        s = hello(s, "a", "Ana");
        expect(s.students.a.status).toBe("online");
        s = E.applyStudentEvent(s, { t: "leave", seq: ++seq, cid: "a", at: T0 }, T0).session;
        expect(s.students.a.status).toBe("left");
    });

    it("lets a late joiner answer the open question and restores a submitted answer on reconnect", () => {
        let s = E.start(hello(session(), "a"), T0);
        s = E.openNext(E.enqueue(s, tf("Q"), "manual", T0), T0);
        s = hello(s, "late");
        expect(E.activeQuestion(s)?.eligible).toContain("late");
        s = E.recordAnswer(s, "late", s.activeId!, { type: "true_false", value: true }, T0).session;
        const step = E.applyStudentEvent(s, { t: "hello", seq: ++seq, cid: "late", name: "late", at: T0 }, T0);
        expect(step.outbox.some(o => o.msg.t === "ack" && o.msg.accepted)).toBe(true);
    });
});

describe("public state", () => {
    it("never leaks correct answers while a question is open", () => {
        let s = E.start(hello(session(), "a"), T0);
        s = E.openNext(E.enqueue(s, tf("Q"), "manual", T0), T0);
        const pub = E.buildPublicState(s, T0 + 1000);
        expect(JSON.stringify(pub)).not.toMatch(/"correct"/);
        expect(pub.question?.remainingMs).toBe(59_000);
    });

    it("reveals the last answer only when enabled", () => {
        const base = session([], { defaults: { timeLimitSec: 60, allowChange: true, revealCorrect: true, closeWhenAllAnswered: true } });
        let s = E.start(hello(base, "a"), T0);
        s = E.closeActive(E.openNext(E.enqueue(s, tf("Q"), "manual", T0), T0), T0 + 1000);
        expect(E.buildPublicState(s, T0 + 1000).reveal?.correctLabel).toBe("True");
    });
});
