import type { ProviderId } from "@/lib/session/types";

/*
 * Free, keyless, OpenAI-compatible LLM providers (spec §8).
 * To add a provider: add an entry here (and, if its API blocks browser CORS, set `viaProxy`
 * and allow its base URL in app/api/llm/route.ts).
 */

export type ProviderModel = { id: string; label: string; contextLength: number | null };

export type ProviderDef = {
    id: ProviderId;
    name: string;
    icon: string;
    iconClass?: string;
    baseUrl: string;
    /** Calls go through our /api/llm route because the provider doesn't allow browser CORS. */
    viaProxy: boolean;
    defaultModel: string;
    rateLimitNote: string;
    /** Turns the provider's /models response into the models usable without an API key. */
    parseModels: (json: unknown) => ProviderModel[];
};

type Llm7Model = { id: string; tier?: string; model_type?: string; modalities?: { output?: string[] }; context_window?: { tokens?: number | null } };
type KiloModel = { id: string; name?: string; isFree?: boolean; context_length?: number | null; architecture?: { output_modalities?: string[] } };

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
    llm7: {
        id: "llm7",
        name: "LLM7.io",
        icon: "/icons/llm7.png",
        baseUrl: "https://api.llm7.io/v1",
        viaProxy: false,
        defaultModel: "gpt-oss:20b",
        rateLimitNote: "Small daily quota without a key; best as a backup.",
        parseModels: (json) => {
            const list = (json as { data?: Llm7Model[] })?.data ?? [];
            return list
                // Only non-"pro" tiers work without a key; checked 2026-11-01.
                .filter(m => m.tier !== "pro" && (m.model_type ?? "chat") === "chat" && (m.modalities?.output ?? ["text"]).includes("text"))
                .map(m => ({ id: m.id, label: m.id, contextLength: m.context_window?.tokens ?? null }));
        },
    },
    kilo: {
        id: "kilo",
        name: "Kilo AI Gateway",
        icon: "/icons/kilo.svg",
        baseUrl: "https://api.kilo.ai/api/gateway",
        viaProxy: true,
        defaultModel: "kilo-auto/free",
        rateLimitNote: "200 requests per hour, shared by everyone using this Flowera server.",
        parseModels: (json) => {
            const list = (json as { data?: KiloModel[] })?.data ?? [];
            return list
                // Anonymous access is limited to free models (Kilo docs, gateway/authentication).
                .filter(m => m.isFree || m.id.endsWith(":free"))
                .filter(m => (m.architecture?.output_modalities ?? ["text"]).includes("text"))
                .filter(m => !/content-safety|guard/i.test(m.id))
                .map(m => ({ id: m.id, label: m.name?.replace(/\s*\(free\)\s*$/i, "") ?? m.id, contextLength: m.context_length ?? null }));
        },
    },
};

export const PROVIDER_ORDER: ProviderId[] = ["kilo", "llm7"];

const modelCache = new Map<ProviderId, { at: number; models: ProviderModel[] }>();

/** Live list of keyless models for a provider. Cached for 10 minutes. Both /models endpoints allow browser CORS. */
export async function fetchProviderModels(provider: ProviderId, signal?: AbortSignal): Promise<ProviderModel[]> {
    const hit = modelCache.get(provider);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.models;
    const def = PROVIDERS[provider];
    const res = await fetch(`${def.baseUrl}/models`, { signal });
    if (!res.ok) throw new Error(`${def.name} model list failed (${res.status})`);
    const models = def.parseModels(await res.json());
    models.sort((a, b) => (a.id === def.defaultModel ? -1 : b.id === def.defaultModel ? 1 : a.label.localeCompare(b.label)));
    modelCache.set(provider, { at: Date.now(), models });
    return models;
}
