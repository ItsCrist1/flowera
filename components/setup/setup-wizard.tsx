"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Play, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TemplateStage } from "@/components/setup/template-stage";
import { PanelConfig } from "@/components/setup/panel-config";
import { PanelSettings } from "@/components/setup/panel-settings";
import { STORAGE_KEYS, useHydrated, useStoredValue, writeStorage } from "@/lib/storage";
import { createDefaultConfig, TEMPLATES, usesLlm, validateConfig } from "@/lib/session/templates";
import { createHostSession } from "@/lib/session/create";
import { hostSessionSchema, sessionConfigSchema, templateIdSchema, type SessionConfig, type TemplateId } from "@/lib/session/types";
import { cn } from "@/lib/utils";

const setupSchema = z.object({
    step: z.number().int().min(0).max(2),
    template: templateIdSchema.nullable(),
    config: sessionConfigSchema.nullable(),
});
type SetupState = z.infer<typeof setupSchema>;
const INITIAL: SetupState = { step: 0, template: null, config: null };

const STEPS = ["Template", "Configure", "Settings"] as const;

export function SetupWizard() {
    const router = useRouter();
    const hydrated = useHydrated();
    const [state, setState] = useStoredValue(STORAGE_KEYS.setup, setupSchema, INITIAL);
    const [live] = useStoredValue(STORAGE_KEYS.hostSession, hostSessionSchema.nullable(), null);

    const template = state.template;
    const config = state.config;
    const meta = template ? TEMPLATES[template] : null;
    const errors = useMemo(() => (config ? validateConfig(config) : []), [config]);

    function chooseTemplate(t: TemplateId) {
        setState(s => ({
            ...s,
            template: t,
            // Keep everything already configured when switching templates; only the template changes.
            config: s.config ? { ...s.config, template: t } : createDefaultConfig(t),
        }));
    }

    function goTo(step: number) {
        if (!template) return;
        // Worriless has no panel 1.
        if (step === 1 && !TEMPLATES[template].hasPanel1) step = state.step < 1 ? 2 : 0;
        setState(s => ({ ...s, step }));
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function confirmTemplate(t: TemplateId) {
        chooseTemplate(t);
        setState(s => ({ ...s, step: TEMPLATES[t].hasPanel1 ? 1 : 2 }));
    }

    function updateConfig(c: SessionConfig) {
        setState(s => ({ ...s, config: c }));
    }

    function start() {
        if (!config) return;
        if (errors.length) {
            toast.error(errors[0]);
            return;
        }
        if (live && live.status !== "ended") {
            toast.error("You already have a session running. End it first, or return to it.");
            return;
        }
        writeStorage(STORAGE_KEYS.hostSession, createHostSession(config));
        router.push("/host");
    }

    if (!hydrated) return <div className="min-h-[60vh]"/>;

    const hasLiveSession = live && live.status !== "ended";

    const header = (
        <>
            {hasLiveSession && (
                <div className="flex flex-wrap items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-4 animate-in fade-in-0">
                    <span className="flex items-center gap-2 text-sm">
                        <Radio className="size-4 animate-pulse text-red-500"/>
                        Session <span className="font-semibold tabular-nums">{live.pin}</span> is still {live.status === "lobby" ? "waiting to start" : "in progress"}.
                    </span>
                    <Button onClick={() => router.push("/host")}>Return to session <ArrowRight/></Button>
                </div>
            )}
            <Stepper step={state.step} template={template} onStep={goTo}/>
        </>
    );

    if (state.step === 0) {
        return (
            <TemplateStage value={template} onConfirm={confirmTemplate} header={
                <>
                    {header}
                    <div>
                        <h1 className="text-2xl font-semibold">Start a session</h1>
                        <p className="text-sm text-muted-foreground">Pick how questions get asked. You can change your mind later.</p>
                    </div>
                </>
            }/>
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
            {header}

            {state.step === 1 && config && meta && (
                <PanelShell title={<>Configure · <span data-panel-name>{meta.name}</span></>} subtitle={meta.description} color={meta.color}>
                    <PanelConfig config={config} onChange={updateConfig}/>
                </PanelShell>
            )}

            {state.step === 2 && config && meta && (
                <PanelShell title="Session settings" subtitle={usesLlm(config) ? "Defaults for questions, and the AI that writes them." : "Defaults for every question."} color={meta.color}>
                    <PanelSettings config={config} onChange={updateConfig}/>
                </PanelShell>
            )}

            {state.step > 0 && config && meta && (
                <footer className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t bg-background/80 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
                    <Button variant="outline" className="h-10" onClick={() => goTo(state.step === 2 && !meta.hasPanel1 ? 0 : state.step - 1)}>
                        <ArrowLeft/> Back
                    </Button>
                    {errors.length > 0 && state.step === 2 && (
                        <p className="hidden truncate text-xs text-destructive sm:block">{errors[0]}</p>
                    )}
                    {state.step === 1 ? (
                        <Button className="h-10" onClick={() => goTo(2)}>Next <ArrowRight/></Button>
                    ) : (
                        <Button onClick={start} disabled={errors.length > 0}
                                className={cn("h-10 text-white hover:opacity-90", template === "worriless" && "h-14 px-8 text-base shadow-lg [animation:pulse-glow_2.4s_ease-in-out_infinite]")}
                                style={{ background: meta.color, ["--glow" as string]: meta.color }}>
                            <Play className="fill-current"/> {template === "worriless" ? "Continue" : "Create session"}
                        </Button>
                    )}
                </footer>
            )}
        </div>
    );
}

function Stepper({ step, template, onStep }: { step: number; template: TemplateId | null; onStep: (s: number) => void }) {
    const skipConfig = template ? !TEMPLATES[template].hasPanel1 : false;
    return (
        <ol className="flex items-center gap-2 text-xs">
            {STEPS.map((label, i) => {
                const disabled = !template || (i === 1 && skipConfig);
                const done = i < step && !disabled;
                return (
                    <li key={label} className="flex items-center gap-2">
                        {i > 0 && <span className="h-px w-4 bg-border sm:w-10"/>}
                        <button type="button" disabled={disabled || i === step} onClick={() => onStep(i)}
                                className={cn("flex cursor-pointer items-center gap-2 px-2 py-1 transition-colors disabled:cursor-default",
                                    i === step ? "bg-accent font-semibold" : "text-muted-foreground hover:text-foreground",
                                    !template && i > 0 && "opacity-40",
                                    template && i === 1 && skipConfig && "line-through opacity-40")}>
                            <span className={cn("grid size-5 place-items-center border text-[10px]", (done || i === step) && "border-foreground")}>
                                {done ? <Check className="size-3"/> : i + 1}
                            </span>
                            <span className={cn(i !== step && "max-sm:hidden")}>{label}</span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

function PanelShell({ title, subtitle, color, children }: { title: React.ReactNode; subtitle: string; color: string; children: React.ReactNode }) {
    // The heading stays still: coming from panel 0, the chosen tile morphs into it (see tile-morph.ts).
    return (
        <div className="flex flex-col gap-6">
            <div data-panel-heading className="flex flex-col gap-1 border-l-4 pl-4" style={{ borderColor: color }}>
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div data-panel-body className="flex flex-col gap-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 [animation-delay:120ms] [animation-fill-mode:both]">
                {children}
            </div>
        </div>
    );
}
