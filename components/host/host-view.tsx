"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Eye, EyeOff, FileJson, FileSpreadsheet, Loader2, Pause, Play, Plus, QrCode, Radio, Share2, Sparkles, Square, Users, WifiOff,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useHostSession, type RoomStatus } from "@/components/host/use-host-session";
import { ActiveQuestion } from "@/components/host/active-question";
import { AiPanel, ApprovalCard } from "@/components/host/ai-panel";
import { BankPanel, QueuePanel } from "@/components/host/question-lists";
import { StudentsPanel } from "@/components/host/students-panel";
import { EventLog } from "@/components/host/event-log";
import { ResultsList } from "@/components/host/results-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatPin, JoinInfo, JoinOverlay } from "@/components/host/join-info";
import * as E from "@/lib/session/engine";
import { summarize } from "@/lib/session/questions";
import { TEMPLATES, usesLlm, usesQuestionBank } from "@/lib/session/templates";
import { download, exportCsv, exportJson, fileSlug, toHistoryEntry } from "@/lib/session/history";
import { formatClock, plural } from "@/lib/format";
import type { HostSession } from "@/lib/session/types";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

export function HostView() {
    const host = useHostSession();
    const { session, loaded } = host;

    if (!loaded) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="animate-spin text-muted-foreground"/></div>;
    if (!session) return <NoSession/>;
    if (host.otherTab) {
        return (
            <Centered>
                <h1 className="text-xl font-semibold">This session is open in another tab</h1>
                <p className="text-sm text-muted-foreground">Only one tab can run a session. Close the other tab, then reload this one.</p>
            </Centered>
        );
    }
    if (session.status === "lobby") return <Lobby host={host} session={session}/>;
    if (session.status === "ended") return <Summary host={host} session={session}/>;
    return <Dashboard host={host} session={session}/>;
}

type Host = ReturnType<typeof useHostSession>;

function Centered({ children }: { children: React.ReactNode }) {
    return <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">{children}</div>;
}

function NoSession() {
    return (
        <Centered>
            <h1 className="text-xl font-semibold">No session running</h1>
            <p className="text-sm text-muted-foreground">Set one up first. It only takes a minute.</p>
            <Button render={<Link href="/"/>} className="mt-2"><Plus/> New session</Button>
        </Centered>
    );
}

function RoomBadge({ room }: { room: RoomStatus }) {
    if (room === "connected") return null;
    const text = room === "unconfigured" ? "Realtime server not configured (NEXT_PUBLIC_PARTY_HOST)" : room === "connecting" ? "Connecting…" : "Offline, reconnecting…";
    return (
        <span className="flex items-center gap-1.5 border border-[#ec835a]/50 bg-[#ec835a]/10 px-2 py-1 text-xs" role="status">
            <WifiOff className="size-3.5 text-[#ec835a]"/> {text}
        </span>
    );
}

/* ───────────── Lobby ───────────── */

function Lobby({ host, session }: { host: Host; session: HostSession }) {
    const online = Object.values(session.students).filter(s => s.status === "online");
    const meta = TEMPLATES[session.config.template];
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-widest" style={{ color: meta.color }}>{meta.name}</span>
                    <h1 className="text-2xl font-semibold">{session.config.title || "Waiting for students"}</h1>
                </div>
                <RoomBadge room={host.room}/>
            </div>

            <JoinInfo pin={session.pin} className="justify-center py-4"/>

            <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-sm"><Users className="size-4"/> {plural(online.length, "student")} joined</p>
                <ul className="flex flex-wrap gap-2">
                    {online.map(s => (
                        <li key={s.id} className="border px-3 py-1.5 text-sm animate-in fade-in-0 zoom-in-90 duration-300">{s.name}</li>
                    ))}
                </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
                <p className="max-w-xl text-xs text-muted-foreground">
                    Once everyone is in, stop sharing your screen and start. Students can still join later.
                    {usesLlm(session.config) && " Starting turns on the microphone."}
                </p>
                <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger render={<Button variant="ghost">Cancel session</Button>}/>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
                                <AlertDialogDescription>Students in the lobby will be told it ended.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep it</AlertDialogCancel>
                                <AlertDialogAction onClick={() => {
                                    host.actions.end();
                                    host.actions.discard();
                                }}>Cancel session</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button className="h-11 px-6 text-sm text-white hover:opacity-90" style={{ background: meta.color }} onClick={host.actions.start}>
                        <Play className="fill-current"/> Start lesson
                    </Button>
                </div>
            </div>
        </div>
    );
}

