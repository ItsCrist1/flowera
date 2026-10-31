import { id, type AnswerValue, type AskedQuestion, type PublicQuestion, type Question, type QuestionType } from "@/lib/session/types";

/* ───────────── Creation ───────────── */

export function newQuestion(type: QuestionType, onTimeline = true): Question {
    const base = { id: id(), text: "", timeLimitSec: null, onTimeline };
    switch (type) {
        case "multiple_choice":
            return { ...base, type, options: ["", ""], correct: [0] };
        case "true_false":
            return { ...base, type, correct: true };
        case "number":
            return { ...base, type, inputMin: null, inputMax: null, correctMin: 0, correctMax: 0 };
    }
}

/** Convert a question to another type, keeping its text and timing. */
export function changeQuestionType(q: Question, type: QuestionType): Question {
    if (q.type === type) return q;
    const next = newQuestion(type, q.onTimeline);
    return { ...next, id: q.id, text: q.text, timeLimitSec: q.timeLimitSec };
}

export function duplicateQuestion(q: Question): Question {
    return { ...structuredClone(q), id: id() };
}

/* ───────────── Grading ───────────── */

export function isCorrect(q: Question, a: AnswerValue): boolean {
    switch (q.type) {
        case "multiple_choice":
            if (a.type !== "multiple_choice") return false;
            return sameSet(q.correct, a.selected);
        case "true_false":
            return a.type === "true_false" && a.value === q.correct;
        case "number":
            return a.type === "number" && a.value >= q.correctMin && a.value <= q.correctMax;
    }
}

function sameSet(a: number[], b: number[]) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(x => s.has(x));
}

/** Validate a student's answer against what the question allows. Returns a cleaned value or null. */
export function sanitizeAnswer(q: PublicQuestion | Question, a: AnswerValue): AnswerValue | null {
    if (a.type !== q.type) return null;
    switch (a.type) {
        case "multiple_choice": {
            const opts = (q as { options: string[] }).options.length;
            const selected = [...new Set(a.selected)].filter(i => i >= 0 && i < opts).sort((x, y) => x - y);
            return selected.length ? { type: "multiple_choice", selected } : null;
        }
        case "true_false":
            return a;
        case "number": {
            if (!Number.isFinite(a.value)) return null;
            const nq = q as { inputMin: number | null; inputMax: number | null };
            if (nq.inputMin !== null && a.value < nq.inputMin) return null;
            if (nq.inputMax !== null && a.value > nq.inputMax) return null;
            return a;
        }
    }
}

/* ───────────── Display ───────────── */

export function formatNumber(n: number) {
    return Number.isInteger(n) ? n.toString() : n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function describeCorrect(q: Question): string {
    switch (q.type) {
        case "multiple_choice":
            return q.correct.map(i => q.options[i]).filter(Boolean).join(" + ");
        case "true_false":
            return q.correct ? "True" : "False";
        case "number":
            return q.correctMin === q.correctMax ? formatNumber(q.correctMin) : `${formatNumber(q.correctMin)} – ${formatNumber(q.correctMax)}`;
    }
}

export function describeAnswer(q: PublicQuestion | Question, a: AnswerValue): string {
    switch (a.type) {
        case "multiple_choice": {
            const options = (q as { options?: string[] }).options ?? [];
            return a.selected.map(i => options[i] ?? `#${i + 1}`).join(" + ");
        }
        case "true_false":
            return a.value ? "True" : "False";
        case "number":
            return formatNumber(a.value);
    }
}

/* ───────────── Statistics (never per student) ───────────── */

export type Slice = { key: string; label: string; count: number; correct: boolean | null };

export const NOT_ANSWERED = "__not_answered__";

/**
 * Pie slices for one asked question. Multiple choice gets one slice per distinct combination
 * students submitted (students can tick several options, so per-option counts wouldn't sum to a whole).
 */
export function slicesFor(aq: Pick<AskedQuestion, "question" | "answers" | "eligible">): Slice[] {
    const q = aq.question;
    const answers = Object.values(aq.answers);
    const answeredIds = new Set(Object.keys(aq.answers));
    const notAnswered = aq.eligible.filter(s => !answeredIds.has(s)).length;
    const slices = new Map<string, Slice>();

    const bump = (key: string, label: string, correct: boolean | null) => {
        const s = slices.get(key) ?? { key, label, count: 0, correct };
        s.count++;
        slices.set(key, s);
    };

    switch (q.type) {
        case "multiple_choice":
            for (const { value } of answers) {
                if (value.type !== "multiple_choice") continue;
                bump(value.selected.join(","), describeAnswer(q, value), isCorrect(q, value));
            }
            break;
        case "true_false":
            for (const { value } of answers) {
                if (value.type !== "true_false") continue;
                bump(String(value.value), value.value ? "True" : "False", value.value === q.correct);
            }
            break;
        case "number":
            for (const { value } of answers) {
                if (value.type !== "number") continue;
                if (value.value < q.correctMin) bump("below", `Below ${formatNumber(q.correctMin)}`, false);
                else if (value.value > q.correctMax) bump("above", `Above ${formatNumber(q.correctMax)}`, false);
                else bump("in", `In range (${describeCorrect(q)})`, true);
            }
            break;
    }

    const list = [...slices.values()].sort((a, b) => b.count - a.count);
    if (notAnswered > 0) list.push({ key: NOT_ANSWERED, label: "Not answered", count: notAnswered, correct: null });
    return list;
}

export type QuestionSummary = {
    eligible: number;
    answered: number;
    correct: number;
    /** Share of eligible students who answered correctly (0..1), or null with no eligible students. */
    correctRate: number | null;
    participation: number | null;
};

export function summarize(aq: Pick<AskedQuestion, "question" | "answers" | "eligible">): QuestionSummary {
    const answers = Object.values(aq.answers);
    const correct = answers.filter(a => isCorrect(aq.question, a.value)).length;
    const eligible = Math.max(aq.eligible.length, answers.length);
    return {
        eligible,
        answered: answers.length,
        correct,
        correctRate: eligible ? correct / eligible : null,
        participation: eligible ? answers.length / eligible : null,
    };
}
