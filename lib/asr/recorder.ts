"use client";

/*
 * Microphone → 16 kHz mono PCM16 chunks, entirely in memory (spec §9). Nothing is written to disk.
 * Uses an AudioWorklet (inlined as a Blob URL) and resamples in JS, which works across browsers.
 */

const TARGET_RATE = 16000;

const WORKLET = `
class FloweraCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("flowera-capture", FloweraCapture);
`;

export type Chunk = { wav: Blob; startedAt: number; durationSec: number; rms: number };

export class MicRecorder {
    private ctx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private node: AudioWorkletNode | null = null;
    private pieces: Int16Array[] = [];
    private samples = 0;
    private sumSquares = 0;
    private chunkStartedAt = 0;
    private resampleCarry = 0;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(private opts: { chunkSeconds: number; onChunk: (c: Chunk) => void; onLevel?: (rms: number) => void }) {}

    get active() {
        return this.ctx !== null;
    }

    async start() {
        if (this.ctx) return;
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const ctx = new AudioContext();
        this.ctx = ctx;
        const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
        try {
            await ctx.audioWorklet.addModule(url);
        } finally {
            URL.revokeObjectURL(url);
        }
        const source = ctx.createMediaStreamSource(this.stream);
        const node = new AudioWorkletNode(ctx, "flowera-capture");
        node.port.onmessage = (e: MessageEvent<Float32Array>) => this.ingest(e.data, ctx.sampleRate);
        source.connect(node);
        // The worklet must be pulled by the graph; route it to a muted gain so nothing is audible.
        const mute = ctx.createGain();
        mute.gain.value = 0;
        node.connect(mute).connect(ctx.destination);
        this.node = node;
        this.chunkStartedAt = Date.now();
        this.timer = setInterval(() => {
            if (this.samples >= this.opts.chunkSeconds * TARGET_RATE) this.emit();
        }, 1000);
        if (ctx.state === "suspended") await ctx.resume();
    }

    /** Emit whatever has been recorded so far as a chunk (used right before an LLM check). */
    flush() {
        if (this.samples > TARGET_RATE / 2) this.emit();
    }

    async stop() {
        this.flush();
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.node?.disconnect();
        this.stream?.getTracks().forEach(t => t.stop());
        await this.ctx?.close().catch(() => undefined);
        this.ctx = null;
        this.stream = null;
        this.node = null;
        this.pieces = [];
        this.samples = 0;
        this.sumSquares = 0;
    }

    private ingest(input: Float32Array, rate: number) {
        // Linear-interpolating resampler to 16 kHz.
        const ratio = rate / TARGET_RATE;
        const outLen = Math.floor((input.length - this.resampleCarry) / ratio);
        if (outLen <= 0) return;
        const out = new Int16Array(outLen);
        let levelSum = 0;
        for (let i = 0; i < outLen; i++) {
            const pos = this.resampleCarry + i * ratio;
            const i0 = Math.floor(pos), frac = pos - i0;
            const a = input[i0] ?? 0, b = input[i0 + 1] ?? a;
            const v = Math.max(-1, Math.min(1, a + (b - a) * frac));
            out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
            levelSum += v * v;
        }
        this.resampleCarry = this.resampleCarry + outLen * ratio - input.length;
        if (this.resampleCarry < 0) this.resampleCarry = 0;
        this.pieces.push(out);
        this.samples += outLen;
        this.sumSquares += levelSum;
        this.opts.onLevel?.(Math.sqrt(levelSum / outLen));
    }

    private emit() {
        const total = this.samples;
        const pcm = new Int16Array(total);
        let offset = 0;
        for (const p of this.pieces) {
            pcm.set(p, offset);
            offset += p.length;
        }
        const rms = Math.sqrt(this.sumSquares / Math.max(1, total));
        const startedAt = this.chunkStartedAt;
        this.pieces = [];
        this.samples = 0;
        this.sumSquares = 0;
        this.chunkStartedAt = Date.now();
        this.opts.onChunk({ wav: encodeWav(pcm, TARGET_RATE), startedAt, durationSec: total / TARGET_RATE, rms });
    }
}

export function encodeWav(pcm: Int16Array, rate: number): Blob {
    const header = new ArrayBuffer(44);
    const v = new DataView(header);
    const write = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    write(0, "RIFF");
    v.setUint32(4, 36 + pcm.byteLength, true);
    write(8, "WAVE");
    write(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);          // PCM
    v.setUint16(22, 1, true);          // mono
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);   // byte rate
    v.setUint16(32, 2, true);          // block align
    v.setUint16(34, 16, true);         // bits per sample
    write(36, "data");
    v.setUint32(40, pcm.byteLength, true);
    return new Blob([header, pcm.buffer as ArrayBuffer], { type: "audio/wav" });
}
