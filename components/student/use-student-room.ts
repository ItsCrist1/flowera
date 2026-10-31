"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import { z } from "zod";
import { openRoom, partyHost, ROOM_REJECT_CODE } from "@/lib/realtime";
import { parseMessage, toStudentSchema, type LiveQuestion, type PublicState, type Reveal } from "@/lib/session/protocol";
import { describeAnswer } from "@/lib/session/questions";
import { answerValueSchema, type AnswerValue } from "@/lib/session/types";
import { STORAGE_KEYS, readStorage, writeStorage } from "@/lib/storage";

/* What a student keeps on their own device for "my history" (spec §7). Per PIN. */
export const myAnswerSchema = z.object({
    askedId: z.string(),
    text: z.string(),
    answer: z.string(),
    value: answerValueSchema,
    correctLabel: z.string().nullable(),
    at: z.number(),
});
export type MyAnswer = z.infer<typeof myAnswerSchema>;

export const studentSessionsSchema = z.record(z.string(), z.object({
    name: z.string(),
    joinedAt: z.number(),
    answers: z.array(myAnswerSchema),
}));

export type Connection = "connecting" | "open" | "reconnecting" | "closed";
export type RoomError = { code: "not_found" | "ended" | "bad_message" | "unconfigured"; message: string };

export type AnswerStatus = { askedId: string; state: "sending" | "accepted" | "refused"; value: AnswerValue | null; reason?: string };

/**
 * A student's live connection to a session. The device keeps a stable client id, so a reload or a
 * dropped connection rejoins as the same person.
 */
export function useStudentRoom(pin: string | null, cid: string | null, name: string) {
    const [state, setState] = useState<PublicState | null>(null);
    const [question, setQuestion] = useState<(LiveQuestion & { deadline: number }) | null>(null);
    const [conn, setConn] = useState<Connection>("connecting");
    const [error, setError] = useState<RoomError | null>(null);
    const [answer, setAnswer] = useState<AnswerStatus | null>(null);
    const [confirmedName, setConfirmedName] = useState<string | null>(null);
    const [lastReveal, setLastReveal] = useState<Reveal | null>(null);
    const ws = useRef<PartySocket | null>(null);
    const nameRef = useRef(name);
    useEffect(() => {
        nameRef.current = name;
    }, [name]);
    const questionRef = useRef<LiveQuestion | null>(null);

    const record = useCallback((askedId: string, value: AnswerValue) => {
        if (!pin) return;
        const q = questionRef.current;
        const all = readStorage(STORAGE_KEYS.studentSessions, studentSessionsSchema) ?? {};
        const mine = all[pin];
        if (!mine) return;
        const entry: MyAnswer = {
            askedId,
            text: q?.askedId === askedId ? q.question.text : mine.answers.find(a => a.askedId === askedId)?.text ?? "",
            answer: q?.askedId === askedId ? describeAnswer(q.question, value) : "",
            value,
            correctLabel: null,
            at: Date.now(),
        };
        const answers = [...mine.answers.filter(a => a.askedId !== askedId), entry];
        writeStorage(STORAGE_KEYS.studentSessions, { ...all, [pin]: { ...mine, answers } });
    }, [pin]);

    const applyReveal = useCallback((reveal: Reveal) => {
        if (!pin) return;
        const all = readStorage(STORAGE_KEYS.studentSessions, studentSessionsSchema) ?? {};
        const mine = all[pin];
        if (!mine || !mine.answers.some(a => a.askedId === reveal.askedId && a.correctLabel !== reveal.correctLabel)) return;
        const answers = mine.answers.map(a => (a.askedId === reveal.askedId ? { ...a, correctLabel: reveal.correctLabel } : a));
        writeStorage(STORAGE_KEYS.studentSessions, { ...all, [pin]: { ...mine, answers } });
    }, [pin]);

    useEffect(() => {
        if (!pin || !cid) return;
        if (!partyHost()) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- static configuration problem
            setError({ code: "unconfigured", message: "This Flowera server isn't configured for live sessions yet." });
            return;
        }
        const socket = openRoom(pin, { role: "student", cid });
        ws.current = socket;
        setConn("connecting");
        setError(null);

        socket.addEventListener("open", () => {
            setConn("open");
            socket.send(JSON.stringify({ t: "hello", name: nameRef.current }));
        });
        socket.addEventListener("close", e => {
            if (e.code === ROOM_REJECT_CODE) {
                socket.close();
                setConn("closed");
            } else setConn("reconnecting");
        });
        socket.addEventListener("message", e => {
            const msg = parseMessage(toStudentSchema, e.data);
            if (!msg) return;
            switch (msg.t) {
                case "state": {
                    const s = msg.state;
                    setState(s);
                    const q = s.question;
                    questionRef.current = q;
                    setQuestion(prev => {
                        if (!q) return null;
                        // Count down locally from receipt; keep the existing deadline if it's the same question and still running.
                        const deadline = Date.now() + q.remainingMs;
                        if (prev?.askedId === q.askedId && s.status === "running" && Math.abs(prev.deadline - deadline) < 1500) return { ...q, deadline: prev.deadline };
                        return { ...q, deadline };
                    });
                    setAnswer(prev => (prev && q && prev.askedId !== q.askedId ? null : prev));
                    if (s.reveal) {
                        setLastReveal(s.reveal);
                        applyReveal(s.reveal);
                    }
                    break;
                }
                case "ack":
                    setAnswer({ askedId: msg.askedId, state: msg.accepted ? "accepted" : "refused", value: msg.value, reason: msg.reason });
                    if (msg.accepted && msg.value) record(msg.askedId, msg.value);
                    break;
                case "named":
                    setConfirmedName(msg.name);
                    break;
                case "error":
                    setError({ code: msg.code, message: msg.message });
                    break;
            }
        });
        return () => {
            socket.close();
            ws.current = null;
        };
    }, [pin, cid, record, applyReveal]);

    const submit = useCallback((askedId: string, value: AnswerValue) => {
        setAnswer({ askedId, state: "sending", value });
        ws.current?.send(JSON.stringify({ t: "answer", askedId, value }));
    }, []);

    const rename = useCallback((n: string) => ws.current?.send(JSON.stringify({ t: "rename", name: n })), []);

    const leave = useCallback(() => {
        const socket = ws.current;
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "leave" }));
        socket?.close();
    }, []);

    return { state, question, conn, error, answer, confirmedName, lastReveal, submit, rename, leave };
}
