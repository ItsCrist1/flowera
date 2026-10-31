"use client";

import { AnswerPie } from "@/components/charts/answer-pie";
import { describeCorrect, slicesFor, summarize } from "@/lib/session/questions";
import { QUESTION_TYPE_LABELS, type AskedQuestion } from "@/lib/session/types";
import { formatTime } from "@/lib/format";

/** Closed questions with their class-level answer distribution. Nothing per student. */
export function ResultsList({ asked, compact }: { asked: AskedQuestion[]; compact?: boolean }) {
    const closed = asked.filter(a => a.closedAt !== null);
    if (!closed.length) return <p className="text-xs text-muted-foreground">No closed questions yet.</p>;
    return (
        <ol className="flex flex-col gap-3">
            {[...closed].reverse().map(a => {
                const i = closed.indexOf(a);
                const s = summarize(a);
                return (
                    <li key={a.id} className="flex flex-col gap-3 border p-4">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="text-xs tabular-nums text-muted-foreground">Q{i + 1} · {formatTime(a.openedAt)}</span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {QUESTION_TYPE_LABELS[a.question.type]} · {a.source === "llm" ? "AI" : a.source}
                            </span>
                            <span className="ml-auto text-xs tabular-nums">
                                {s.answered}/{s.eligible} answered{s.eligible ? ` · ${Math.round((s.correct / s.eligible) * 100)}% correct` : ""}
                            </span>
                        </div>
                        <p className="text-sm font-medium">{a.question.text}</p>
                        <AnswerPie question={a.question} slices={slicesFor(a)} size={compact ? "sm" : "md"}/>
                        <p className="text-xs text-muted-foreground">Correct: <span className="text-foreground">{describeCorrect(a.question)}</span></p>
                    </li>
                );
            })}
        </ol>
    );
}
