import { PROVIDERS } from "@/lib/llm/providers";
import { providerIdSchema } from "@/lib/session/types";

/*
 * Thin proxy for providers that block browser CORS (currently Kilo).
 * Locked down on purpose: only fixed provider base URLs, only /chat/completions,
 * a size cap, and a whitelist of request fields. No keys are involved.
 */

const MAX_BODY_BYTES = 256 * 1024;
const ALLOWED_FIELDS = ["model", "messages", "max_tokens", "temperature", "response_format"] as const;

export async function POST(req: Request) {
    const parsedProvider = providerIdSchema.safeParse(new URL(req.url).searchParams.get("provider"));
    if (!parsedProvider.success) return Response.json({ error: "Unknown provider" }, { status: 400 });

    const def = PROVIDERS[parsedProvider.data];
    if (!def.viaProxy) return Response.json({ error: `${def.name} is called directly, not through this proxy` }, { status: 400 });

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Request too large" }, { status: 413 });

    let body: Record<string, unknown>;
    try {
        body = JSON.parse(raw);
    } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const forwarded = Object.fromEntries(ALLOWED_FIELDS.filter(k => k in body).map(k => [k, body[k]]));
    if (typeof forwarded.model !== "string" || !Array.isArray(forwarded.messages))
        return Response.json({ error: "model and messages are required" }, { status: 400 });

    try {
        const upstream = await fetch(`${def.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...forwarded, stream: false }),
            signal: AbortSignal.timeout(110_000),
        });
        return new Response(upstream.body, {
            status: upstream.status,
            headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
        });
    } catch (e) {
        const timeout = e instanceof Error && e.name === "TimeoutError";
        return Response.json({ error: timeout ? `${def.name} timed out` : `Could not reach ${def.name}` }, { status: timeout ? 504 : 502 });
    }
}

export const maxDuration = 120;
