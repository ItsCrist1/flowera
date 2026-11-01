"use client";

import { useSyncExternalStore } from "react";

/*
 * A shared ticking clock for countdowns. Rendering must be pure, so components read time from
 * here instead of calling Date.now() during render. One interval per tick rate, shared by all users.
 * `subscribe`/`getSnapshot` are created once per rate: React re-subscribes whenever they change identity.
 */

type Clock = {
    now: number;
    listeners: Set<() => void>;
    timer: ReturnType<typeof setInterval> | null;
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => number;
};

const clocks = new Map<number, Clock>();

function clock(ms: number): Clock {
    const existing = clocks.get(ms);
    if (existing) return existing;
    const c: Clock = {
        now: Date.now(),
        listeners: new Set(),
        timer: null,
        subscribe: listener => {
            c.listeners.add(listener);
            if (!c.timer) {
                c.timer = setInterval(() => {
                    c.now = Date.now();
                    c.listeners.forEach(l => l());
                }, ms);
            }
            return () => {
                c.listeners.delete(listener);
                if (!c.listeners.size && c.timer) {
                    clearInterval(c.timer);
                    c.timer = null;
                }
            };
        },
        getSnapshot: () => c.now,
    };
    clocks.set(ms, c);
    return c;
}

const serverSnapshot = () => 0;

export function useNow(intervalMs = 250): number {
    const c = clock(intervalMs);
    return useSyncExternalStore(c.subscribe, c.getSnapshot, serverSnapshot);
}
