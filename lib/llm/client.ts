import { PROVIDERS } from "@/lib/llm/providers";
import type { ProviderId } from "@/lib/session/types";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
    }
}

/**
 * One non-streaming chat completion. Most free models are reasoning models that spend tokens
 * thinking before they answer, so the token budget is generous.
 */
export async function chatCompletion(opts: {
    provider: ProviderId;
    model: string;
    messages: ChatMessage[];
    json?: boolean;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
}): Promise<string> {
    const def = PROVIDERS[opts.provider];
    const url = def.viaProxy ? `/api/llm?provider=${def.id}` : `${def.baseUrl}/chat/completions`;
    const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);

    const send = async (jsonMode: boolean) => {
        const body = {
            model: opts.model,
            messages: opts.messages,
            max_tokens: opts.maxTokens ?? 4000,
            temperature: opts.temperature ?? 0.4,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        };
        let res: Response;
        try {
            res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
        } catch (e) {
            throw new LlmError(e instanceof Error && e.name === "TimeoutError" ? `${def.name} took too long to answer.` : `Could not reach ${def.name}.`);
        }
        const text = await res.text();
        let detail = text.slice(0, 300);
        if (!res.ok) {
            try {
                const j = JSON.parse(text);
                detail = j?.error?.message ?? j?.error ?? detail;
            } catch { /* keep raw */ }
        }
        return { res, text, detail: String(detail) };
    };

    let { res, text, detail } = await send(!!opts.json);
    // Some models (and "auto" routers that pick one) reject JSON mode. The prompt asks for JSON
    // anyway and extractJson() copes with plain text, so retry once without it.
    if (opts.json && res.status === 400 && /structured output|response_format|json/i.test(detail))
        ({ res, text, detail } = await send(false));

    if (!res.ok) {
        if (res.status === 429) throw new LlmError(`${def.name} limit reached: ${detail} ${def.rateLimitNote}`.trim(), 429);
        throw new LlmError(`${def.name} error ${res.status}: ${detail}`, res.status);
    }

    let content: unknown;
    try {
        content = JSON.parse(text)?.choices?.[0]?.message?.content;
    } catch {
        throw new LlmError(`${def.name} returned an unreadable response.`);
    }
    if (typeof content !== "string" || !content.trim())
        throw new LlmError(`${def.name} returned an empty answer (the model may have run out of tokens while thinking).`);
    return content;
}

/**
 * Pulls the first JSON object out of a model reply, tolerating code fences, leading
 * reasoning text and trailing chatter.
 */
export function extractJson(text: string): unknown {
    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch { /* fall through */ }

    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        try {
            return JSON.parse(fenced[1]);
        } catch { /* fall through */ }
    }

    // Scan for a balanced {...} block.
    for (let start = cleaned.indexOf("{"); start !== -1; start = cleaned.indexOf("{", start + 1)) {
        let depth = 0, inString = false, escaped = false;
        for (let i = start; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === "\\") escaped = true;
                else if (ch === "\"") inString = false;
                continue;
            }
            if (ch === "\"") inString = true;
            else if (ch === "{") depth++;
            else if (ch === "}" && --depth === 0) {
                try {
                    return JSON.parse(cleaned.slice(start, i + 1));
                } catch {
                    break;
                }
            }
        }
    }
    throw new LlmError("The model's answer didn't contain valid JSON.");
}
