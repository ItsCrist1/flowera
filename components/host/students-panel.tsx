"use client";

import type { AskedQuestion, Student } from "@/lib/session/types";
import { cn } from "@/lib/utils";

const STATUS: Record<Student["status"], { dot: string; label: string }> = {
    online: { dot: "bg-[#0ca30c]", label: "connected" },
    offline: { dot: "bg-[#fab219] animate-pulse", label: "reconnecting" },
    left: { dot: "bg-muted-foreground/40", label: "left" },
};

/** Who's in the room. With answers shown, also who has answered the open question (never what). */
export function StudentsPanel({ students, active, showAnswers }: {
    students: Record<string, Student>;
    active: AskedQuestion | null;
    showAnswers: boolean;
}) {
    const list = Object.values(students).sort((a, b) =>
        (a.status === "left" ? 1 : 0) - (b.status === "left" ? 1 : 0) || a.name.localeCompare(b.name));
    const online = list.filter(s => s.status === "online").length;

    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                {online} connected{list.length - online > 0 ? ` · ${list.length - online} away or left` : ""}
            </p>
            {list.length === 0 ? (
                <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">No students yet. Share the PIN or QR code.</p>
            ) : (
                <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                    {list.map(s => {
                        const answered = active ? Boolean(active.answers[s.id]) : false;
                        return (
                            <li key={s.id} className={cn("flex items-center gap-2 border px-2 py-1.5 text-xs", s.status === "left" && "opacity-50")}
                                title={STATUS[s.status].label}>
                                <span className={cn("size-2 shrink-0 rounded-full", STATUS[s.status].dot)} aria-label={STATUS[s.status].label}/>
                                <span className="min-w-0 flex-1 truncate">{showAnswers ? s.name : "•••"}</span>
                                {active && active.eligible.includes(s.id) && (
                                    <span className={cn("shrink-0 text-[10px] uppercase tracking-wide", answered ? "text-[#0ca30c]" : "text-muted-foreground")}>
                                        {answered ? "answered" : "…"}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {!showAnswers && list.length > 0 && <p className="text-[11px] text-muted-foreground">Names are hidden while “Show answers” is off.</p>}
        </div>
    );
}
