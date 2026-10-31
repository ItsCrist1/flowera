import { createHmac, randomBytes } from "node:crypto";

/*
 * Issues short-lived tickets that let a teacher's browser use the home-GPU transcription gateway
 * (asr-server/). The gateway checks the HMAC with the same shared secret, so strangers can't use
 * the GPU, and teachers never handle a key.
 *
 * Env: ASR_GATEWAY_URL (e.g. https://asr.floweratrustlens.tech), ASR_TICKET_SECRET (long random string).
 * Without them the app silently uses the browser's Web Speech API instead.
 */

const TICKET_TTL_MS = 30 * 60 * 1000;

export function GET() {
    const url = process.env.ASR_GATEWAY_URL?.replace(/\/+$/, "");
    const secret = process.env.ASR_TICKET_SECRET;
    if (!url || !secret) return Response.json({ url: null, ticket: null, expiresAt: null });

    const expiresAt = Date.now() + TICKET_TTL_MS;
    const payload = Buffer.from(JSON.stringify({ exp: expiresAt, n: randomBytes(8).toString("hex") })).toString("base64url");
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    return Response.json({ url, ticket: `${payload}.${sig}`, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}

export const dynamic = "force-dynamic";
