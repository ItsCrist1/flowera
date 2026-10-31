import { z } from "zod";

/*
 * Core data model. Everything persisted to localStorage or sent over the wire is validated
 * with these schemas, so a stale or tampered value fails loudly instead of breaking the UI.
 * To add a field: add it here with a `.default(...)`, so older saved data still parses.
 */

export const id = () => crypto.randomUUID();

/* ───────────── Questions ───────────── */

const questionBase = {
    id: z.string(),
    text: z.string(),
    /** Per-question override of the session's default time limit, in seconds. */
    timeLimitSec: z.number().int().positive().nullable().default(null),
    /** On the timeline: fired automatically, in list order. Off: only fired by the teacher. */
    onTimeline: z.boolean().default(true),
};

export const multipleChoiceSchema = z.object({
    ...questionBase,
    type: z.literal("multiple_choice"),
    options: z.array(z.string()).min(2).max(8),
    /** Indexes into `options`. At least one. */
    correct: z.array(z.number().int().nonnegative()).min(1),
});

export const trueFalseSchema = z.object({
    ...questionBase,
    type: z.literal("true_false"),
    correct: z.boolean(),
});

export const numberSchema = z.object({
    ...questionBase,
    type: z.literal("number"),
    /** Optional limit on what students can type. */
    inputMin: z.number().nullable().default(null),
    inputMax: z.number().nullable().default(null),
    /** Correct range, inclusive. Equal bounds mean an exact value. */
    correctMin: z.number(),
    correctMax: z.number(),
});

export const questionSchema = z.discriminatedUnion("type", [multipleChoiceSchema, trueFalseSchema, numberSchema]);

export type MultipleChoiceQuestion = z.infer<typeof multipleChoiceSchema>;
export type TrueFalseQuestion = z.infer<typeof trueFalseSchema>;
export type NumberQuestion = z.infer<typeof numberSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question["type"];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    multiple_choice: "Multiple choice",
    true_false: "True / false",
    number: "Number",
};

/** What students see: the question without its correct answers. */
export type PublicQuestion =
    | Omit<MultipleChoiceQuestion, "correct" | "onTimeline">
    | Omit<TrueFalseQuestion, "correct" | "onTimeline">
    | Omit<NumberQuestion, "correctMin" | "correctMax" | "onTimeline">;

export function toPublicQuestion(q: Question): PublicQuestion {
    switch (q.type) {
        case "multiple_choice": {
            const { correct: _c, onTimeline: _t, ...rest } = q;
            return rest;
        }
        case "true_false": {
            const { correct: _c, onTimeline: _t, ...rest } = q;
            return rest;
        }
        case "number": {
            const { correctMin: _a, correctMax: _b, onTimeline: _t, ...rest } = q;
            return rest;
        }
    }
}

/* ───────────── Answers ───────────── */

export const answerValueSchema = z.union([
    z.object({ type: z.literal("multiple_choice"), selected: z.array(z.number().int().nonnegative()).min(1) }),
    z.object({ type: z.literal("true_false"), value: z.boolean() }),
    z.object({ type: z.literal("number"), value: z.number() }),
]);
export type AnswerValue = z.infer<typeof answerValueSchema>;

/* ───────────── Templates & configuration ───────────── */

export const TEMPLATE_IDS = ["hardcoded", "automated", "worriless", "customized"] as const;
export const templateIdSchema = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof templateIdSchema>;

export const llmTriggerSchema = z.enum(["llm_decides", "interval", "manual"]);
export type LlmTrigger = z.infer<typeof llmTriggerSchema>;

export const LLM_TRIGGER_LABELS: Record<LlmTrigger, { label: string; description: string }> = {
    llm_decides: { label: "LLM decides", description: "At every check the LLM reads the new transcript and decides whether a question is worth asking." },
    interval: { label: "Every interval", description: "A question is generated at every check." },
    manual: { label: "Only when I ask", description: "Questions are generated only when you press Generate." },
};

export const providerIdSchema = z.enum(["llm7", "kilo"]);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const lessonLanguageSchema = z.enum(["ro", "en"]);
export type LessonLanguage = z.infer<typeof lessonLanguageSchema>;

export const LESSON_LANGUAGES: Record<LessonLanguage, { label: string; speechTag: string }> = {
    ro: { label: "Romanian", speechTag: "ro-RO" },
    en: { label: "English", speechTag: "en-US" },
};

export const llmConfigSchema = z.object({
    /** Only meaningful for the Customized template; the other templates fix it. */
    enabled: z.boolean().default(false),
    trigger: llmTriggerSchema.default("llm_decides"),
    requireApproval: z.boolean().default(false),
    systemPrompt: z.string().default(""),
    provider: providerIdSchema.default("llm7"),
    model: z.string().default(""),
    checkIntervalMin: z.number().min(0).default(5),
    language: lessonLanguageSchema.default("ro"),
    approvalTimeout: z.object({
        mode: z.enum(["wait", "approve", "reject"]).default("wait"),
        seconds: z.number().int().positive().default(30),
    }).default({ mode: "wait", seconds: 30 }),
    cooldownMin: z.number().min(0).default(5),
});
export type LlmConfig = z.infer<typeof llmConfigSchema>;

export const questionDefaultsSchema = z.object({
    timeLimitSec: z.number().int().positive().default(60),
    allowChange: z.boolean().default(true),
    revealCorrect: z.boolean().default(false),
    closeWhenAllAnswered: z.boolean().default(true),
});
export type QuestionDefaults = z.infer<typeof questionDefaultsSchema>;

