"use client";

import { EyeOff, SkipForward, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerPie } from "@/components/charts/answer-pie";
import { describeAnswer, describeCorrect, slicesFor, summarize } from "@/lib/session/questions";
import { OPTION_COLORS, OPTION_SHAPES } from "@/lib/session/colors";
import { QUESTION_TYPE_LABELS, type AskedQuestion, type HostSession } from "@/lib/session/types";
import * as E from "@/lib/session/engine";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = { manual: "Sent by you", timeline: "Timeline", llm: "AI" } as const;

export function ActiveQuestion({ session, aq, now, onClose }: { session: HostSession; aq: AskedQuestion; now: number; onClose: () => void }) {
    const left = E.remainingMs(session, aq, now);
    const pct = Math.max(0, Math.min(100, (left / aq.durationMs) * 100));
    const sum = summarize(aq);
    const q = aq.question;
    const show = session.showAnswers;
    const paused = session.status === "paused";

    return (
        <div className="flex flex-col gap-4 border bg-card p-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="border px-1.5 py-0.5 uppercase tracking-wide">{QUESTION_TYPE_LABELS[q.type]}</span>
                <span className="border px-1.5 py-0.5 uppercase tracking-wide">{SOURCE_LABEL[aq.source]}</span>
                <span className="ml-auto flex items-center gap-1.5 text-sm tabular-nums text-foreground">
                    <Timer className="size-4"/>{paused ? "paused" : formatClock(left)}
                </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-label="Time left">
                <div className={cn("h-full transition-[width] duration-300 ease-linear", pct < 20 ? "bg-[#d03b3b]" : "bg-primary")} style={{ width: `${pct}%` }}/>
            </div>
            <h2 className="text-xl font-semibold leading-snug">{q.text || "Untitled question"}</h2>

            {q.type === "multiple_choice" && (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {q.options.map((o, i) => (
                        <li key={i} className="flex items-center gap-2 border px-2 py-1.5 text-sm" style={{ borderLeft: `4px solid ${OPTION_COLORS[i]}` }}>
                            <span style={{ color: OPTION_COLORS[i] }} aria-hidden>{OPTION_SHAPES[i]}</span>{o}
                            {show && q.correct.includes(i) && <span className="ml-auto text-xs text-[#0ca30c]">✓</span>}
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex items-end justify-between gap-4">
                <div className="flex flex-col">
                    <span className="text-4xl font-semibold tabular-nums">{sum.answered}<span className="text-xl text-muted-foreground">/{sum.eligible}</span></span>
                    <span className="text-xs text-muted-foreground">answered</span>
                </div>
                <Button variant="outline" onClick={onClose}><SkipForward/> Close now</Button>
            </div>

            {show ? (
                <div className="flex flex-col gap-3 border-t pt-4">
                    <AnswerPie question={q} slices={slicesFor(aq)} size="md"/>
                    <p className="text-xs text-muted-foreground">Correct: <span className="text-foreground">{describeCorrect(q)}</span></p>
                    <AnswerList session={session} aq={aq}/>
                </div>
            ) : (
                <p className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <EyeOff className="size-4"/> Results are hidden. Turn on “Show answers” when the screen isn&apos;t shared.
                </p>
            )}
        </div>
    );
}

/** Who answered what. Only on the teacher's screen, only with “Show answers” on. */
function AnswerList({ session, aq }: { session: HostSession; aq: AskedQuestion }) {
    const rows = Object.entries(aq.answers).sort((a, b) => a[1].at - b[1].at);
    if (!rows.length) return null;
    return (
        <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Individual answers ({rows.length})</summary>
            <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                {rows.map(([cid, a]) => (
                    <li key={cid} className="flex justify-between gap-2 border px-2 py-1">
                        <span className="truncate">{session.students[cid]?.name ?? "Student"}</span>
                        <span className={cn("truncate", E.isCorrect(aq.question, a.value) ? "text-[#0ca30c]" : "text-muted-foreground")}>
                            {describeAnswer(aq.question, a.value)}
                        </span>
                    </li>
                ))}
            </ul>
        </details>
    );
}
