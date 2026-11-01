"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuestionEditor } from "@/components/setup/question-editor";
import { newQuestion } from "@/lib/session/questions";
import { QUESTION_TYPE_LABELS, type HostSession, type Question } from "@/lib/session/types";
import { timelineQuestions } from "@/lib/session/engine";
import { cn } from "@/lib/utils";

const SOURCE = { manual: "You", timeline: "Timeline", llm: "AI" } as const;

export function QueuePanel({ session, onRemove, onMove }: {
    session: HostSession;
    onRemove: (id: string) => void;
    onMove: (id: string, dir: -1 | 1) => void;
}) {
    if (!session.queue.length) return <p className="text-xs text-muted-foreground">Empty. Questions wait here while another one is open.</p>;
    return (
        <ol className="flex flex-col gap-1">
            {session.queue.map((item, i) => (
                <li key={item.id} className="flex items-center gap-2 border px-2 py-1.5 text-sm animate-in fade-in-0">
                    <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{item.question.text || "Untitled"}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{SOURCE[item.source]}</span>
                    <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => onMove(item.id, -1)}><ArrowUp/></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === session.queue.length - 1} onClick={() => onMove(item.id, 1)}><ArrowDown/></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Remove from queue" onClick={() => onRemove(item.id)}><X/></Button>
                </li>
            ))}
        </ol>
    );
}

/** The teacher's pre-written questions, each sendable at any time, plus a quick ad-hoc question. */
export function BankPanel({ session, onSend }: { session: HostSession; onSend: (q: Question) => void }) {
    const [draft, setDraft] = useState<Question | null>(null);
    const sentIds = new Set(session.asked.map(a => a.question.id).concat(session.queue.map(q => q.question.id)));
    const nextTimelineId = timelineQuestions(session).slice(session.timeline.nextIndex).find(q => !sentIds.has(q.id))?.id;

    return (
        <div className="flex flex-col gap-2">
            {session.config.questions.length === 0 && <p className="text-xs text-muted-foreground">No pre-written questions.</p>}
            <ul className="flex flex-col gap-1">
                {session.config.questions.map((q, i) => {
                    const sent = sentIds.has(q.id);
                    return (
                        <li key={q.id} className={cn("flex items-center gap-2 border px-2 py-1.5 text-sm", sent && "opacity-60")}>
                            <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                            <span className="min-w-0 flex-1 truncate" title={q.text}>{q.text || "Untitled"}</span>
                            <span className="hidden shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                                {q.id === nextTimelineId ? "next on timeline" : q.onTimeline ? (sent ? "sent" : "timeline") : sent ? "sent" : "manual"}
                            </span>
                            <Button size="xs" variant={sent ? "ghost" : "outline"} onClick={() => onSend(q)}>
                                <Send/> {sent ? "Again" : "Send"}
                            </Button>
                        </li>
                    );
                })}
            </ul>
            <Button variant="outline" size="sm" className="self-start" onClick={() => setDraft(newQuestion("multiple_choice", false))}>
                <Plus/> Quick question
            </Button>

            <Dialog open={draft !== null} onOpenChange={o => !o && setDraft(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader><DialogTitle>Quick question</DialogTitle></DialogHeader>
                    {draft && <QuestionEditor question={draft} onChange={setDraft} standalone defaultTimeLimitSec={session.config.defaults.timeLimitSec}/>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                        <Button disabled={!draft?.text.trim() || (draft?.type === "multiple_choice" && draft.options.some(o => !o.trim()))}
                                onClick={() => {
                                    if (draft) onSend(draft);
                                    setDraft(null);
                                }}>
                            <Send/> Send {draft ? QUESTION_TYPE_LABELS[draft.type].toLowerCase() : ""}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
