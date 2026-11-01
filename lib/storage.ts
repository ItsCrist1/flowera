"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { z } from "zod";

/*
 * Typed, validated localStorage. Every key is versioned with a `flowera:` prefix so it's easy to
 * find in devtools and to wipe. Values that fail validation are treated as missing, so a schema
 * change never crashes the app on old data.
 */

export const STORAGE_KEYS = {
    setup: "flowera:setup:v1",
    hostSession: "flowera:host-session:v1",
    history: "flowera:history:v1",
    studentIdentity: "flowera:student:v1",
    studentConsent: "flowera:student-consent:v1",
    studentSessions: "flowera:student-sessions:v1",
} as const;

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function emit() {
    for (const l of listeners) l();
}

if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
        if (e.key?.startsWith("flowera:")) {
            cache.delete(e.key);
            emit();
        }
    });
}

export function readStorage<T>(key: string, schema: z.ZodType<T>): T | null {
    if (typeof window === "undefined") return null;
    let raw: string | null;
    try {
        raw = window.localStorage.getItem(key);
    } catch {
        return null;
    }
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.value as T | null;

    let value: T | null = null;
    if (raw !== null) {
        try {
            const parsed = schema.safeParse(JSON.parse(raw));
            value = parsed.success ? parsed.data : null;
            if (!parsed.success) console.warn(`[flowera] ignoring invalid stored value for ${key}`, parsed.error.issues);
        } catch {
            value = null;
        }
    }
    cache.set(key, { raw, value });
    return value;
}

export function writeStorage<T>(key: string, value: T | null) {
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`[flowera] could not save ${key}`, e);
    }
    cache.delete(key);
    emit();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * React binding for a stored value. Returns `fallback` during SSR and until the stored value is read,
 * so components render deterministically on the server.
 */
export function useStoredValue<T>(key: string, schema: z.ZodType<T>, fallback: T) {
    const value = useSyncExternalStore(
        subscribe,
        () => readStorage(key, schema),
        () => null,
    );
    const set = useCallback((next: T | null | ((prev: T) => T)) => {
        const prev = readStorage(key, schema) ?? fallback;
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeStorage(key, resolved);
    }, [key, schema, fallback]);
    return [value ?? fallback, set, value !== null] as const;
}

/** True after hydration. Use to avoid rendering storage-dependent UI on the server. */
export function useHydrated() {
    return useSyncExternalStore(subscribe, () => true, () => false);
}
