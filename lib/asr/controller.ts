"use client";

import { MicRecorder, type Chunk } from "@/lib/asr/recorder";
import { WebSpeechTranscriber, webSpeechSupported } from "@/lib/asr/web-speech";

/*
 * Transcription for a live session (spec §9): the home-GPU gateway when it's reachable,
 * otherwise the browser's Web Speech API, with a visible warning. Switches back to the GPU
 * automatically when it recovers.
 */

export type AsrBackend = "gpu" | "webspeech" | "none";

export type AsrStatus = {
    backend: AsrBackend;
    listening: boolean;
    /** Shown prominently to the teacher when set. */
    warning: string | null;
    /** Rough input level 0..1 for the mic meter. */
    level: number;
    /** Chunks waiting for or being transcribed. */
    pending: number;
};

export type TranscriptPiece = { at: number; speaker: string | null; text: string };

type Ticket = { url: string; ticket: string; expiresAt: number };

const CHUNK_SECONDS = 60;
const SILENCE_RMS = 0.004;
const HEALTH_RETRY_MS = 60_000;

export class AsrController {
    private recorder: MicRecorder | null = null;
    private speech: WebSpeechTranscriber | null = null;
    private ticket: Ticket | null = null;
    private status: AsrStatus = { backend: "none", listening: false, warning: null, level: 0, pending: 0 };
    private inflight = new Set<Promise<void>>();
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private running = false;
    private lastLevelEmit = 0;

    constructor(private opts: {
        lang: string;
        onPieces: (pieces: TranscriptPiece[]) => void;
        onStatus: (s: AsrStatus) => void;
        onWarning?: (message: string | null) => void;
    }) {}

    async start() {
        if (this.running) return;
        this.running = true;
        const gpu = await this.gpuAvailable();
        if (!this.running) return;
        if (gpu) await this.startGpu();
        else await this.startWebSpeech("The GPU transcription server is unreachable. Using the browser's speech recognition instead (lower quality, no speaker labels).");
    }

    async stop() {
        this.running = false;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.speech?.stop();
        this.speech = null;
        const rec = this.recorder;
        this.recorder = null;
        await rec?.stop();
        this.set({ backend: "none", listening: false, level: 0 });
    }

    /** Transcribe what's been recorded so far and wait for it (bounded), so an LLM check sees the latest speech. */
    async flush(timeoutMs = 45_000) {
        this.recorder?.flush();
        if (!this.inflight.size) return;
        await Promise.race([Promise.allSettled([...this.inflight]), new Promise(r => setTimeout(r, timeoutMs))]);
    }

    /* ───────────── GPU path ───────────── */

    private async getTicket(): Promise<Ticket | null> {
        if (this.ticket && this.ticket.expiresAt - Date.now() > 60_000) return this.ticket;
        try {
            const r = await fetch("/api/asr-ticket", { cache: "no-store" });
            const j = await r.json();
            this.ticket = j.url && j.ticket ? j : null;
        } catch {
            this.ticket = null;
        }
        return this.ticket;
    }

    private async gpuAvailable(): Promise<boolean> {
        const t = await this.getTicket();
        if (!t) return false;
        try {
            const r = await fetch(`${t.url}/health`, { signal: AbortSignal.timeout(4000) });
            const j = await r.json();
            return Boolean(j.ok) && j.queued < j.capacity;
        } catch {
            return false;
        }
    }

    private async startGpu() {
        this.speech?.stop();
        this.speech = null;
        if (!this.recorder) {
            this.recorder = new MicRecorder({
                chunkSeconds: CHUNK_SECONDS,
                onChunk: c => this.track(this.sendChunk(c)),
                onLevel: l => this.level(l),
            });
            try {
                await this.recorder.start();
            } catch (e) {
                this.recorder = null;
                this.fail(micError(e));
                return;
            }
        }
        const recovered = this.status.warning !== null;
        this.set({ backend: "gpu", listening: true, warning: null });
        if (recovered) this.opts.onWarning?.(null);
    }

    private track(p: Promise<void>) {
        this.inflight.add(p);
        this.set({ pending: this.inflight.size });
        p.finally(() => {
            this.inflight.delete(p);
            this.set({ pending: this.inflight.size });
        });
    }

    private async sendChunk(c: Chunk) {
        if (c.rms < SILENCE_RMS) return; // silence: don't waste GPU time
        const t = await this.getTicket();
        if (!t) return this.degrade("Transcription server not configured.");
        try {
            const r = await fetch(`${t.url}/transcribe`, {
                method: "POST",
                headers: { Authorization: `Bearer ${t.ticket}`, "Content-Type": "audio/wav" },
                body: c.wav,
                signal: AbortSignal.timeout(180_000),
            });
            if (!r.ok) throw new Error(r.status === 503 ? "busy" : `HTTP ${r.status}`);
            const j: { segments: { speaker: string | null; text: string; startSec: number }[]; text: string } = await r.json();
            const pieces = j.segments.length
                ? j.segments.map(s => ({ at: c.startedAt + s.startSec * 1000, speaker: s.speaker, text: s.text }))
                : j.text ? [{ at: c.startedAt, speaker: null, text: j.text }] : [];
            if (pieces.length) this.opts.onPieces(pieces);
        } catch (e) {
            const busy = e instanceof Error && e.message === "busy";
            this.degrade(busy ? "The GPU transcription server is busy." : "Lost the GPU transcription server.");
        }
    }

    /** Fall back to Web Speech, keep trying the GPU in the background. */
    private degrade(reason: string) {
        if (!this.running || this.status.backend === "webspeech") return;
        void this.startWebSpeech(`${reason} Using the browser's speech recognition until it's back.`);
    }

    /* ───────────── Web Speech path ───────────── */

    private async startWebSpeech(warning: string) {
        const rec = this.recorder;
        this.recorder = null;
        await rec?.stop();
        if (!this.running) return;

        if (!webSpeechSupported()) {
            this.fail("No transcription available: the GPU server is unreachable and this browser has no speech recognition. Use Chrome or Edge, or send questions manually.");
            this.scheduleGpuRetry();
            return;
        }
        this.speech = new WebSpeechTranscriber({
            lang: this.opts.lang,
            onText: text => this.opts.onPieces([{ at: Date.now(), speaker: null, text }]),
            onError: (message, fatal) => {
                if (fatal) this.fail(message);
                else this.set({ warning: message });
            },
        });
        this.speech.start();
        this.set({ backend: "webspeech", listening: true, warning, level: 0 });
        this.opts.onWarning?.(warning);
        this.scheduleGpuRetry();
    }

    private scheduleGpuRetry() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(async () => {
            if (!this.running) return;
            if (await this.gpuAvailable()) await this.startGpu();
            else this.scheduleGpuRetry();
        }, HEALTH_RETRY_MS);
    }

    /* ───────────── status ───────────── */

    private fail(message: string) {
        this.set({ backend: "none", listening: false, warning: message });
        this.opts.onWarning?.(message);
    }

    private level(l: number) {
        const now = performance.now();
        if (now - this.lastLevelEmit < 120) return;
        this.lastLevelEmit = now;
        this.set({ level: Math.min(1, l * 6) });
    }

    private set(patch: Partial<AsrStatus>) {
        this.status = { ...this.status, ...patch };
        this.opts.onStatus(this.status);
    }
}

function micError(e: unknown) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError") return "Microphone access was denied. Allow it in the browser's site settings, then resume.";
    if (name === "NotFoundError") return "No microphone was found.";
    return `Couldn't start the microphone: ${e instanceof Error ? e.message : String(e)}`;
}
