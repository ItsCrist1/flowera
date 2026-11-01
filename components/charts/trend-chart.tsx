"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { summarize } from "@/lib/session/questions";
import type { AskedQuestion } from "@/lib/session/types";

/**
 * How understanding evolved over the lesson: share of the class that answered correctly, and share
 * that answered at all, per question in the order asked. Both are percentages → one shared axis.
 */
export function TrendChart({ asked, height = 220 }: { asked: AskedQuestion[]; height?: number }) {
    const data = asked.filter(a => a.closedAt !== null).map((a, i) => {
        const s = summarize(a);
        return {
            n: i + 1,
            label: a.question.text,
            correct: s.correctRate === null ? null : Math.round(s.correctRate * 100),
            participation: s.participation === null ? null : Math.round(s.participation * 100),
        };
    });

    if (data.length < 2) {
        return <p className="text-xs text-muted-foreground">The trend appears after two questions have closed.</p>;
    }

    return (
        <div className="flex flex-col gap-2">
            <ul className="flex gap-4 text-xs" aria-hidden>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--series-1)]"/>Answered correctly</li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-[var(--series-2)]"/>Answered at all</li>
            </ul>
            <div style={{ height }} role="img"
                 aria-label={`Trend: ${data.map(d => `question ${d.n}: ${d.correct}% correct, ${d.participation}% answered`).join("; ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false}/>
                        <XAxis dataKey="n" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                               tickFormatter={n => `Q${n}`}/>
                        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false}
                               tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={v => `${v}%`}/>
                        <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={({ active, payload }) => {
                            const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                            if (!active || !p) return null;
                            return (
                                <div className="max-w-64 border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                                    <div className="mb-1 font-medium">Q{p.n}. {p.label}</div>
                                    <div className="tabular-nums">{p.correct}% correct · {p.participation}% answered</div>
                                </div>
                            );
                        }}/>
                        <Line type="monotone" dataKey="correct" stroke="var(--series-1)" strokeWidth={2}
                              dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--series-1)" }} activeDot={{ r: 5 }} isAnimationActive={false}/>
                        <Line type="monotone" dataKey="participation" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4"
                              dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--series-2)" }} activeDot={{ r: 5 }} isAnimationActive={false}/>
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