/* ───────────── Live dashboard ───────────── */

function Dashboard({ host, session }: { host: Host; session: HostSession }) {
    const [joinOpen, setJoinOpen] = useState(false);
    const { actions } = host;
    const now = useNow();
    const aq = E.activeQuestion(session);
    const online = Object.values(session.students).filter(s => s.status === "online").length;
    const paused = session.status === "paused";
    const llm = usesLlm(session.config);
    const bank = usesQuestionBank(session.config);
    const nextTimeline = E.nextTimelineDueInMs(session, now);
    const closed = session.asked.filter(a => a.closedAt !== null);

    return (
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 md:px-6">
            {/* Control bar */}
            <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/85 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
                <span className={cn("flex items-center gap-1.5 border px-2 py-1 text-xs font-medium uppercase tracking-wide",
                    paused ? "border-[#fab219]/60 text-[#c98500]" : "border-[#0ca30c]/50 text-[#0ca30c]")}>
                    <Radio className={cn("size-3.5", !paused && "animate-pulse")}/>{paused ? "Paused" : "Live"}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground" title="Active time (pauses excluded)">{formatClock(E.activeNow(session, now))}</span>
                <button type="button" onClick={() => setJoinOpen(true)} className="flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-sm hover:bg-muted" title="Show join code">
                    <QrCode className="size-4"/> <span className="font-semibold tabular-nums">{formatPin(session.pin)}</span>
                </button>
                <span className="flex items-center gap-1.5 text-sm"><Users className="size-4"/>{online}</span>
                <RoomBadge room={host.room}/>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 border px-2 py-1 text-sm">
                        {session.showAnswers ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}
                        Show answers
                        <Switch checked={session.showAnswers} onCheckedChange={actions.setShowAnswers}/>
                    </label>
                    {paused
                        ? <Button onClick={actions.resume}><Play className="fill-current"/> Resume</Button>
                        : <Button variant="outline" onClick={actions.pause}><Pause/> Pause</Button>}
                    <EndButton onEnd={actions.end}/>
                </div>
            </div>

            {paused && (
                <div className="flex flex-wrap items-center justify-between gap-3 border border-[#fab219]/50 bg-[#fab219]/10 p-3 text-sm animate-in fade-in-0" role="status">
                    <span>
                        {session.pauseReason === "disconnect"
                            ? "Paused because this tab was closed or lost its connection."
                            : "Paused."} Timers are frozen{llm ? " and the microphone is off" : ""}. Students see a pause screen.
                    </span>
                    <Button onClick={actions.resume}><Play className="fill-current"/> Resume</Button>
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                {/* Main column */}
                <div className="flex min-w-0 flex-col gap-4">
                    {session.llm.pending && (
                        <ApprovalCard key={session.llm.pending.id} pending={session.llm.pending} session={session} now={now}
                                      onApprove={actions.approve} onReject={actions.reject}/>
                    )}

                    {aq ? <ActiveQuestion session={session} aq={aq} now={now} onClose={actions.closeActive}/> : (
                        <div className="flex flex-col items-center gap-2 border border-dashed p-10 text-center">
                            <p className="text-lg">No question open</p>
                            <p className="text-sm text-muted-foreground">
                                {[
                                    nextTimeline !== null ? `Next timeline question in ${paused ? "— (paused)" : formatClock(nextTimeline)}.` : null,
                                    bank && llm ? "Send one of your questions below, or generate one from the lesson so far."
                                        : bank ? "Send one of your questions below."
                                            : llm ? "The AI will ask when the time is right. You can also generate one now, or send a quick question."
                                                : null,
                                ].filter(Boolean).join(" ")}
                            </p>
                        </div>
                    )}

                    {session.queue.length > 0 && (
                        <Panel title={`Queue · ${session.queue.length}`}>
                            <QueuePanel session={session} onRemove={actions.removeQueued} onMove={actions.moveQueued}/>
                        </Panel>
                    )}

                    {bank && (
                        <Panel title="Your questions">
                            <BankPanel session={session} onSend={actions.send}/>
                        </Panel>
                    )}
                    {!bank && (
                        <Panel title="Ad-hoc question">
                            <BankPanel session={session} onSend={actions.send}/>
                        </Panel>
                    )}

                    <Panel title={`Results · ${closed.length}`}>
                        {session.showAnswers ? (
                            <div className="flex flex-col gap-4">
                                <TrendChart asked={session.asked}/>
                                <ResultsList asked={session.asked} compact/>
                            </div>
                        ) : (
                            <p className="flex items-center gap-2 text-xs text-muted-foreground"><EyeOff className="size-4"/> Hidden while “Show answers” is off.</p>
                        )}
                    </Panel>
                </div>

                {/* Side column */}
                <div className="flex min-w-0 flex-col gap-4">
                    {llm && (
                        <Panel title="AI">
                            <AiPanel session={session} now={now} asr={host.asr} busy={host.llmBusy} error={host.llmError} onGenerate={actions.generate}/>
                        </Panel>
                    )}
                    <Panel title="Students">
                        <StudentsPanel students={session.students} active={aq} showAnswers={session.showAnswers}/>
                    </Panel>
                    <Panel title="Log" className="lg:sticky lg:top-28">
                        {session.showAnswers
                            ? <EventLog log={session.log} className="h-80"/>
                            : <p className="flex items-center gap-2 text-xs text-muted-foreground"><EyeOff className="size-4"/> Hidden while “Show answers” is off (it contains names).</p>}
                    </Panel>
                </div>
            </div>

            <JoinOverlay pin={session.pin} open={joinOpen} onOpenChange={setJoinOpen} studentCount={online}/>
        </div>
    );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("flex flex-col gap-3 border bg-card/50 p-4", className)}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            {children}
        </section>
    );
}

