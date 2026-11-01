"use client";

import PartySocket from "partysocket";

/** Where the room relay (party/) runs. Set NEXT_PUBLIC_PARTY_HOST, e.g. "flowera-rooms.<account>.workers.dev". */
export function partyHost(): string | null {
    return process.env.NEXT_PUBLIC_PARTY_HOST?.trim() || null;
}

export function openRoom(pin: string, query: Record<string, string>) {
    const host = partyHost();
    if (!host) throw new Error("NEXT_PUBLIC_PARTY_HOST is not configured.");
    return new PartySocket({
        host,
        party: "room",
        room: pin,
        query,
        // Keep retrying quickly; classrooms have flaky Wi-Fi.
        maxReconnectionDelay: 4000,
        minReconnectionDelay: 300,
    });
}

/** Close codes the room uses to refuse a connection on purpose (don't keep retrying). */
export const ROOM_REJECT_CODE = 4000;
