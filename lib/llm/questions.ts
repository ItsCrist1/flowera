import { z } from "zod";
import { chatCompletion, extractJson, LlmError, type ChatMessage } from "@/lib/llm/client";
import { id, LESSON_LANGUAGES, type LessonLanguage, type ProviderId, type Question } from "@/lib/session/types";

/*
 * Prompts for the LLM "check" (spec §6) and the optional end-of-session analysis (spec §4).
 * The model only ever sees the lesson transcript, the teacher's lesson context and question texts.
 * Never names.
 */

const llmQuestionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("multiple_choice"),
        text: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(8),
        correct: z.array(z.number().int().nonnegative()).min(1),
    }),
    z.object({ type: z.literal("true_false"), text: z.string().min(1), correct: z.boolean() }),
    z.object({
        type: z.literal("number"),
        text: z.string().min(1),
        correctMin: z.number(),
        correctMax: z.number(),
        inputMin: z.number().nullable().optional(),
        inputMax: z.number().nullable().optional(),
    }),
]);

const checkResponseSchema = z.object({
    ask: z.boolean(),
    reason: z.string().default(""),
    question: z.unknown().optional().nullable(),
});

export type CheckResult = { ask: false; reason: string } | { ask: true; reason: string; question: Question };

function systemPrompt(language: LessonLanguage, mode: "decide" | "force") {
    const lang = LESSON_LANGUAGES[language].label;
    return [
        "You help a high-school teacher check, in real time, whether the class understood what was just taught.",
        "You receive a fresh excerpt of the lesson transcript (automatic speech recognition: expect errors, missing punctuation, and several speakers labelled Speaker 0, Speaker 1…; the teacher is usually the one who speaks most).",
        mode === "decide"
            ? "Decide whether NOW is a good moment for one short comprehension question about the excerpt. Ask only if a concept was actually explained and checking it is worthwhile; don't ask about small talk, logistics, or if the excerpt is too short or unclear."
            : "Write one short comprehension question about the excerpt.",
        `Write the question and its answers in ${lang}. Keep it answerable in under a minute on a phone. Prefer understanding over memorization. Never mention the transcript or speakers.`,
        "Never repeat or rephrase a question that was already asked.",
        "Question types:",
        "- multiple_choice: 2–6 short options, `correct` lists the indexes (0-based) of ALL correct options (usually one).",
        "- true_false: a statement, `correct` is true or false.",
        "- number: a numeric answer, `correctMin`/`correctMax` is the accepted range (equal for an exact value); optionally `inputMin`/`inputMax` to limit input.",
        "Reply with ONLY a JSON object, no prose:",
        mode === "decide"
            ? '{"ask": true|false, "reason": "one short sentence", "question": {…} | null}'
            : '{"ask": true, "reason": "one short sentence", "question": {…}}',
        'Example question: {"type":"multiple_choice","text":"…","options":["…","…","…"],"correct":[1]}',
    ].join("\n");
}

function userPrompt(opts: { lessonContext: string; transcript: string; previous: string[] }) {
    return [
        opts.lessonContext.trim() ? `Lesson context from the teacher:\n${opts.lessonContext.trim()}` : "No lesson context was given.",
        opts.previous.length ? `Questions already asked this lesson:\n${opts.previous.map(q => `- ${q}`).join("\n")}` : "No questions asked yet.",
        `New transcript since the last check:\n"""\n${opts.transcript.trim()}\n"""`,
    ].join("\n\n");
}

function toQuestion(raw: unknown): Question {
    const parsed = llmQuestionSchema.safeParse(raw);
    if (!parsed.success) throw new LlmError("The model's question was malformed.");
    const q = parsed.data;
    const base = { id: id(), text: q.text.trim(), timeLimitSec: null, onTimeline: false };
    switch (q.type) {
        case "multiple_choice": {
            const options = q.options.map(o => o.trim()).slice(0, 8);
            const correct = [...new Set(q.correct)].filter(i => i < options.length).sort((a, b) => a - b);
            if (!correct.length) throw new LlmError("The model's question had no valid correct option.");
            return { ...base, type: "multiple_choice", options, correct };
        }
        case "true_false":
            return { ...base, type: "true_false", correct: q.correct };
        case "number": {
            const lo = Math.min(q.correctMin, q.correctMax), hi = Math.max(q.correctMin, q.correctMax);
            return { ...base, type: "number", correctMin: lo, correctMax: hi, inputMin: q.inputMin ?? null, inputMax: q.inputMax ?? null };
        }
    }
}

/** Ask the LLM whether (and what) to ask. `force` is used for "Every interval" and "Generate now". */
export async function runCheck(opts: {
    provider: ProviderId;
    model: string;
    language: LessonLanguage;
    lessonContext: string;
    transcript: string;
    previous: string[];
    force: boolean;
    signal?: AbortSignal;
}): Promise<CheckResult> {
    const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt(opts.language, opts.force ? "force" : "decide") },
        { role: "user", content: userPrompt(opts) },
    ];

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const text = await chatCompletion({ provider: opts.provider, model: opts.model, messages, json: true, signal: opts.signal });
            const r = checkResponseSchema.parse(extractJson(text));
            if (!opts.force && !r.ask) return { ask: false, reason: r.reason || "Not a good moment." };
            if (!r.question) {
                if (!opts.force) return { ask: false, reason: r.reason || "No question proposed." };
                throw new LlmError("The model didn't include a question.");
            }
            return { ask: true, reason: r.reason, question: toQuestion(r.question) };
        } catch (e) {
            lastError = e;
            if (opts.signal?.aborted || (e instanceof LlmError && e.status === 429)) break;
        }
    }
    throw lastError instanceof Error ? lastError : new LlmError(String(lastError));
}

/** Optional end-of-session analysis over anonymous aggregates only. */
export async function runAnalysis(opts: {
    provider: ProviderId;
    model: string;
    language: LessonLanguage;
    lessonContext: string;
    summary: string;
    signal?: AbortSignal;
}): Promise<string> {
    const messages: ChatMessage[] = [
        {
            role: "system",
            content: [
                "You help a high-school teacher reflect on a lesson using anonymous, class-level quiz results.",
                "Look for broader trends: concepts that were understood, concepts that weren't, how understanding evolved over the lesson, participation, and likely misconceptions suggested by popular wrong answers.",
                "Give 3–6 concise, practical observations and 2–3 suggestions for the next lesson. Use short Markdown bullet points under a few headings. No preamble.",
                `Write in ${LESSON_LANGUAGES[opts.language].label}.`,
                "There is no per-student data; never speculate about individual students.",
            ].join("\n"),
        },
        {
            role: "user",
            content: `${opts.lessonContext.trim() ? `Lesson context:\n${opts.lessonContext.trim()}\n\n` : ""}Results, in the order the questions were asked:\n${opts.summary}`,
        },
    ];
    const text = await chatCompletion({ provider: opts.provider, model: opts.model, messages, maxTokens: 6000, temperature: 0.5, signal: opts.signal });
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
