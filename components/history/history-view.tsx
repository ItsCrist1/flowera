"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, FileJson, FileSpreadsheet, History, Sparkles, Trash2, Upload } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ResultsList } from "@/components/host/results-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { STORAGE_KEYS, useHydrated, useStoredValue } from "@/lib/storage";
import { download, exportCsv, exportJson, fileSlug, historyListSchema, importJson } from "@/lib/session/history";
import { summarize } from "@/lib/session/questions";
import { TEMPLATES } from "@/lib/session/templates";
import type { HistoryEntry } from "@/lib/session/types";
import { formatDate, plural } from "@/lib/format";

const EMPTY: HistoryEntry[] = [];

function stats(e: HistoryEntry) {
    const sums = e.asked.map(summarize);
    const rates = sums.map(s => s.correctRate).filter((x): x is number => x !== null);
    return {
        questions: e.asked.length,
        students: Math.max(Object.keys(e.students).length, ...e.asked.map(a => a.eligible.length), 0),
        correct: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) : null,
    };
}

export function HistoryView() {
    const hydrated = useHydrated();
    const params = useSearchParams();
    const router = useRouter();
    const [list, setList] = useStoredValue(STORAGE_KEYS.history, historyListSchema, EMPTY);
    const fileInput = useRef<HTMLInputElement>(null);
    const selected = list.find(e => e.id === params.get("id")) ?? null;

    if (!hydrated) return <div className="min-h-[60vh]"/>;

    async function importFile(file: File) {
        try {
            const entry = importJson(await file.text());
            setList(l => [entry, ...l.filter(x => x.id !== entry.id)]);
            toast.success(`Imported “${entry.title || "Untitled session"}”.`);
        } catch {
            toast.error("That file isn't a Flowera session export.");
        }
    }

    if (selected) {
        const s = stats(selected);
        return (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
                <Button variant="ghost" className="self-start" onClick={() => router.push("/history")}><ArrowLeft/> All sessions</Button>
                <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-widest" style={{ color: TEMPLATES[selected.template].color }}>
                        {TEMPLATES[selected.template].name}{selected.imported ? " · imported" : ""}
                    </span>
                    <h1 className="text-2xl font-semibold">{selected.title || "Untitled session"}</h1>
                    <p className="text-sm text-muted-foreground">{formatDate(selected.startedAt)}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <Stat label="Questions" value={String(s.questions)}/>
                    <Stat label="Students" value={String(s.students)}/>
                    <Stat label="Avg. correct" value={s.correct === null ? "—" : `${s.correct}%`}/>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => download(`${fileSlug(selected)}.json`, exportJson(selected), "application/json")}><FileJson/> Export JSON</Button>
                    <Button variant="outline" onClick={() => download(`${fileSlug(selected)}.csv`, exportCsv(selected), "text/csv")}><FileSpreadsheet/> Export CSV</Button>
                    <AlertDialog>
                        <AlertDialogTrigger render={<Button variant="destructive" className="ml-auto"><Trash2/> Delete</Button>}/>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                                <AlertDialogDescription>It&apos;s removed from this device. Export it first if you want to keep a copy.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep</AlertDialogCancel>
                                <AlertDialogAction onClick={() => {
                                    setList(l => l.filter(x => x.id !== selected.id));
                                    router.push("/history");
                                }}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                <p className="-mt-3 text-xs text-muted-foreground">Exports never contain names.</p>

                {selected.analysis && (
                    <section className="border bg-card/50 p-5">
                        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="size-4"/> AI analysis</h2>
                        <div className="prose prose-sm max-w-none dark:prose-invert"><Markdown remarkPlugins={[remarkGfm]}>{selected.analysis}</Markdown></div>
                    </section>
                )}
                <section className="flex flex-col gap-3 border bg-card/50 p-5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trend</h2>
                    <TrendChart asked={selected.asked}/>
                </section>
                <ResultsList asked={selected.asked}/>
            </div>
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">History</h1>
                    <p className="text-sm text-muted-foreground">Finished sessions, stored only in this browser.</p>
                </div>
                <div className="flex gap-2">
                    <input ref={fileInput} type="file" accept="application/json,.json" className="hidden"
                           onChange={e => {
                               const f = e.target.files?.[0];
                               if (f) void importFile(f);
                               e.target.value = "";
                           }}/>
                    <Button variant="outline" onClick={() => fileInput.current?.click()}><Upload/> Import JSON</Button>
                </div>
            </div>

            {list.length === 0 ? (
                <div className="flex flex-col items-center gap-3 border border-dashed p-12 text-center">
                    <History className="size-8 text-muted-foreground"/>
                    <p className="text-sm">No sessions yet.</p>
                    <Button render={<Link href="/"/>}>Start one</Button>
                </div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {[...list].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).map(e => {
                        const s = stats(e);
                        const meta = TEMPLATES[e.template];
                        return (
                            <li key={e.id}>
                                <Link href={`/history?id=${e.id}`} className="group flex items-center gap-4 border p-4 transition-colors hover:bg-muted/50"
                                      style={{ borderLeft: `4px solid ${meta.color}` }}>
                                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                                        <span className="truncate font-medium">{e.title || "Untitled session"}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(e.startedAt)} · {meta.name}{e.imported ? " · imported" : ""} · {plural(s.questions, "question")} · {plural(s.students, "student")}
                                        </span>
                                    </div>
                                    {s.correct !== null && (
                                        <span className="flex flex-col items-end">
                                            <span className="text-xl font-semibold tabular-nums">{s.correct}%</span>
                                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">correct</span>
                                        </span>
                                    )}
                                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"/>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 border p-4">
            <span className="text-3xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
    );
}
