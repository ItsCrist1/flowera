#!/usr/bin/env node
/*
 * Flowera ASR gateway (spec §9). Runs on the home PC in front of audio.cpp.
 *
 *   browser ──HTTPS──▶ Caddy :443 ──▶ this gateway :8787 ──▶ audiocpp_server :8091 (VibeVoice-ASR on the GPU)
 *
 * - POST /transcribe   body: a 16 kHz mono 16-bit WAV, header "Authorization: Bearer <ticket>"
 *                      → { text, segments: [{ speaker, text, startSec, endSec }], durationSec, wallMs }
 * - GET  /health       → { ok, upstream, queued, running, capacity }
 *
 * Audio is only ever held in memory and forwarded to audio.cpp, which decodes WAV uploads in memory
 * without temporary files. Nothing is logged except sizes and timings.
 *
 * Zero dependencies (Node 20+). Configuration via environment variables (see asr-server/README.md).
 */
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const config = {
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST ?? "127.0.0.1",
    upstream: (process.env.AUDIOCPP_URL ?? "http://127.0.0.1:8091").replace(/\/+$/, ""),
    model: process.env.AUDIOCPP_MODEL ?? "vibevoice-asr",
    secret: process.env.ASR_TICKET_SECRET ?? "",
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(s => s.trim()).filter(Boolean),
    /** Parallel jobs sent to audio.cpp. One model instance on a 16 GB card → 1. */
    concurrency: Math.max(1, Number(process.env.CONCURRENCY ?? 1)),
    maxQueue: Math.max(1, Number(process.env.MAX_QUEUE ?? 24)),
    maxBodyBytes: Number(process.env.MAX_BODY_MB ?? 25) * 1024 * 1024,
    jobTimeoutMs: Number(process.env.JOB_TIMEOUT_S ?? 180) * 1000,
};

if (!config.secret || config.secret.length < 16) {
    console.error("ASR_TICKET_SECRET must be set (16+ characters) and match the Vercel app's ASR_TICKET_SECRET.");
    process.exit(1);
}

/* ───────────── tickets ───────────── */

function verifyTicket(header) {
    const token = /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1];
    if (!token) return "missing ticket";
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return "malformed ticket";
    const expected = createHmac("sha256", config.secret).update(payload).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "bad signature";
    try {
        const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
        if (typeof exp !== "number" || exp < Date.now()) return "expired ticket";
    } catch {
        return "malformed ticket";
    }
    return null;
}

/* ───────────── queue ───────────── */

let running = 0;
const queue = [];

function enqueue(job) {
    return new Promise((resolve, reject) => {
        if (queue.length >= config.maxQueue) return reject(Object.assign(new Error("queue full"), { status: 503 }));
        queue.push({ job, resolve, reject });
        pump();
    });
}

function pump() {
    while (running < config.concurrency && queue.length) {
        const { job, resolve, reject } = queue.shift();
        running++;
        job().then(resolve, reject).finally(() => {
            running--;
            pump();
        });
    }
}

async function transcribe(wav) {
    const form = new FormData();
    form.set("model", config.model);
    form.set("file", new Blob([wav], { type: "audio/wav" }), "chunk.wav");
    const res = await fetch(`${config.upstream}/v1/audio/transcriptions/details`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(config.jobTimeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`audio.cpp ${res.status}: ${text.slice(0, 200)}`), { status: 502 });
    const data = JSON.parse(text);
    const rate = data.sample_rate || 16000;
    const turns = Array.isArray(data.speaker_turns) && data.speaker_turns.length ? data.speaker_turns
        : Array.isArray(data.segments) ? data.segments : [];
    return {
        text: (data.text ?? "").trim(),
        segments: turns
            .filter(t => (t.text ?? "").trim())
            .map(t => ({
                speaker: t.speaker_id !== undefined ? String(t.speaker_id) : null,
                text: t.text.trim(),
                startSec: (t.start_sample ?? 0) / rate,
                endSec: (t.end_sample ?? 0) / rate,
            })),
        durationSec: (data.timing?.audio_duration_ms ?? 0) / 1000,
        wallMs: data.timing?.wall_ms ?? null,
    };
}

async function upstreamHealthy() {
    try {
        const r = await fetch(`${config.upstream}/health`, { signal: AbortSignal.timeout(2000) });
        return r.ok;
    } catch {
        return false;
    }
}

/* ───────────── HTTP ───────────── */

function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && (config.allowedOrigins.includes(origin) || config.allowedOrigins.includes("*"))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Max-Age", "600");
    }
}

function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", c => {
            size += c.length;
            if (size > config.maxBodyBytes) {
                reject(Object.assign(new Error("audio too large"), { status: 413 }));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function looksLikeWav(buf) {
    return buf.length > 44 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE";
}

const server = createServer(async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    const path = new URL(req.url ?? "/", "http://x").pathname;

    if (req.method === "GET" && path === "/health") {
        const upstream = await upstreamHealthy();
        return send(res, upstream ? 200 : 503, { ok: upstream, upstream, queued: queue.length, running, capacity: config.maxQueue });
    }

    if (req.method === "POST" && path === "/transcribe") {
        const problem = verifyTicket(req.headers.authorization);
        if (problem) return send(res, 401, { error: problem });
        const t0 = Date.now();
        try {
            const wav = await readBody(req);
            if (!looksLikeWav(wav)) return send(res, 400, { error: "expected a WAV file" });
            const result = await enqueue(() => transcribe(wav));
            console.log(`[asr] ${(wav.length / 1024).toFixed(0)} KiB · ${result.durationSec.toFixed(1)} s audio · ${Date.now() - t0} ms total · queue ${queue.length}`);
            return send(res, 200, result);
        } catch (e) {
            const status = e.status ?? 500;
            console.warn(`[asr] ${status} ${e.message}`);
            return send(res, status, { error: e.message });
        }
    }

    send(res, 404, { error: "not found" });
});

server.listen(config.port, config.host, () => {
    console.log(`Flowera ASR gateway on http://${config.host}:${config.port} → ${config.upstream} (model ${config.model}, concurrency ${config.concurrency})`);
    console.log(`Allowed origins: ${config.allowedOrigins.join(", ")}`);
});
