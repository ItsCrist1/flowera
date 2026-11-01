"use client";

import { useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/common/number-input";
import { OPTION_COLORS, OPTION_SHAPES } from "@/lib/session/colors";
import type { LiveQuestion } from "@/lib/session/protocol";
import type { AnswerValue } from "@/lib/session/types";
import type { AnswerStatus } from "@/components/student/use-student-room";
import { cn } from "@/lib/utils";

/** The answer UI for one open question. Students tick, then submit (true/false submits on tap). */
export function AnswerForm({ q, status, disabled, onSubmit }: {
    q: LiveQuestion;
    status: AnswerStatus | null;
    disabled: boolean;
    onSubmit: (v: AnswerValue) => void;
}) {
    const submitted = status?.askedId === q.askedId && status.state === "accepted" ? status.value : null;
    const sending = status?.askedId === q.askedId && status.state === "sending";
    const locked = disabled || sending || (submitted !== null && !q.allowChange);

    if (q.question.type === "multiple_choice")
        return <MultipleChoice key={q.askedId} options={q.question.options} submitted={submitted} locked={locked} sending={sending} onSubmit={onSubmit}/>;
    if (q.question.type === "true_false")
        return <TrueFalse submitted={submitted} locked={locked} sending={sending} onSubmit={onSubmit}/>;
    return <NumberAnswer key={q.askedId} min={q.question.inputMin} max={q.question.inputMax} submitted={submitted} locked={locked} sending={sending} onSubmit={onSubmit}/>;
}

type Common = { submitted: AnswerValue | null; locked: boolean; sending: boolean; onSubmit: (v: AnswerValue) => void };

function SubmitButton({ disabled, sending, submitted, label = "Submit" }: { disabled: boolean; sending: boolean; submitted: boolean; label?: string }) {
    return (
        <Button type="submit" disabled={disabled} className="h-14 w-full text-base">
            {sending ? <Loader2 className="animate-spin"/> : submitted ? <Check/> : <Send/>}
            {sending ? "Sending…" : submitted ? "Update answer" : label}
        </Button>
    );
}

function MultipleChoice({ options, submitted, locked, sending, onSubmit }: Common & { options: string[] }) {
    const initial = submitted?.type === "multiple_choice" ? submitted.selected : [];
    const [selected, setSelected] = useState<number[]>(initial);
    const same = submitted?.type === "multiple_choice" && submitted.selected.join() === [...selected].sort((a, b) => a - b).join();

    return (
        <form className="flex flex-col gap-3" onSubmit={e => {
            e.preventDefault();
            if (selected.length) onSubmit({ type: "multiple_choice", selected: [...selected].sort((a, b) => a - b) });
        }}>
            <p className="text-xs text-muted-foreground">Tick every answer you think is right, then submit.</p>
            <div className="grid gap-2 sm:grid-cols-2">
                {options.map((o, i) => {
                    const on = selected.includes(i);
                    return (
                        <button key={i} type="button" disabled={locked} aria-pressed={on}
                                onClick={() => setSelected(s => (on ? s.filter(x => x !== i) : [...s, i]))}
                                className={cn("flex min-h-16 cursor-pointer items-center gap-3 border-2 p-3 text-left text-base transition-all active:scale-[0.98] disabled:cursor-default",
                                    on ? "bg-muted" : "border-border hover:bg-muted/50")}
                                style={{
                                    borderTopColor: on ? OPTION_COLORS[i] : undefined,
                                    borderRightColor: on ? OPTION_COLORS[i] : undefined,
                                    borderBottomColor: on ? OPTION_COLORS[i] : undefined,
                                    borderLeftColor: OPTION_COLORS[i],
                                    borderLeftWidth: 10,
                                }}>
                            <span className="text-lg" style={{ color: OPTION_COLORS[i] }} aria-hidden>{OPTION_SHAPES[i]}</span>
                            <span className="flex-1">{o}</span>
                            <span className={cn("grid size-6 shrink-0 place-items-center border-2 transition-colors", on ? "border-foreground bg-foreground text-background" : "border-muted-foreground/40")}>
                                {on && <Check className="size-4"/>}
                            </span>
                        </button>
                    );
                })}
            </div>
            <SubmitButton disabled={locked || !selected.length || same} sending={sending} submitted={submitted !== null}/>
        </form>
    );
}

function TrueFalse({ submitted, locked, sending, onSubmit }: Common) {
    const current = submitted?.type === "true_false" ? submitted.value : null;
    return (
        <div className="grid grid-cols-2 gap-3">
            {[true, false].map((v, i) => (
                <button key={String(v)} type="button" disabled={locked || current === v} onClick={() => onSubmit({ type: "true_false", value: v })}
                        className={cn("flex h-32 cursor-pointer flex-col items-center justify-center gap-2 border-2 text-xl font-semibold transition-all active:scale-[0.98] disabled:cursor-default",
                            current === v ? "bg-muted" : current !== null ? "opacity-50" : "hover:bg-muted/50")}
                        style={{ borderColor: OPTION_COLORS[i], borderBottomWidth: 8, borderStyle: "solid" }}>
                    <span style={{ color: OPTION_COLORS[i] }} aria-hidden>{OPTION_SHAPES[i]}</span>
                    {v ? "True" : "False"}
                    {current === v && <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><Check className="size-3"/> {sending ? "sending" : "sent"}</span>}
                </button>
            ))}
        </div>
    );
}

function NumberAnswer({ min, max, submitted, locked, sending, onSubmit }: Common & { min: number | null; max: number | null }) {
    const [value, setValue] = useState<number | null>(submitted?.type === "number" ? submitted.value : null);
    const out = value !== null && ((min !== null && value < min) || (max !== null && value > max));
    const hint = min !== null && max !== null ? `Between ${min} and ${max}` : min !== null ? `At least ${min}` : max !== null ? `At most ${max}` : null;
    const same = submitted?.type === "number" && submitted.value === value;

    return (
        <form className="flex flex-col gap-3" onSubmit={e => {
            e.preventDefault();
            if (value !== null && !out) onSubmit({ type: "number", value });
        }}>
            <NumberInput value={value} onValueChange={setValue} nullable disabled={locked} autoFocus aria-label="Your answer"
                         placeholder="Your answer" className="h-16 text-center text-3xl md:text-3xl"/>
            {hint && <p className={cn("text-center text-xs", out ? "text-destructive" : "text-muted-foreground")}>{hint}</p>}
            <SubmitButton disabled={locked || value === null || out || same} sending={sending} submitted={submitted !== null}/>
        </form>
    );
}
