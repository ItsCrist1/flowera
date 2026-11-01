"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { fetchProviderModels, PROVIDER_ORDER, PROVIDERS, type ProviderModel } from "@/lib/llm/providers";
import { getModelPic } from "@/lib/llm/pics";
import type { ProviderId } from "@/lib/session/types";

function ProviderLabel({ id }: { id: ProviderId }) {
    const p = PROVIDERS[id];
    return (
        <span className="flex items-center gap-2">
            <Image src={p.icon} width={18} height={18} alt={`${p.name} logo`} className={p.iconClass}/>
            {p.name}
        </span>
    );
}

function ModelIcon({ id }: { id: string }) {
    const pic = getModelPic(id);
    return <Image src={pic?.icon ?? "/icons/llm.svg"} alt={pic?.alt ?? "Model"} width={16} height={16}
                  className={pic ? pic.className : "dark:invert"}/>;
}

/** Provider dropdown + live, keyless-only model picker (spec §8). */
export function LlmPicker({ provider, model, onChange }: {
    provider: ProviderId;
    model: string;
    onChange: (next: { provider: ProviderId; model: string }) => void;
}) {
    // Results are keyed by provider (and retry count) so switching providers never shows stale models.
    const [reloadKey, setReloadKey] = useState(0);
    const requestKey = `${provider}#${reloadKey}`;
    const [result, setResult] = useState<{ key: string; models?: ProviderModel[]; error?: string } | null>(null);
    const models = result?.key === requestKey ? result.models ?? null : null;
    const error = result?.key === requestKey ? result.error ?? null : null;

    useEffect(() => {
        const ctrl = new AbortController();
        fetchProviderModels(provider, ctrl.signal)
            .then(list => {
                setResult({ key: requestKey, models: list });
                // Pick the provider's default when nothing valid is selected yet.
                if (!model || !list.some(m => m.id === model)) {
                    const fallback = list.find(m => m.id === PROVIDERS[provider].defaultModel) ?? list[0];
                    if (fallback && fallback.id !== model) onChange({ provider, model: fallback.id });
                }
            })
            .catch(e => {
                if (!ctrl.signal.aborted) setResult({ key: requestKey, error: e instanceof Error ? e.message : String(e) });
            });
        return () => ctrl.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the provider or retry count changes
    }, [requestKey]);

    const selected = models?.find(m => m.id === model) ?? (model ? { id: model, label: model, contextLength: null } : null);

    return (
        <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={provider} onValueChange={v => onChange({ provider: v as ProviderId, model: "" })}>
                <SelectTrigger className="h-9 w-full cursor-pointer sm:w-56" aria-label="LLM provider">
                    <SelectValue>{(v: ProviderId) => <ProviderLabel id={v}/>}</SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                    {PROVIDER_ORDER.map(id => (
                        <SelectItem key={id} value={id} className="cursor-pointer">
                            <ProviderLabel id={id}/>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <div className="flex flex-1 items-center gap-2">
                <Combobox items={models ?? []} value={selected}
                          onValueChange={m => m && onChange({ provider, model: m.id })}
                          itemToStringLabel={m => m.label}
                          isItemEqualToValue={(a, b) => a.id === b.id}
                          disabled={!models}>
                    <ComboboxInput className="h-9 flex-1" aria-label="Model"
                                   placeholder={error ? "Couldn't load models" : models ? "Pick a model" : "Loading models…"}>
                        {selected && (
                            <InputGroupAddon align="inline-start">
                                <ModelIcon id={selected.id}/>
                            </InputGroupAddon>
                        )}
                    </ComboboxInput>
                    <ComboboxContent>
                        <ComboboxEmpty>No matching free models.</ComboboxEmpty>
                        <ComboboxList>
                            {(m: ProviderModel) => (
                                <ComboboxItem key={m.id} value={m} className="cursor-pointer">
                                    <ModelIcon id={m.id}/>
                                    <span className="truncate">{m.label}</span>
                                    {m.id === PROVIDERS[provider].defaultModel &&
                                        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">recommended</span>}
                                </ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
                {error && (
                    <Button variant="outline" size="icon-lg" onClick={() => setReloadKey(k => k + 1)} aria-label="Retry loading models">
                        <RefreshCw/>
                    </Button>
                )}
            </div>
        </div>
    );
}

export function ProviderNote({ provider }: { provider: ProviderId }) {
    return <p className="text-xs text-muted-foreground">Free, no API key. {PROVIDERS[provider].rateLimitNote}</p>;
}
