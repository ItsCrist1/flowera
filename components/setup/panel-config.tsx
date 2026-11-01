"use client";

import { Bot, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/common/number-input";
import { QuestionBank } from "@/components/setup/question-bank";
import { Field, Section } from "@/components/setup/section";
import { LLM_TRIGGER_LABELS, type LlmTrigger, type SessionConfig } from "@/lib/session/types";
import { TEMPLATES, usesLlm } from "@/lib/session/templates";
import { cn } from "@/lib/utils";

/** Panel 1: template-specific configuration (spec §3). */
export function PanelConfig({ config, onChange }: { config: SessionConfig; onChange: (c: SessionConfig) => void }) {
    const set = (patch: Partial<SessionConfig>) => onChange({ ...config, ...patch });
    const setLlm = (patch: Partial<SessionConfig["llm"]>) => onChange({ ...config, llm: { ...config.llm, ...patch } });
    const t = config.template;
    const hasBank = t === "hardcoded" || t === "customized";
    const llmOn = usesLlm(config);

    return (
        <div className="flex flex-col gap-6">
            <Section title="Session name" description="Optional. Shown in your history.">
                <input value={config.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. 10B · Photosynthesis"
                       className="h-10 w-full border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring dark:bg-input/30"/>
            </Section>

            {hasBank && (
                <Section title="Timeline" description="Questions marked “On timeline” go out automatically, in order, one every interval. Time spent paused doesn&apos;t count.">
                    <Field label="One timeline question every" inline>
                        <div className="flex items-center gap-2">
                            <NumberInput className="h-9 w-24 text-right text-sm md:text-sm" min={0} value={config.timelineIntervalMin}
                                         onValueChange={v => v !== null && set({ timelineIntervalMin: v })} aria-label="Timeline interval in minutes"/>
                            <span className="text-sm text-muted-foreground">min</span>
                        </div>
                    </Field>
                </Section>
            )}

            {hasBank && (
                <Section title="Your questions" description="Mark the correct answers; students never see them unless you reveal them.">
                    <QuestionBank questions={config.questions} onChange={questions => set({ questions })}
                                  defaultTimeLimitSec={config.defaults.timeLimitSec}/>
                </Section>
            )}

            {t === "customized" && (
                <Section title="LLM questions" description="Let an LLM write extra questions from the live lesson transcript, alongside yours."
                         action={<Switch checked={config.llm.enabled} onCheckedChange={v => setLlm({ enabled: v })} aria-label="Enable LLM questions"/>}>
                    {!config.llm.enabled && <p className="text-xs text-muted-foreground">Off. The microphone won&apos;t be used.</p>}
                </Section>
            )}

            {(t === "automated" || (t === "customized" && llmOn)) && (
                <>
                    <Section title="When to generate" description="How often the LLM checks is set on the next page.">
                        <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="When to generate questions">
                            {(Object.keys(LLM_TRIGGER_LABELS) as LlmTrigger[]).map(k => {
                                const selected = config.llm.trigger === k;
                                return (
                                    <button key={k} type="button" role="radio" aria-checked={selected} onClick={() => setLlm({ trigger: k })}
                                            className={cn("flex cursor-pointer flex-col gap-1 border p-3 text-left transition-colors",
                                                selected ? "border-transparent ring-2" : "hover:bg-muted")}
                                            style={selected ? { ["--tw-ring-color" as string]: TEMPLATES[t].color } : undefined}>
                                        <span className="text-sm font-medium">{LLM_TRIGGER_LABELS[k].label}</span>
                                        <span className="text-xs leading-relaxed text-muted-foreground">{LLM_TRIGGER_LABELS[k].description}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <label className="flex cursor-pointer items-start justify-between gap-4 border p-3">
                            <span className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">Ask me first</span>
                                <span className="text-xs text-muted-foreground">Each generated question waits for your approval. You can edit it before it goes out.</span>
                            </span>
                            <Switch checked={config.llm.requireApproval} onCheckedChange={v => setLlm({ requireApproval: v })}/>
                        </label>
                    </Section>

                    <Section title="Lesson context" description="Tell the LLM what this lesson is about: subject, topic, level, what you want to check. Plain text.">
                        <Textarea value={config.llm.systemPrompt} onChange={e => setLlm({ systemPrompt: e.target.value })} rows={5}
                                  placeholder={"e.g. 10th grade biology. Today: photosynthesis — light-dependent reactions and the Calvin cycle. Focus on understanding, not memorization."}
                                  className="text-sm md:text-sm"/>
                    </Section>
                </>
            )}

            {t === "automated" && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Bot className="size-4"/> The microphone records the lesson; audio is transcribed and never stored.
                </p>
            )}
            {t === "worriless" && (
                <p className="flex items-center gap-2 text-sm"><Sparkles className="size-4"/> Nothing to configure.</p>
            )}
        </div>
    );
}