function EndButton({ onEnd }: { onEnd: () => void }) {
    return (
        <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive"><Square className="fill-current"/> End</Button>}/>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>End the session?</AlertDialogTitle>
                    <AlertDialogDescription>The open question closes, the microphone stops, and results are saved to your history. Students can&apos;t answer any more.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep going</AlertDialogCancel>
                    <AlertDialogAction onClick={onEnd}>End session</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/* ───────────── Summary ───────────── */

function Summary({ host, session }: { host: Host; session: HostSession }) {
    const router = useRouter();
    const { actions } = host;
    const closed = session.asked.filter(a => a.closedAt !== null);
    const sums = closed.map(summarize);
    const avg = (xs: (number | null)[]) => {
        const v = xs.filter((x): x is number => x !== null);
        return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) : null;
    };
    const correct = avg(sums.map(s => s.correctRate));
    const participation = avg(sums.map(s => s.participation));
    const entry = toHistoryEntry(session);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
            <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Session ended · saved to history</span>
                <h1 className="text-2xl font-semibold">{session.config.title || "Lesson summary"}</h1>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Questions" value={String(closed.length)}/>
                <Stat label="Students" value={String(Object.keys(session.students).length)}/>
                <Stat label="Avg. correct" value={correct === null ? "—" : `${correct}%`}/>
                <Stat label="Avg. answered" value={participation === null ? "—" : `${participation}%`}/>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button onClick={actions.shareReport} disabled={session.reportShared || host.room !== "connected"}>
                    <Share2/> {session.reportShared ? "Report shared" : "Share anonymous report with students"}
                </Button>
                <Button variant="outline" onClick={() => void actions.analyze()} disabled={host.llmBusy !== null || closed.length === 0}>
                    {host.llmBusy === "analysis" ? <Loader2 className="animate-spin"/> : <Sparkles/>} {session.analysis ? "Re-analyze with AI" : "Analyze trends with AI"}
                </Button>
                <Button variant="outline" onClick={() => download(`${fileSlug(entry)}.json`, exportJson(entry), "application/json")}><FileJson/> Export JSON</Button>
                <Button variant="outline" onClick={() => download(`${fileSlug(entry)}.csv`, exportCsv(entry), "text/csv")}><FileSpreadsheet/> Export CSV</Button>
                <Button variant="ghost" className="ml-auto" onClick={() => {
                    actions.discard();
                    router.push("/");
                }}><Plus/> New session</Button>
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">Exports and the shared report never contain names. The AI analysis only sees anonymous totals.</p>

            {session.analysis && (
                <section className="border bg-card/50 p-5">
                    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="size-4"/> AI analysis</h2>
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold">
                        <Markdown remarkPlugins={[remarkGfm]}>{session.analysis}</Markdown>
                    </div>
                </section>
            )}

            <section className="flex flex-col gap-3 border bg-card/50 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trend</h2>
                <TrendChart asked={session.asked}/>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions</h2>
                <ResultsList asked={session.asked}/>
            </section>
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
