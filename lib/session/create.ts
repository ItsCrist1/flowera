import { id, type HostSession, type SessionConfig } from "@/lib/session/types";

export function randomPin(): string {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900_000 + 100_000;
    return String(n);
}

function randomToken(bytes = 24): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, "0")).join("");
}

export function createHostSession(config: SessionConfig): HostSession {
    const now = Date.now();
    return {
        version: 1,
        id: id(),
        pin: randomPin(),
        hostToken: randomToken(),
        createdAt: now,
        startedAt: null,
        endedAt: null,
        config: structuredClone(config),
        status: "lobby",
        pauseReason: null,
        activeMs: 0,
        resumedAt: null,
        heartbeatAt: now,
        lastEventSeq: 0,
        students: {},
        asked: [],
        activeId: null,
        queue: [],
        timeline: { nextIndex: 0, lastTickActiveMs: 0 },
        llm: {
            lastCheckActiveMs: 0,
            lastLlmQuestionActiveMs: null,
            teacherQuestionSinceCheck: false,
            transcript: [],
            pending: null,
        },
        showAnswers: false,
        reportShared: false,
        analysis: null,
        log: [],
    };
}
