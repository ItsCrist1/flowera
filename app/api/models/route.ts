import { NextResponse } from "next/server";
import {auth} from "@/auth";
import {db} from "@/db";
import {providerSettings} from "@/db/schema";
import {and, eq} from "drizzle-orm";

const MODELS_DEV: Record<string, string> = {
    "api.openai.com": "openai",
    "api.anthropic.com": "anthropic",
    "generativelanguage.googleapis.com": "google",
    "api.x.ai": "xai",
    "api.z.ai": "zai",
    "api.deepseek.com": "deepseek",
    "dashscope-intl.aliyuncs.com": "alibaba",
    "api.moonshot.ai": "moonshotai",
    "api.mistral.ai": "mistral",
    "api.minimax.io": "minimax",
    "api.xiaomimimo.com": "xiaomi",
    "api.llama.com": "llama",
    "integrate.api.nvidia.com": "nvidia",
    "api.perplexity.ai": "perplexity",
    "inference.poolside.ai": "poolside",
    "openrouter.ai": "openrouter",
};

type ModelsDevModel = { id: string; modalities?: { output?: string[] } };

async function savedKey(settingId: string) {
    const session = await auth();
    if(!session?.user?.id || !settingId)
        return "";

    const [row] = await db.select({ apiKey: providerSettings.apiKey }).from(providerSettings).where(and(eq(providerSettings.id, settingId), eq(providerSettings.userId, session.user.id)));
    return row?.apiKey ?? "";
}

async function fromModelsDev(endpoint: string): Promise<string[] | null> {
    try {
        const key = MODELS_DEV[new URL(endpoint).hostname];
        if (!key) return null;
        const res = await fetch("https://models.dev/api.json", { next: { revalidate: 86400 } });
        const data = await res.json();
        const models = Object.values<ModelsDevModel>(data[key]?.models ?? {})
                            .filter((m) => m.modalities?.output?.includes("text"))
                            .map((m) => m.id);

        return models.length ? models : null;
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
    let endpoint = "";

    try {
        const body = await req.json();
        endpoint = body.endpoint;
        const apiKey = body.apiKey || await savedKey(body.settingId);

        const base = new URL(endpoint.replace(/\/+$/, ""));
        const url = new URL(base + "/models");
        const res = await fetch(url, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return NextResponse.json({ models: await fromModelsDev(endpoint) });

        const json = await res.json();
        const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : null;
        const models = list
            ? list.map((m: { id?: string; name?: string }) => m.id ?? m.name).filter((id: unknown) => typeof id === "string")
            : null;

        return NextResponse.json({ models: models?.length ? models : await fromModelsDev(endpoint) });
    } catch {
        return NextResponse.json({ models: await fromModelsDev(endpoint) });
    }
}