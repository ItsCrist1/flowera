import { auth } from "@/auth";
import { db } from "@/db";
import { providerSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {APICallError, createTextStreamResponse, RetryError, streamText, toTextStream} from "ai";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const OPENAI_URL = "https://api.openai.com/v1";

export async function POST(req: Request) {
    const session = await auth();

    if(!session?.user?.id)
        return Response.json({ error: "Not signed in" }, { status: 401 });

    const { settingId, model, prompt, messages } = await req.json();

    const [setting] = await db.select().from(providerSettings)
        .where(and(eq(providerSettings.id, settingId), eq(providerSettings.userId, session.user.id)));

    if(!setting)
        return Response.json({ error: "Setting not found" }, { status: 404 });

    const FIXED_URLS: Record<string, string> = {
        "openrouter": "https://openrouter.ai/api/v1",
        "vercel-ai-gateway": "https://ai-gateway.vercel.sh/v1",
    };

    const baseURL = FIXED_URLS[setting.provider] ?? (setting.endpoint || OPENAI_URL);

    const provider = createOpenAICompatible({ name: setting.provider, baseURL, apiKey: setting.apiKey });

    try {
        let failure: unknown;
        const result = streamText({
            model: provider(model ?? setting.models[0]),
            ...(messages ? {messages} : {prompt}),
            onError: ({ error }) => { failure = error; console.error(error) }
        });

        const text = toTextStream({ stream: result.stream });
        const safe = new ReadableStream<string>({
            async start(controller) {
                const reader = text.getReader();

                try {
                    while(true) {
                        const {done, value} = await reader.read();

                        if(done)
                            break;

                        controller.enqueue(value);
                    }
                } catch (e) {
                    failure ??= e;
                }

                if(failure)
                    controller.enqueue(`\n\n**Error:** ${describe(failure)}`);

                controller.close();
            }
        });

        return createTextStreamResponse({ stream: safe });
    } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
}

function describe(error: unknown): string {
    const e = RetryError.isInstance(error) ? error.lastError : error;
    if (APICallError.isInstance(e))
        return `${e.statusCode ?? ""} ${e.responseBody ?? e.message}`.trim();
    return e instanceof Error ? e.message : String(e);
}