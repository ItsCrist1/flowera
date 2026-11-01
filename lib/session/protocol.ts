import { z } from "zod";
import { answerValueSchema, multipleChoiceSchema, numberSchema, trueFalseSchema } from "./types";

/*
 * Realtime protocol between teacher (host), students and the room relay (party/).
 * The room is deliberately dumb: it authenticates the host, relays messages, remembers the
 * latest public snapshot for late joiners, and pauses the session if the host drops.
 * All decisions (timers, queue, grading) are made in the teacher's browser.
 *
 * Imported by the Cloudflare worker too, so keep this file free of "@/..." imports.
 */

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 64 * 1024;

/* ───────────── What students may see ───────────── */

export const publicQuestionSchema = z.discriminatedUnion("type", [
    multipleChoiceSchema.omit({ correct: true, onTimeline: true }),
    trueFalseSchema.omit({ correct: true, onTimeline: true }),
    numberSchema.omit({ correctMin: true, correctMax: true, onTimeline: true }),
]);

export const liveQuestionSchema = z.object({
    askedId: z.string(),
    question: publicQuestionSchema,
    /** Milliseconds left when this snapshot was made. The receiver counts down from receipt. */
    remainingMs: z.number(),
    durationMs: z.number(),
    allowChange: z.boolean(),
});
export type LiveQuestion = z.infer<typeof liveQuestionSchema>;

/** Correct answer shown to students after a question closes (only if the teacher enabled it). */
export const revealSchema = z.object({
    askedId: z.string(),
    text: z.string(),
    correctLabel: z.string(),
});
export type Reveal = z.infer<typeof revealSchema>;

/** The anonymous end-of-session report the teacher can share. Never contains names. */
export const reportSchema = z.object({
    title: z.string(),
    endedAt: z.number().nullable(),
    questions: z.array(z.object({
        text: z.string(),
        type: z.string(),
        correctLabel: z.string(),
        slices: z.array(z.object({ label: z.string(), count: z.number(), correct: z.boolean().nullable() })),
        answered: z.number(),
        eligible: z.number(),
    })),
});
export type Report = z.infer<typeof reportSchema>;

export const publicStateSchema = z.object({
    status: z.enum(["lobby", "running", "paused", "ended"]),
    title: z.string(),
    question: liveQuestionSchema.nullable(),
    reveal: revealSchema.nullable(),
    report: reportSchema.nullable(),
});
export type PublicState = z.infer<typeof publicStateSchema>;

/* ───────────── Student → room ───────────── */

export const studentMessageSchema = z.discriminatedUnion("t", [
    z.object({ t: z.literal("hello"), name: z.string().max(40) }),
    z.object({ t: z.literal("answer"), askedId: z.string(), value: answerValueSchema }),
    z.object({ t: z.literal("rename"), name: z.string().max(40) }),
    z.object({ t: z.literal("leave") }),
]);
export type StudentMessage = z.infer<typeof studentMessageSchema>;

/* ───────────── Room → student ───────────── */

export const toStudentSchema = z.discriminatedUnion("t", [
    z.object({ t: z.literal("state"), state: publicStateSchema }),
    /** The host confirmed (accepted: true) or refused an answer. */
    z.object({ t: z.literal("ack"), askedId: z.string(), accepted: z.boolean(), value: answerValueSchema.nullable(), reason: z.string().optional() }),
    z.object({ t: z.literal("named"), name: z.string() }),
    z.object({ t: z.literal("error"), code: z.enum(["not_found", "ended", "bad_message"]), message: z.string() }),
]);
export type ToStudent = z.infer<typeof toStudentSchema>;

/* ───────────── Host → room ───────────── */

export const hostMessageSchema = z.discriminatedUnion("t", [
    /** Replace the public snapshot and broadcast it to every student. */
    z.object({ t: z.literal("state"), state: publicStateSchema }),
    /** Send one message to one student. */
    z.object({ t: z.literal("to"), cid: z.string(), msg: toStudentSchema }),
    /** The host processed buffered events up to this sequence number; the room can drop them. */
    z.object({ t: z.literal("ackEvents"), upTo: z.number() }),
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;

/* ───────────── Room → host ───────────── */

export const studentEventSchema = z.discriminatedUnion("t", [
    z.object({ t: z.literal("hello"), seq: z.number(), cid: z.string(), name: z.string(), at: z.number() }),
    z.object({ t: z.literal("answer"), seq: z.number(), cid: z.string(), askedId: z.string(), value: answerValueSchema, at: z.number() }),
    z.object({ t: z.literal("rename"), seq: z.number(), cid: z.string(), name: z.string(), at: z.number() }),
    z.object({ t: z.literal("leave"), seq: z.number(), cid: z.string(), at: z.number() }),
    z.object({ t: z.literal("disconnect"), seq: z.number(), cid: z.string(), at: z.number() }),
]);
export type StudentEvent = z.infer<typeof studentEventSchema>;

export const toHostSchema = z.discriminatedUnion("t", [
    /** Sent on (re)connect: who is connected right now, and events the host hasn't acknowledged yet. */
    z.object({ t: z.literal("welcome"), connected: z.array(z.string()), events: z.array(studentEventSchema) }),
    z.object({ t: z.literal("event"), event: studentEventSchema }),
    z.object({ t: z.literal("error"), code: z.enum(["pin_taken", "bad_message"]), message: z.string() }),
]);
export type ToHost = z.infer<typeof toHostSchema>;

export function parseMessage<T>(schema: z.ZodType<T>, raw: string | ArrayBuffer): T | null {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return null;
    try {
        const r = schema.safeParse(JSON.parse(raw));
        return r.success ? r.data : null;
    } catch {
        return null;
    }
}
