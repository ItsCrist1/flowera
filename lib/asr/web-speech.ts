"use client";

/*
 * Fallback transcription with the browser's Web Speech API (spec §9). Chrome/Edge only; audio is
 * processed by the browser vendor's servers; no speaker labels. Restarts itself, because Chrome
 * ends recognition sessions on its own every so often.
 */

type Recognition = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

export function webSpeechSupported(): boolean {
    return typeof window !== "undefined" && Boolean(getCtor());
}

function getCtor(): RecognitionCtor | null {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class WebSpeechTranscriber {
    private rec: Recognition | null = null;
    private wanted = false;
    private restarts = 0;

    constructor(private opts: {
        lang: string;
        onText: (text: string) => void;
        onError: (message: string, fatal: boolean) => void;
    }) {}

    start() {
        const Ctor = getCtor();
        if (!Ctor) {
            this.opts.onError("This browser has no built-in speech recognition. Use Chrome or Edge.", true);
            return;
        }
        this.wanted = true;
        const rec = new Ctor();
        rec.lang = this.opts.lang;
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal && r[0].transcript.trim()) this.opts.onText(r[0].transcript.trim());
            }
            this.restarts = 0;
        };
        rec.onerror = (e) => {
            if (e.error === "no-speech" || e.error === "aborted") return;
            const fatal = e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "language-not-supported";
            if (fatal) this.wanted = false;
            this.opts.onError(describe(e.error), fatal);
        };
        rec.onend = () => {
            if (!this.wanted) return;
            // Chrome stops after silence or ~60 s; restart with a small backoff.
            const delay = Math.min(5000, 250 * 2 ** Math.min(this.restarts++, 4));
            setTimeout(() => {
                if (this.wanted) try {
                    rec.start();
                } catch { /* already started */ }
            }, delay);
        };
        this.rec = rec;
        try {
            rec.start();
        } catch (e) {
            this.opts.onError(e instanceof Error ? e.message : String(e), true);
        }
    }

    stop() {
        this.wanted = false;
        try {
            this.rec?.abort();
        } catch { /* ignore */ }
        this.rec = null;
    }
}

function describe(code: string) {
    switch (code) {
        case "not-allowed":
        case "service-not-allowed":
            return "Microphone access was denied.";
        case "network":
            return "Speech recognition lost its connection; retrying.";
        case "audio-capture":
            return "No microphone was found.";
        case "language-not-supported":
            return "This browser can't transcribe the lesson language.";
        default:
            return `Speech recognition error: ${code}`;
    }
}
