import { describe, expect, it } from "vitest";
import { anonymize, exportCsv, exportJson, importJson } from "@/lib/session/history";
import { extractJson } from "@/lib/llm/client";
import { isCorrect, slicesFor } from "@/lib/session/questions";
import type { HistoryEntry, Question } from "@/lib/session/types";

const mc: Question = { id: "q1", type: "multiple_choice", text: "Pick", options: ["A", "B", "C"], correct: [0, 1], timeLimitSec: null, onTimeline: false };

const entry: HistoryEntry = {
    version: 1,
    id: "s1",
    title: "Test",
    template: "hardcoded",
    startedAt: 1,
    endedAt: 2,
    students: { "cid-ana": { name: "Ana" }, "cid-bob": { name: "Bob" } },
    asked: [{
        id: "a1", question: mc, source: "manual", openedAt: 1, openedActiveMs: 0, durationMs: 60_000, closedAt: 2,
        eligible: ["cid-ana", "cid-bob"],
        answers: { "cid-ana": { value: { type: "multiple_choice", selected: [0, 1] }, at: 1 } },
    }],
    log: [
        { id: "l1", at: 1, kind: "student.joined", message: "Ana joined." },
        { id: "l2", at: 1, kind: "question.sent", message: "Sent: Pick" },
    ],
    analysis: null,
    imported: false,
};

describe("exports are anonymous", () => {
    it("drops names, student ids and name-bearing log lines", () => {
        const text = exportJson(entry);
        expect(text).not.toMatch(/Ana|Bob|cid-/);
        const a = anonymize(entry);
        expect(a.students).toEqual({});
        expect(a.log.map(l => l.kind)).toEqual(["question.sent"]);
        expect(Object.keys(a.asked[0].answers)).toHaveLength(1);
    });

    it("CSV has one row per question and no names", () => {
        const csv = exportCsv(entry);
        expect(csv.split("\n")).toHaveLength(2);
        expect(csv).not.toMatch(/Ana|Bob|cid-/);
        expect(csv).toContain("A + B: 1");
    });

    it("round-trips through import as an anonymous, imported entry", () => {
        const back = importJson(exportJson(entry));
        expect(back.imported).toBe(true);
        expect(back.asked[0].question.text).toBe("Pick");
    });
});

describe("grading and slices", () => {
    it("multiple choice is correct only for the exact set", () => {
        expect(isCorrect(mc, { type: "multiple_choice", selected: [0, 1] })).toBe(true);
        expect(isCorrect(mc, { type: "multiple_choice", selected: [0] })).toBe(false);
        expect(isCorrect(mc, { type: "multiple_choice", selected: [0, 1, 2] })).toBe(false);
    });

    it("pie slices include not-answered students", () => {
        const slices = slicesFor(entry.asked[0]);
        expect(slices.map(s => [s.label, s.count])).toEqual([["A + B", 1], ["Not answered", 1]]);
    });
});

describe("extractJson tolerates model chatter", () => {
    it.each([
        ['{"ask": false}', { ask: false }],
        ['```json\n{"ask": true, "q": 1}\n```', { ask: true, q: 1 }],
        ['<think>hmm {not json}</think>Sure! {"ask": false, "reason": "a } brace"} done', { ask: false, reason: "a } brace" }],
    ])("parses %s", (input, expected) => {
        expect(extractJson(input)).toEqual(expected);
    });

    it("throws when there is no JSON", () => {
        expect(() => extractJson("no idea")).toThrow();
    });
});
