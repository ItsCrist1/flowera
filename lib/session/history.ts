import { z } from "zod";
import { describeCorrect, describeAnswer, slicesFor, summarize } from "./questions";
import { historyEntrySchema, QUESTION_TYPE_LABELS, type HistoryEntry, type HostSession } from "./types";

/*
 * Session history (spec §10). Lives in the teacher's localStorage, names included.
 * Exports are ALWAYS anonymous: student ids are replaced by "Student 1, 2, …" placeholders that
 * can't be linked back, and the name table is dropped.
 */

export const historyListSchema = z.array(historyEntrySchema);

export function toHistoryEntry(s: HostSession): HistoryEntry {
    return {
        version: 1,
        id: s.id,
        title: s.config.title,
        template: s.config.template,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        students: Object.fromEntries(Object.values(s.students).map(st => [st.id, { name: st.name }])),
        asked: s.asked.filter(a => a.closedAt !== null),
        log: s.log,
        analysis: s.analysis,
        imported: false,
    };
}

/** Strip every trace of identity: names, and the per-student ids that could correlate answers. */
export function anonymize(entry: HistoryEntry): HistoryEntry {
    const alias = new Map<string, string>();
    const anon = (cid: string) => {
        if (!alias.has(cid)) alias.set(cid, `s${alias.size + 1}`);
        return alias.get(cid)!;
    };
    // Shuffle the alias order per question so answers can't be linked across questions either.
    return {
        ...entry,
        students: {},
        asked: entry.asked.map(a => {
            alias.clear();
            const ids = [...a.eligible].sort(() => Math.random() - 0.5);
            ids.forEach(anon);
            return {
                ...a,
                eligible: a.eligible.map(anon),
                answers: Object.fromEntries(Object.entries(a.answers).map(([cid, ans]) => [anon(cid), ans])),
            };
        }),
        // The log mentions names; keep only name-free events.
        log: entry.log.filter(l => !l.kind.startsWith("student.") && l.kind !== "question.answered"),
    };
}

export function exportJson(entry: HistoryEntry): string {
    return JSON.stringify({ format: "flowera-session", ...anonymize(entry) }, null, 2);
}

export function importJson(text: string): HistoryEntry {
    const raw = JSON.parse(text);
    const parsed = historyEntrySchema.parse({ ...raw, students: {}, imported: true });
    return anonymize(parsed);
}

function csvCell(v: string | number | null) {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per question: type, text, correct answer, answer counts. No names, no ids. */
export function exportCsv(entry: HistoryEntry): string {
    const rows: (string | number | null)[][] = [[
        "#", "Asked at", "Source", "Type", "Question", "Correct answer", "Eligible", "Answered", "Correct", "Not answered", "Answer distribution",
    ]];
    entry.asked.forEach((a, i) => {
        const sum = summarize(a);
        const dist = slicesFor(a)
            .map(s => `${s.label}: ${s.count}`)
            .join(" | ");
        rows.push([
            i + 1,
            new Date(a.openedAt).toISOString(),
            a.source,
            QUESTION_TYPE_LABELS[a.question.type],
            a.question.text,
            describeCorrect(a.question),
            sum.eligible,
            sum.answered,
            sum.correct,
            sum.eligible - sum.answered,
            dist,
        ]);
    });
    return rows.map(r => r.map(csvCell).join(",")).join("\n");
}

/** Plain-text summary of anonymous aggregates, for the optional end-of-session LLM analysis. */
export function summaryForAnalysis(entry: Pick<HistoryEntry, "asked">): string {
    return entry.asked.map((a, i) => {
        const sum = summarize(a);
        const dist = slicesFor(a).map(s => `${s.label}${s.correct ? " (correct)" : ""}: ${s.count}`).join("; ");
        const minutes = Math.round((a.openedAt - entry.asked[0].openedAt) / 60000);
        return `${i + 1}. [+${minutes} min, ${QUESTION_TYPE_LABELS[a.question.type]}] ${a.question.text}\n   Correct: ${describeCorrect(a.question)} · answered ${sum.answered}/${sum.eligible} · correct ${sum.correct}\n   Answers: ${dist}`;
    }).join("\n");
}

export function download(filename: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileSlug(entry: Pick<HistoryEntry, "title" | "startedAt">) {
    const date = entry.startedAt ? new Date(entry.startedAt).toISOString().slice(0, 10) : "session";
    const title = entry.title.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return `flowera-${date}${title ? `-${title}` : ""}`;
}

export { describeAnswer };
