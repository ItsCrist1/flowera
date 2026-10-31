"use client";

import { ArrowDown, ArrowUp, Check, Copy, Plus, Timer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NumberInput } from "@/components/common/number-input";
import { changeQuestionType } from "@/lib/session/questions";
import { OPTION_COLORS, OPTION_SHAPES } from "@/lib/session/colors";
import { QUESTION_TYPE_LABELS, type Question, type QuestionType } from "@/lib/session/types";
import { cn } from "@/lib/utils";

export type QuestionEditorProps = {
    question: Question;
    index?: number;
    onChange: (q: Question) => void;
    /** Hide list-only controls (timeline toggle, reorder, delete), e.g. when editing an LLM question for approval. */
    standalone?: boolean;
    showTimeline?: boolean;
    defaultTimeLimitSec?: number;
    onMove?: (dir: -1 | 1) => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
};

export function QuestionEditor(props: QuestionEditorProps) {
    const { question: q, onChange, standalone, showTimeline = true, defaultTimeLimitSec } = props;
    const set = (patch: Partial<Question>) => onChange({ ...q, ...patch } as Question);

    return (
        <div className="flex flex-col gap-4 border bg-card p-4 transition-shadow focus-within:shadow-[0_0_0_1px_var(--ring)]">
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2">
                {props.index !== undefined &&
                    <span className="grid size-8 shrink-0 place-items-center bg-primary text-sm font-semibold text-primary-foreground">{props.index + 1}</span>}
                <Select value={q.type} onValueChange={v => onChange(changeQuestionType(q, v as QuestionType))}>
                    <SelectTrigger className="h-8 w-40 cursor-pointer" aria-label="Question type">
                        <SelectValue>{(v: QuestionType) => QUESTION_TYPE_LABELS[v]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                        {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(t =>
                            <SelectItem key={t} value={t} className="cursor-pointer">{QUESTION_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                </Select>

                <Tooltip>
                    <TooltipTrigger render={
                        <label className="flex h-8 items-center gap-1.5 border border-input px-2 text-xs dark:bg-input/30">
                            <Timer className="size-3.5 text-muted-foreground"/>
                            <NumberInput className="h-6 w-12 border-0 bg-transparent p-0 text-right dark:bg-transparent" aria-label="Time limit in seconds"
                                         nullable integer min={5} max={3600} value={q.timeLimitSec}
                                         placeholder={defaultTimeLimitSec ? String(defaultTimeLimitSec) : "60"}
                                         onValueChange={v => set({ timeLimitSec: v })}/>
                            <span className="text-muted-foreground">s</span>
                        </label>
                    }/>
                    <TooltipContent>Time limit. Leave empty to use the session default.</TooltipContent>
                </Tooltip>

                {!standalone && showTimeline && (
                    <Tooltip>
                        <TooltipTrigger render={
                            <label className="flex h-8 cursor-pointer items-center gap-2 border border-input px-2 text-xs dark:bg-input/30">
                                <Switch checked={q.onTimeline} onCheckedChange={v => set({ onTimeline: v })} size="sm"/>
                                On timeline
                            </label>
                        }/>
                        <TooltipContent className="max-w-64">On: sent automatically, in list order, at each timeline tick. Off: only when you send it.</TooltipContent>
                    </Tooltip>
                )}

                {!standalone && (
                    <div className="ml-auto flex items-center gap-1">
                        <IconAction label="Move up" onClick={() => props.onMove?.(-1)} disabled={!props.canMoveUp}><ArrowUp/></IconAction>
                        <IconAction label="Move down" onClick={() => props.onMove?.(1)} disabled={!props.canMoveDown}><ArrowDown/></IconAction>
                        <IconAction label="Duplicate" onClick={props.onDuplicate}><Copy/></IconAction>
                        <IconAction label="Delete" onClick={props.onDelete} destructive><Trash2/></IconAction>
                    </div>
                )}
            </div>

            <Textarea value={q.text} onChange={e => set({ text: e.target.value })} rows={2}
                      placeholder={q.type === "true_false" ? "A statement students judge true or false" : "Question"}
                      className="min-h-12 text-sm md:text-sm" aria-label="Question text"/>

            {q.type === "multiple_choice" && <MultipleChoiceBody q={q} onChange={onChange}/>}
            {q.type === "true_false" && <TrueFalseBody q={q} onChange={onChange}/>}
            {q.type === "number" && <NumberBody q={q} onChange={onChange}/>}
        </div>
    );
}

function IconAction({ label, onClick, disabled, destructive, children }: {
    label: string; onClick?: () => void; disabled?: boolean; destructive?: boolean; children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger render={
                <Button variant={destructive ? "destructive" : "ghost"} size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label}>
                    {children}
                </Button>
            }/>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

function MultipleChoiceBody({ q, onChange }: { q: Extract<Question, { type: "multiple_choice" }>; onChange: (q: Question) => void }) {
    const toggleCorrect = (i: number) => {
        const has = q.correct.includes(i);
        const correct = has ? q.correct.filter(x => x !== i) : [...q.correct, i].sort((a, b) => a - b);
        onChange({ ...q, correct: correct.length ? correct : q.correct });
    };
    const removeOption = (i: number) => {
        const options = q.options.filter((_, k) => k !== i);
        const correct = q.correct.filter(x => x !== i).map(x => (x > i ? x - 1 : x));
        onChange({ ...q, options, correct: correct.length ? correct : [0] });
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((opt, i) => {
                    const correct = q.correct.includes(i);
                    return (
                        <div key={i} className="flex items-stretch border border-input dark:bg-input/30"
                             style={{ borderLeft: `6px solid ${OPTION_COLORS[i]}` }}>
                            <span className="grid w-7 place-items-center text-xs" style={{ color: OPTION_COLORS[i] }} aria-hidden>{OPTION_SHAPES[i]}</span>
                            <Input value={opt} onChange={e => onChange({ ...q, options: q.options.map((o, k) => (k === i ? e.target.value : o)) })}
                                   placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`}
                                   className="h-9 flex-1 border-0 bg-transparent text-sm focus-visible:ring-0 md:text-sm dark:bg-transparent"/>
                            <Tooltip>
                                <TooltipTrigger render={
                                    <button type="button" onClick={() => toggleCorrect(i)} aria-pressed={correct}
                                            aria-label={correct ? `Option ${i + 1} is correct` : `Mark option ${i + 1} correct`}
                                            className={cn("grid w-9 cursor-pointer place-items-center transition-colors",
                                                correct ? "bg-[oklch(0.66_0.18_150)] text-white" : "text-muted-foreground hover:bg-muted")}>
                                        <Check className="size-4"/>
                                    </button>
                                }/>
                                <TooltipContent>{correct ? "Correct" : "Mark correct"}</TooltipContent>
                            </Tooltip>
                            {q.options.length > 2 && (
                                <button type="button" onClick={() => removeOption(i)} aria-label={`Remove option ${i + 1}`}
                                        className="grid w-8 cursor-pointer place-items-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                    <X className="size-3.5"/>
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Students tick any options and submit. Correct only if they tick exactly the {q.correct.length > 1 ? `${q.correct.length} correct ones` : "correct one"}.
                </p>
                {q.options.length < 8 && (
                    <Button variant="outline" size="sm" onClick={() => onChange({ ...q, options: [...q.options, ""] })}>
                        <Plus/> Option
                    </Button>
                )}
            </div>
        </div>
    );
}

function TrueFalseBody({ q, onChange }: { q: Extract<Question, { type: "true_false" }>; onChange: (q: Question) => void }) {
    return (
        <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Correct answer</Label>
            <div className="grid grid-cols-2 gap-2">
                {[true, false].map(v => (
                    <button key={String(v)} type="button" onClick={() => onChange({ ...q, correct: v })} aria-pressed={q.correct === v}
                            className={cn("flex h-11 cursor-pointer items-center justify-center gap-2 border text-sm font-medium transition-colors",
                                q.correct === v ? "border-transparent text-white" : "border-input text-muted-foreground hover:bg-muted")}
                            style={q.correct === v ? { background: v ? OPTION_COLORS[1] : OPTION_COLORS[0] } : undefined}>
                        {q.correct === v && <Check className="size-4"/>}{v ? "True" : "False"}
                    </button>
                ))}
            </div>
        </div>
    );
}

function NumberBody({ q, onChange }: { q: Extract<Question, { type: "number" }>; onChange: (q: Question) => void }) {
    const exact = q.correctMin === q.correctMax;
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 flex w-full items-center justify-between text-xs text-muted-foreground">
                    Correct {exact ? "value" : "range"}
                    <label className="flex cursor-pointer items-center gap-1.5">
                        <Switch size="sm" checked={!exact} onCheckedChange={range => onChange({ ...q, correctMax: range ? q.correctMin + 1 : q.correctMin })}/>
                        Range
                    </label>
                </legend>
                <div className="flex items-center gap-2">
                    <NumberInput className="h-9 text-sm md:text-sm" value={q.correctMin} aria-label={exact ? "Correct value" : "Correct from"}
                                 onValueChange={v => v !== null && onChange({ ...q, correctMin: v, correctMax: exact ? v : Math.max(v, q.correctMax) })}/>
                    {!exact && <>
                        <span className="text-muted-foreground">to</span>
                        <NumberInput className="h-9 text-sm md:text-sm" value={q.correctMax} aria-label="Correct to"
                                     onValueChange={v => v !== null && onChange({ ...q, correctMax: v })}/>
                    </>}
                </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-xs text-muted-foreground">Input limit (optional)</legend>
                <div className="flex items-center gap-2">
                    <NumberInput className="h-9 text-sm md:text-sm" value={q.inputMin} nullable placeholder="No min" aria-label="Minimum input"
                                 onValueChange={v => onChange({ ...q, inputMin: v })}/>
                    <span className="text-muted-foreground">to</span>
                    <NumberInput className="h-9 text-sm md:text-sm" value={q.inputMax} nullable placeholder="No max" aria-label="Maximum input"
                                 onValueChange={v => onChange({ ...q, inputMax: v })}/>
                </div>
            </fieldset>
        </div>
    );
}
