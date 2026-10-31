"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { Check } from "lucide-react";
import { NOT_ANSWERED, type Slice } from "@/lib/session/questions";
import { NOT_ANSWERED_COLOR, OPTION_COLORS, OPTION_SHAPES } from "@/lib/session/colors";
import type { Question } from "@/lib/session/types";
import { cn } from "@/lib/utils";

type ColoredSlice = Slice & { color: string; shape: string | null };

/**
 * Colors follow the entity, never its rank: a single multiple-choice option keeps its option color,
 * True/False and Below/In range/Above have fixed slots, "Not answered" is always gray.
 * Multi-option combinations take the free slots in order; beyond that they fold into "Other".
 */
export function colorSlices(question: Pick<Question, "type"> & { options?: string[] }, slices: Slice[]): ColoredSlice[] {
    const fixed = (key: string): number | null => {
        if (question.type === "true_false") return key === "true" ? 0 : key === "false" ? 1 : null;
        if (question.type === "number") return key === "below" ? 0 : key === "above" ? 1 : key === "in" ? 2 : null;
        if (/^\d+$/.test(key)) return Number(key); // single multiple-choice option
        return null;
    };
    const used = new Set(slices.map(s => fixed(s.key)).filter((x): x is number => x !== null));
    const free = OPTION_COLORS.map((_, i) => i).filter(i => !used.has(i));

    const out: ColoredSlice[] = [];
    const other: ColoredSlice = { key: "__other__", label: "Other combinations", count: 0, correct: false, color: NOT_ANSWERED_COLOR, shape: "…" };
    for (const s of slices) {
        if (s.key === NOT_ANSWERED) {
            out.push({ ...s, color: NOT_ANSWERED_COLOR, shape: null });
            continue;
        }
        let idx = fixed(s.key);
        if (idx === null) idx = free.shift() ?? null;
        if (idx === null || idx >= OPTION_COLORS.length) {
            other.count += s.count;
            continue;
        }
        const isOption = question.type === "multiple_choice" && /^\d+$/.test(s.key);
        out.push({ ...s, color: OPTION_COLORS[idx], shape: isOption ? OPTION_SHAPES[idx] : null });
    }
    if (other.count > 0) out.splice(out.length - (out.at(-1)?.key === NOT_ANSWERED ? 1 : 0), 0, other);
    return out;
}

export function AnswerPie({ question, slices, size = "md", showCorrect = true, className }: {
    question: Pick<Question, "type"> & { options?: string[] };
    slices: Slice[];
    size?: "sm" | "md" | "lg";
    showCorrect?: boolean;
    className?: string;
}) {
    const colored = colorSlices(question, slices);
    const total = colored.reduce((n, s) => n + s.count, 0);
    const px = size === "lg" ? 224 : size === "sm" ? 112 : 160;
    const dims = size === "lg" ? "size-56" : size === "sm" ? "size-28" : "size-40";

    if (total === 0) {
        return (
            <div className={cn("flex items-center gap-4", className)}>
                <div className={cn("grid shrink-0 place-items-center rounded-full border-8 border-dashed border-muted text-xs text-muted-foreground", dims)}>
                    No answers yet
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-wrap items-center gap-4", className)}>
            <div className={cn("shrink-0", dims)} role="img"
                 aria-label={`Answers: ${colored.map(s => `${s.label} ${s.count}`).join(", ")}`}>
                <PieChart width={px} height={px}>
                        <Pie data={colored} dataKey="count" nameKey="label" innerRadius="52%" outerRadius="100%"
                             stroke="var(--card)" strokeWidth={2} isAnimationActive animationDuration={400}
                             startAngle={90} endAngle={-270}>
                            {colored.map(s => <Cell key={s.key} fill={s.color}/>)}
                        </Pie>
                        <Tooltip cursor={false} content={({ active, payload }) => {
                            const p = payload?.[0]?.payload as ColoredSlice | undefined;
                            if (!active || !p) return null;
                            return (
                                <div className="border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                                    <div className="font-medium">{p.label}{showCorrect && p.correct ? " ✓" : ""}</div>
                                    <div className="text-muted-foreground tabular-nums">{p.count} · {Math.round((p.count / total) * 100)}%</div>
                                </div>
                            );
                        }}/>
                </PieChart>
            </div>
            <ul className="flex min-w-40 flex-1 flex-col gap-1.5 text-xs">
                {colored.map(s => (
                    <li key={s.key} className="flex items-center gap-2">
                        <span className="grid size-4 shrink-0 place-items-center text-[9px] text-white" style={{ background: s.color }} aria-hidden>
                            {s.shape}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate", s.key === NOT_ANSWERED && "text-muted-foreground")} title={s.label}>{s.label}</span>
                        {showCorrect && s.correct && <Check className="size-3.5 shrink-0 text-[#0ca30c]" aria-label="correct"/>}
                        <span className="tabular-nums text-muted-foreground">{s.count}</span>
                        <span className="w-9 text-right tabular-nums">{Math.round((s.count / total) * 100)}%</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
