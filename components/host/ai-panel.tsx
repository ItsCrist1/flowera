"use client";

import { useState } from "react";
import { AlertTriangle, Check, Cpu, Globe, Loader2, Mic, MicOff, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionEditor } from "@/components/setup/question-editor";
import { effectiveLlm } from "@/lib/session/templates";
import * as E from "@/lib/session/engine";
import { PROVIDERS } from "@/lib/llm/providers";
import type { AsrStatus } from "@/lib/asr/controller";
import type { HostSession, PendingApproval, Question } from "@/lib/session/types";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AiPanel({ session, now, asr, busy, error, onGenerate }: {
    session: HostSession;
    now: number;
    asr: AsrStatus;
    busy: null | "check" | "generate" | "analysis";
    error: string | null;
    onGenerate: () => void;
}) {
    const llm = effectiveLlm(session.config);
    const due = E.llmCheckDueInMs(session, now);
    const cooldown = E.cooldownLeftMs(session, now);
    const words = session.llm.transcript.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);
    const running = session.status === "running";

    return (
        <div className="flex flex-col gap-3">
            {/* Microphone + transcription backend */}
            <div className="flex items-center gap-3">
                <div className={cn("grid size-9 shrink-0 place-items-center border", asr.listening ? "border-[#0ca30c]/50" : "")}>
                    {asr.listening ? <Mic className="size-4 text-[#0ca30c]"/> : <MicOff className="size-4 text-muted-foreground"/>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-sm">
                        {asr.backend === "gpu" ? <><Cpu className="size-3.5"/> GPU transcription</>
                            : asr.backend === "webspeech" ? <><Globe className="size-3.5"/> Browser speech recognition</>
                                : running ? "Microphone off" : "Microphone off while paused"}
                        {asr.pending > 0 && <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="transcribing"/>}
                    </span>
                    <div className="h-1 w-full bg-muted" aria-hidden>
                        <div className="h-full bg-[#0ca30c] transition-[width] duration-150" style={{ width: `${Math.round(asr.level * 100)}%` }}/>
                    </div>
                </div>
            </div>

            {asr.warning && (
                <div className="flex gap-2 border border-[#ec835a]/50 bg-[#ec835a]/10 p-2.5 text-xs" role="alert">
                    <AlertTriangle className="size-4 shrink-0 text-[#ec835a]"/>
                    <span>{asr.warning}</span>
                </div>
            )}

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="truncate text-right" title={`${PROVIDERS[llm.provider].name} · ${llm.model}`}>{llm.model}</dd>
                <dt className="text-muted-foreground">New speech</dt>
                <dd className="text-right tabular-nums">{words} words</dd>
                {due !== null && <>
                    <dt className="text-muted-foreground">Next check</dt>
                    <dd className="text-right tabular-nums">{busy === "check" ? "checking…" : running ? formatClock(due) : "paused"}</dd>
                </>}
                {cooldown > 0 && <>
                    <dt className="text-muted-foreground">Cooldown</dt>
                    <dd className="text-right tabular-nums">{formatClock(cooldown)}</dd>
                </>}
            </dl>

            {error && <p className="border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}

            <Button variant="outline" onClick={onGenerate} disabled={busy !== null || !running}>
                {busy === "generate" || busy === "check" ? <Loader2 className="animate-spin"/> : <Sparkles/>}
                {busy === "check" ? "Checking…" : busy === "generate" ? "Writing a question…" : "Generate a question now"}
            </Button>
        </div>
    );
}

/** An AI question waiting for the teacher's approval. Fully editable before sending. */
export function ApprovalCard({ pending, session, now, onApprove, onReject }: {
    pending: PendingApproval;
    session: HostSession;
    now: number;
    onApprove: (q: Question) => void;
    onReject: () => void;
}) {
    const [edited, setEdited] = useState<Question>(pending.question);
    const policy = session.config.llm.approvalTimeout;
    const left = policy.mode === "wait" ? null : Math.max(0, pending.requestedAt + policy.seconds * 1000 - now);

    return (
        <div className="flex flex-col gap-3 border-2 border-[var(--series-4)] bg-card p-4 shadow-lg animate-in fade-in-0 zoom-in-95 duration-300" role="alertdialog" aria-label="Approve AI question">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-[var(--series-4)]"/> The AI wants to ask</h3>
                    {pending.reason && <p className="mt-1 text-xs text-muted-foreground">{pending.reason}</p>}
                </div>
                {left !== null && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {policy.mode === "approve" ? "sends" : "drops"} in {formatClock(left)}
                    </span>
                )}
            </div>
            <QuestionEditor question={edited} onChange={setEdited} standalone defaultTimeLimitSec={session.config.defaults.timeLimitSec}/>
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onReject}><X/> Reject</Button>
                <Button onClick={() => onApprove(edited)} disabled={!edited.text.trim()}><Check/> Approve & send</Button>
            </div>
        </div>
    );
}
