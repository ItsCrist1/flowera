import { PROVIDERS } from "@/lib/llm/providers";
import { providerIdSchema } from "@/lib/session/types";

/** Model list for providers that block browser CORS. Fixed upstream URL, cached for 10 minutes. */
export async function GET(req: Request) {
    const parsed = providerIdSchema.safeParse(new URL(req.url).searchParams.get("provider"));
    if (!parsed.success) return Response.json({ error: "Unknown provider" }, { status: 400 });
    const def = PROVIDERS[parsed.data];
    try {
        const upstream = await fetch(`${def.baseUrl}/models`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(15_000) });
        if (!upstream.ok) return Response.json({ error: `${def.name} returned ${upstream.status}` }, { status: 502 });
        return Response.json(await upstream.json(), { headers: { "Cache-Control": "public, max-age=600" } });
    } catch {
        return Response.json({ error: `Could not reach ${def.name}` }, { status: 502 });
    }
}
