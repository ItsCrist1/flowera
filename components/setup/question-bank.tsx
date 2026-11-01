"use client";

import { CheckSquare, Hash, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionEditor } from "@/components/setup/question-editor";
import { duplicateQuestion, newQuestion } from "@/lib/session/questions";
import type { Question, QuestionType } from "@/lib/session/types";

const ADD_BUTTONS: { type: QuestionType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { type: "multiple_choice", label: "Multiple choice", icon: ListChecks },
    { type: "true_false", label: "True / false", icon: CheckSquare },
    { type: "number", label: "Number", icon: Hash },
];

/** Kahoot-style list editor for the teacher's own questions. */
export function QuestionBank({ questions, onChange, defaultTimeLimitSec }: {
    questions: Question[];
    onChange: (questions: Question[]) => void;
    defaultTimeLimitSec: number;
}) {
    const update = (i: number, q: Question) => onChange(questions.map((x, k) => (k === i ? q : x)));
    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= questions.length) return;
        const next = [...questions];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    const add = (type: QuestionType) => {
        const q = newQuestion(type);
        onChange([...questions, q]);
        requestAnimationFrame(() => document.getElementById(`q-${q.id}`)?.querySelector("textarea")?.focus());
    };

    const onTimeline = questions.filter(q => q.onTimeline).length;

    return (
        <div className="flex flex-col gap-3">
            {questions.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {questions.length} question{questions.length === 1 ? "" : "s"} · {onTimeline} on the timeline · {questions.length - onTimeline} manual only
                </p>
            )}

            {questions.length === 0 && (
                <div className="grid place-items-center gap-1 border border-dashed p-8 text-center">
                    <p className="text-sm">No questions yet.</p>
                    <p className="text-xs text-muted-foreground">Add one below. You can send any question manually during the session too.</p>
                </div>
            )}

            {questions.map((q, i) => (
                <div key={q.id} id={`q-${q.id}`} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                    <QuestionEditor question={q} index={i} defaultTimeLimitSec={defaultTimeLimitSec}
                                    onChange={nq => update(i, nq)}
                                    onMove={dir => move(i, dir)} canMoveUp={i > 0} canMoveDown={i < questions.length - 1}
                                    onDuplicate={() => onChange([...questions.slice(0, i + 1), duplicateQuestion(q), ...questions.slice(i + 1)])}
                                    onDelete={() => onChange(questions.filter((_, k) => k !== i))}/>
                </div>
            ))}

            <div className="flex flex-wrap gap-2">
                {ADD_BUTTONS.map(b => (
                    <Button key={b.type} variant="outline" className="h-10 flex-1 gap-2 text-sm" onClick={() => add(b.type)}>
                        <b.icon className="size-4"/> {b.label}
                    </Button>
                ))}
            </div>
        </div>
    );
}
