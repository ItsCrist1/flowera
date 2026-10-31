"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, CircleHelp, Mic, Power, ThumbsUp, User } from "lucide-react";
import type { LogEntry, LogKind } from "@/lib/session/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Group = "students" | "questions" | "ai" | "approval" | "audio" | "session";

const GROUPS: Record<Group, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
    students: { label: "Students", icon: User, className: "text-[var(--series-1)]" },
    questions: { label: "Questions", icon: CircleHelp, className: "text-[var(--series-3)]" },
    ai: { label: "AI", icon: Bot, className: "text-[var(--series-7)]" },
    approval: { label: "Approvals", icon: ThumbsUp, className: "text-[var(--series-4)]" },
    audio: { label: "Audio", icon: Mic, className: "text-[var(--series-2)]" },
    session: { label: "Session", icon: Power, className: "text-muted-foreground" },
};

function groupOf(kind: LogKind): Group {
    if (kind.startsWith("student.")) return "students";
    if (kind.startsWith("question.")) return "questions";
    if (kind.startsWith("llm.")) return "ai";
    if (kind.startsWith("approval.")) return "approval";
    if (kind.startsWith("asr.")) return "audio";
    return "session";
}

const WARN: LogKind[] = ["llm.error", "asr.warning", "student.disconnected", "approval.timeout"];

/** Accumulating, color-coded event log (spec §4). Filter chips per group; auto-scrolls unless you scrolled up. */
export function EventLog({ log, className }: { log: LogEntry[]; className?: string }) {
    const [hidden, setHidden] = useState<Set<Group>>(new Set());
    const scroller = useRef<HTMLDivElement>(null);
    const stick = useRef(true);
    const shown = useMemo(() => log.filter(l => !hidden.has(groupOf(l.kind))), [log, hidden]);

    useEffect(() => {
        const el = scroller.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [shown.length]);

    return (
        <div className={cn("flex min-h-0 flex-col gap-2", className)}>
            <div className="flex flex-wrap gap-1">
                {(Object.keys(GROUPS) as Group[]).map(g => {
                    const G = GROUPS[g];
                    const off = hidden.has(g);
                    return (
                        <button key={g} type="button" aria-pressed={!off}
                                onClick={() => setHidden(h => {
                                    const n = new Set(h);
                                    if (off) n.delete(g); else n.add(g);
                                    return n;
                                })}
                                className={cn("flex cursor-pointer items-center gap-1 border px-1.5 py-0.5 text-[11px] transition-opacity",
                                    off ? "opacity-40" : "bg-muted/50")}>
                            <G.icon className={cn("size-3", G.className)}/> {G.label}
                        </button>
                    );
                })}
            </div>
            <div ref={scroller} onScroll={e => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }} className="min-h-0 flex-1 overflow-y-auto border bg-muted/20 font-mono text-[11px] leading-relaxed" role="log" aria-live="polite">
                {shown.length === 0 && <p className="p-3 text-muted-foreground">Nothing yet.</p>}
                {shown.map(l => {
                    const G = GROUPS[groupOf(l.kind)];
                    const warn = WARN.includes(l.kind);
                    return (
                        <div key={l.id} className={cn("flex gap-2 border-b border-border/50 px-2 py-1 last:border-b-0", warn && "bg-[#fab219]/10")}>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{formatTime(l.at)}</span>
                            {warn ? <AlertTriangle className="mt-0.5 size-3 shrink-0 text-[#ec835a]"/> : <G.icon className={cn("mt-0.5 size-3 shrink-0", G.className)}/>}
                            <span className="min-w-0 break-words">{l.message}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
