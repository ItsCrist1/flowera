export function formatClock(ms: number) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const mm = String(m).padStart(h ? 2 : 1, "0"), ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTime(at: number) {
    return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDate(at: number | null) {
    if (!at) return "—";
    return new Date(at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
    return `${n} ${n === 1 ? word : pluralWord}`;
}
