"use client";

import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput } from "@/components/common/number-input";
import { Field, Section } from "@/components/setup/section";
import { LlmPicker, ProviderNote } from "@/components/setup/llm-picker";
import { LESSON_LANGUAGES, type LessonLanguage, type SessionConfig } from "@/lib/session/types";
import { usesLlm } from "@/lib/session/templates";

type ApprovalMode = SessionConfig["llm"]["approvalTimeout"]["mode"];
const APPROVAL_MODES: Record<ApprovalMode, string> = {
    wait: "Wait for me",
    approve: "Send it automatically",
    reject: "Drop it",
};

/** Panel 2: session settings (spec §3). */
export function PanelSettings({ config, onChange }: { config: SessionConfig; onChange: (c: SessionConfig) => void }) {
    const setDefaults = (patch: Partial<SessionConfig["defaults"]>) => onChange({ ...config, defaults: { ...config.defaults, ...patch } });
    const setLlm = (patch: Partial<SessionConfig["llm"]>) => onChange({ ...config, llm: { ...config.llm, ...patch } });
    const llm = usesLlm(config);
    const approvalApplies = config.template !== "worriless" && config.llm.requireApproval;

    return (
        <div className="flex flex-col gap-6">
            <Section title="Questions" description="Defaults for every question. A question can override its own time limit.">
                <Field label="Time limit" hint="How long students have to answer." inline>
                    <div className="flex items-center gap-2">
                        <NumberInput className="h-9 w-24 text-right text-sm md:text-sm" integer min={5} max={3600} value={config.defaults.timeLimitSec}
                                     onValueChange={v => v !== null && setDefaults({ timeLimitSec: v })} aria-label="Default time limit in seconds"/>
                        <span className="text-sm text-muted-foreground">s</span>
                    </div>
                </Field>
                <ToggleRow label="Students can change their answer" hint="Until the question closes."
                           checked={config.defaults.allowChange} onChange={v => setDefaults({ allowChange: v })}/>
                <ToggleRow label="Show students the correct answer" hint="Revealed on their device when the question closes."
                           checked={config.defaults.revealCorrect} onChange={v => setDefaults({ revealCorrect: v })}/>
                <ToggleRow label="Close early when everyone has answered" hint="Otherwise the question stays open until time runs out."
                           checked={config.defaults.closeWhenAllAnswered} onChange={v => setDefaults({ closeWhenAllAnswered: v })}/>
            </Section>

            {llm && (
                <Section title="AI" description="The LLM reads what was said since its last check and writes questions from it.">
                    <Field label="Provider and model">
                        <LlmPicker provider={config.llm.provider} model={config.llm.model}
                                   onChange={({ provider, model }) => setLlm({ provider, model })}/>
                        <ProviderNote provider={config.llm.provider}/>
                    </Field>
                    {config.llm.trigger !== "manual" || config.template === "worriless" ? (
                        <Field label="Check every" hint="Paused time doesn't count. A question you send yourself doesn't reset this." inline>
                            <div className="flex items-center gap-2">
                                <NumberInput className="h-9 w-24 text-right text-sm md:text-sm" min={0} value={config.llm.checkIntervalMin}
                                             onValueChange={v => v !== null && setLlm({ checkIntervalMin: v })} aria-label="LLM check interval in minutes"/>
                                <span className="text-sm text-muted-foreground">min</span>
                            </div>
                        </Field>
                    ) : null}
                    <Field label="Lesson language" hint="Questions are written in this language. Transcription detects the language on its own." inline>
                        <Select value={config.llm.language} onValueChange={v => setLlm({ language: v as LessonLanguage })}>
                            <SelectTrigger className="h-9 w-40 cursor-pointer" aria-label="Lesson language">
                                <SelectValue>{(v: LessonLanguage) => LESSON_LANGUAGES[v].label}</SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                                {(Object.keys(LESSON_LANGUAGES) as LessonLanguage[]).map(l =>
                                    <SelectItem key={l} value={l} className="cursor-pointer">{LESSON_LANGUAGES[l].label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </Field>
                </Section>
            )}

            {llm && (
                <Collapsible className="border bg-card/50">
                    <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between p-5 text-left">
                        <span className="flex flex-col gap-1">
                            <span className="text-sm font-semibold uppercase tracking-wider">Advanced</span>
                            <span className="text-xs text-muted-foreground">Cooldown and approval timeout.</span>
                        </span>
                        <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180"/>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-4 px-5 pb-5">
                        <Field label="Cooldown between AI questions" hint="An AI question is dropped if the previous one went out less than this long ago." inline>
                            <div className="flex items-center gap-2">
                                <NumberInput className="h-9 w-24 text-right text-sm md:text-sm" min={0} value={config.llm.cooldownMin}
                                             onValueChange={v => v !== null && setLlm({ cooldownMin: v })} aria-label="Cooldown in minutes"/>
                                <span className="text-sm text-muted-foreground">min</span>
                            </div>
                        </Field>
                        <Field label="If I don't answer an approval request"
                               hint={approvalApplies ? undefined : "Only applies when “Ask me first” is on (panel 1)."}>
                            <div className="flex flex-wrap items-center gap-2">
                                <Select value={config.llm.approvalTimeout.mode} disabled={!approvalApplies}
                                        onValueChange={v => setLlm({ approvalTimeout: { ...config.llm.approvalTimeout, mode: v as ApprovalMode } })}>
                                    <SelectTrigger className="h-9 w-52 cursor-pointer" aria-label="Approval timeout behavior">
                                        <SelectValue>{(v: ApprovalMode) => APPROVAL_MODES[v]}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent alignItemWithTrigger={false}>
                                        {(Object.keys(APPROVAL_MODES) as ApprovalMode[]).map(m =>
                                            <SelectItem key={m} value={m} className="cursor-pointer">{APPROVAL_MODES[m]}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {config.llm.approvalTimeout.mode !== "wait" && (
                                    <>
                                        <span className="text-sm text-muted-foreground">after</span>
                                        <NumberInput className="h-9 w-20 text-right text-sm md:text-sm" integer min={5} disabled={!approvalApplies}
                                                     value={config.llm.approvalTimeout.seconds} aria-label="Approval timeout in seconds"
                                                     onValueChange={v => v !== null && setLlm({ approvalTimeout: { ...config.llm.approvalTimeout, seconds: v } })}/>
                                        <span className="text-sm text-muted-foreground">s</span>
                                    </>
                                )}
                            </div>
                        </Field>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{label}</span>
                {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            </span>
            <Switch checked={checked} onCheckedChange={onChange}/>
        </label>
    );
}