export const sessionConfigSchema = z.object({
    template: templateIdSchema,
    title: z.string().default(""),
    questions: z.array(questionSchema).default([]),
    timelineIntervalMin: z.number().min(0).default(5),
    llm: llmConfigSchema.default(llmConfigSchema.parse({})),
    defaults: questionDefaultsSchema.default(questionDefaultsSchema.parse({})),
});
export type SessionConfig = z.infer<typeof sessionConfigSchema>;

/* ───────────── Live session ───────────── */

export const questionSourceSchema = z.enum(["manual", "timeline", "llm"]);
export type QuestionSource = z.infer<typeof questionSourceSchema>;

export const studentSchema = z.object({
    id: z.string(),
    name: z.string(),
    joinedAt: z.number(),
    status: z.enum(["online", "offline", "left"]),
});
export type Student = z.infer<typeof studentSchema>;

export const recordedAnswerSchema = z.object({
    value: answerValueSchema,
    at: z.number(),
});
export type RecordedAnswer = z.infer<typeof recordedAnswerSchema>;

/** One question that was actually sent to the class. */
export const askedQuestionSchema = z.object({
    id: z.string(),
    question: questionSchema,
    source: questionSourceSchema,
    openedAt: z.number(),
    /** Session-active milliseconds at which it opened / must close (pauses excluded). */
    openedActiveMs: z.number(),
    durationMs: z.number(),
    closedAt: z.number().nullable(),
    /** Student ids who were present when the question opened or joined while it was open. */
    eligible: z.array(z.string()),
    answers: z.record(z.string(), recordedAnswerSchema),
});
export type AskedQuestion = z.infer<typeof askedQuestionSchema>;

export const queuedQuestionSchema = z.object({
    id: z.string(),
    question: questionSchema,
    source: questionSourceSchema,
    queuedAt: z.number(),
});
export type QueuedQuestion = z.infer<typeof queuedQuestionSchema>;

export const LOG_KINDS = [
    "student.joined", "student.left", "student.disconnected", "student.reconnected", "student.renamed",
    "question.sent", "question.answered", "question.closed", "question.queued",
    "llm.check", "llm.skipped", "llm.asked", "llm.declined", "llm.error",
    "approval.requested", "approval.approved", "approval.rejected", "approval.timeout",
    "asr.warning", "asr.ok",
    "session.started", "session.paused", "session.resumed", "session.ended", "report.shared",
] as const;
export const logKindSchema = z.enum(LOG_KINDS);
export type LogKind = z.infer<typeof logKindSchema>;

export const logEntrySchema = z.object({
    id: z.string(),
    at: z.number(),
    kind: logKindSchema,
    message: z.string(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

export const transcriptSegmentSchema = z.object({
    at: z.number(),
    speaker: z.string().nullable(),
    text: z.string(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const pendingApprovalSchema = z.object({
    id: z.string(),
    question: questionSchema,
    reason: z.string(),
    requestedAt: z.number(),
});
export type PendingApproval = z.infer<typeof pendingApprovalSchema>;

export const sessionStatusSchema = z.enum(["lobby", "running", "paused", "ended"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const hostSessionSchema = z.object({
    version: z.literal(1),
    id: z.string(),
    pin: z.string(),
    hostToken: z.string(),
    createdAt: z.number(),
    startedAt: z.number().nullable(),
    endedAt: z.number().nullable(),
    config: sessionConfigSchema,
    status: sessionStatusSchema,
    pauseReason: z.enum(["manual", "disconnect"]).nullable(),
    /** Session-active time accumulated before the current running stretch. */
    activeMs: z.number(),
    /** Wall-clock time the current running stretch began, or null when not running. */
    resumedAt: z.number().nullable(),
    /** Last wall-clock moment the host tab was known to be alive (for reload recovery). */
    heartbeatAt: z.number(),
    students: z.record(z.string(), studentSchema),
    asked: z.array(askedQuestionSchema),
    activeId: z.string().nullable(),
    queue: z.array(queuedQuestionSchema),
    timeline: z.object({
        /** Index into the on-timeline questions (in bank order) of the next one to fire. */
        nextIndex: z.number(),
        lastTickActiveMs: z.number(),
    }),
    llm: z.object({
        lastCheckActiveMs: z.number(),
        lastLlmQuestionActiveMs: z.number().nullable(),
        /** A manual or timeline question went out since the last completed check. */
        teacherQuestionSinceCheck: z.boolean(),
        /** Transcript accumulated since the last completed check. Never saved to history. */
        transcript: z.array(transcriptSegmentSchema),
        pending: pendingApprovalSchema.nullable(),
    }),
    showAnswers: z.boolean(),
    reportShared: z.boolean(),
    analysis: z.string().nullable(),
    log: z.array(logEntrySchema),
});
export type HostSession = z.infer<typeof hostSessionSchema>;

/* ───────────── History ───────────── */

/** A finished session as stored in history. Transcripts are never included. */
export const historyEntrySchema = z.object({
    version: z.literal(1),
    id: z.string(),
    title: z.string(),
    template: templateIdSchema,
    startedAt: z.number().nullable(),
    endedAt: z.number().nullable(),
    /** Names are kept on the teacher's device only; imported (anonymous) sessions have none. */
    students: z.record(z.string(), z.object({ name: z.string() })),
    asked: z.array(askedQuestionSchema),
    log: z.array(logEntrySchema),
    analysis: z.string().nullable(),
    imported: z.boolean().default(false),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
