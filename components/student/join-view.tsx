"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Coffee, History, Loader2, LogOut, Pause, Pencil, ShieldCheck, Timer, WifiOff, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnswerForm } from "@/components/student/answer-form";
import { studentSessionsSchema, useStudentRoom, type MyAnswer } from "@/components/student/use-student-room";
import { AnswerPie } from "@/components/charts/answer-pie";
import { STORAGE_KEYS, readStorage, useHydrated, useStoredValue, writeStorage } from "@/lib/storage";
import { randomName } from "@/lib/student/names";
import type { Report } from "@/lib/session/protocol";
import type { Slice } from "@/lib/session/questions";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

const identitySchema = z.object({ cid: z.string(), lastName: z.string().nullable() });
const consentSchema = z.object({ acceptedAt: z.number() });
const EMPTY_SESSIONS: z.infer<typeof studentSessionsSchema> = {};

export function JoinView() {
    const hydrated = useHydrated();
    const params = useSearchParams();
    const router = useRouter();
    const [identity, setIdentity] = useStoredValue(STORAGE_KEYS.studentIdentity, identitySchema.nullable(), null);
    const [consent, setConsent] = useStoredValue(STORAGE_KEYS.studentConsent, consentSchema.nullable(), null);
    const [sessions, setSessions] = useStoredValue(STORAGE_KEYS.studentSessions, studentSessionsSchema, EMPTY_SESSIONS);
    const pinParam = (params.get("pin") ?? "").replace(/\D/g, "").slice(0, 6);

    // A stable per-device id, created once. Reads storage directly so a double-run can't create two ids.
    useEffect(() => {
        if (hydrated && !readStorage(STORAGE_KEYS.studentIdentity, identitySchema))
            writeStorage(STORAGE_KEYS.studentIdentity, { cid: crypto.randomUUID(), lastName: null });
    }, [hydrated, identity]);

    if (!hydrated || !identity) return <Shell><Loader2 className="mx-auto animate-spin text-muted-foreground"/></Shell>;

    const pin = pinParam.length === 6 ? pinParam : null;
    const joined = pin ? sessions[pin] : undefined;

    if (!pin) return <PinStep onPin={p => router.replace(`/join?pin=${p}`)}/>;
    if (!consent) return <ConsentStep onAccept={() => setConsent({ acceptedAt: Date.now() })} onBack={() => router.replace("/join")}/>;
    if (!joined) {
        return (
            <NameStep pin={pin} initial={identity.lastName ?? randomName()} onBack={() => router.replace("/join")}
                      onJoin={name => {
                          setIdentity(prev => (prev ? { ...prev, lastName: name } : prev));
                          setSessions(s => ({ ...s, [pin]: { name, joinedAt: Date.now(), answers: [] } }));
                      }}/>
        );
    }
    return (
        <Live pin={pin} cid={identity.cid} name={joined.name} answers={joined.answers}
              onRename={name => setSessions(s => ({ ...s, [pin]: { ...s[pin], name } }))}
              onLeave={() => {
                  setSessions(s => {
                      const next = { ...s };
                      delete next[pin];
                      return next;
                  });
                  router.replace("/join");
              }}/>
    );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
    return <div className={cn("mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full flex-col justify-center gap-6 px-4 py-8", wide ? "max-w-3xl" : "max-w-md")}>{children}</div>;
}

/* ───────────── Joining ───────────── */

function PinStep({ onPin }: { onPin: (pin: string) => void }) {
    const [pin, setPin] = useState("");
    const ok = pin.length === 6;
    return (
        <Shell>
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-2xl font-semibold">Join a session</h1>
                <p className="text-sm text-muted-foreground">Enter the PIN on your teacher&apos;s screen, or scan the QR code.</p>
            </div>
            <form className="flex flex-col gap-3" onSubmit={e => {
                e.preventDefault();
                if (ok) onPin(pin);
            }}>
                <Input value={pin.length > 3 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin} autoFocus inputMode="numeric" autoComplete="one-time-code"
                       aria-label="Session PIN" placeholder="000 000"
                       onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                       className="h-16 text-center text-4xl font-semibold tracking-[0.2em] tabular-nums md:text-4xl"/>
                <Button type="submit" disabled={!ok} className="h-12 text-base">Continue <ArrowRight/></Button>
            </form>
        </Shell>
    );
}

function ConsentStep({ onAccept, onBack }: { onAccept: () => void; onBack: () => void }) {
    return (
        <Shell>
            <div className="flex flex-col gap-4 border p-6">
                <ShieldCheck className="size-8"/>
                <h1 className="text-xl font-semibold">Before you join</h1>
                <ul className="flex flex-col gap-2.5 text-sm">
                    <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0"/> Your teacher sees the name you choose (a made-up one is fine) and your answers.</li>
                    <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0"/> There are no points or rankings. Questions just help your teacher see what the class understood.</li>
                    <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0"/> Reports shared with the class and every export are anonymous: no names.</li>
                    <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0"/> If questions are written by AI, the lesson audio is transcribed to text. Audio is never stored.</li>
                    <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0"/> Your answers for this session stay on this device so you can look back at them.</li>
                </ul>
                <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="h-11 flex-1" onClick={onBack}>Back</Button>
                    <Button className="h-11 flex-1" onClick={onAccept}>I understand</Button>
                </div>
            </div>
        </Shell>
    );
}

function NameStep({ pin, initial, onJoin, onBack }: { pin: string; initial: string; onJoin: (name: string) => void; onBack: () => void }) {
    const [name, setName] = useState(initial);
    return (
        <Shell>
            <div className="flex flex-col gap-1 text-center">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">PIN {pin.slice(0, 3)} {pin.slice(3)}</span>
                <h1 className="text-2xl font-semibold">What should we call you?</h1>
                <p className="text-sm text-muted-foreground">Optional. Keep the made-up name if you like.</p>
            </div>
            <form className="flex flex-col gap-3" onSubmit={e => {
                e.preventDefault();
                onJoin(name.trim() || initial);
            }}>
                <div className="flex gap-2">
                    <Input value={name} onChange={e => setName(e.target.value.slice(0, 40))} aria-label="Your name" autoFocus
                           onFocus={e => e.target.select()} className="h-12 flex-1 text-lg md:text-lg"/>
                    <Button type="button" variant="outline" className="h-12" onClick={() => setName(randomName())} aria-label="Another random name">🎲</Button>
                </div>
                <Button type="submit" className="h-12 text-base">Join <ArrowRight/></Button>
                <Button type="button" variant="ghost" onClick={onBack}>Use a different PIN</Button>
            </form>
        </Shell>
    );
}

/* ───────────── Live ───────────── */

function Live({ pin, cid, name, answers, onRename, onLeave }: {
    pin: string; cid: string; name: string; answers: MyAnswer[];
    onRename: (name: string) => void; onLeave: () => void;
}) {
    const room = useStudentRoom(pin, cid, name);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const now = useNow();
    const { state, question } = room;

    if (room.error) {
        return (
            <Shell>
                <div className="flex flex-col items-center gap-3 text-center">
                    <X className="size-8 text-destructive"/>
                    <h1 className="text-xl font-semibold">{room.error.code === "not_found" ? "No session with this PIN" : room.error.code === "ended" ? "This session has ended" : "Can't join"}</h1>
                    <p className="text-sm text-muted-foreground">{room.error.code === "not_found" ? "Check the PIN on your teacher's screen." : room.error.message}</p>
                    <Button onClick={onLeave} className="mt-2">Enter another PIN</Button>
                </div>
            </Shell>
        );
    }

    const left = question ? Math.max(0, question.deadline - now) : 0;
    const status = state?.status;
    const displayName = room.confirmedName ?? name;

    return (
        <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col gap-4 px-4 py-4">
            {/* Header */}
            <div className="flex items-center gap-2 text-sm">
                <button type="button" onClick={() => setRenaming(true)} className="flex min-w-0 cursor-pointer items-center gap-1.5 hover:underline">
                    <span className="truncate font-medium">{displayName}</span><Pencil className="size-3 shrink-0 text-muted-foreground"/>
                </button>
                {room.conn !== "open" && (
                    <span className="flex items-center gap-1 text-xs text-[#c98500]"><WifiOff className="size-3.5"/> reconnecting…</span>
                )}
                <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}><History/> My answers{answers.length ? ` (${answers.length})` : ""}</Button>
                    <LeaveButton onLeave={() => {
                        room.leave();
                        onLeave();
                    }}/>
                </div>
            </div>

            <div className="relative flex flex-1 flex-col">
                {!state ? (
                    <Center><Loader2 className="animate-spin text-muted-foreground"/><p className="text-sm text-muted-foreground">Connecting…</p></Center>
                ) : status === "ended" ? (
                    <Ended report={state.report}/>
                ) : question ? (
                    <div key={question.askedId} className="flex flex-col gap-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{question.allowChange ? "You can change your answer until time runs out." : "You can answer once."}</span>
                                <span className={cn("flex items-center gap-1 text-base tabular-nums", left < 10_000 && status === "running" && "text-[#d03b3b]")}>
                                    <Timer className="size-4"/>{status === "paused" ? "paused" : formatClock(left)}
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-muted">
                                <div className="h-full bg-primary transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (left / question.durationMs) * 100)}%` }}/>
                            </div>
                        </div>
                        <h1 className="text-2xl font-semibold leading-snug">{question.question.text}</h1>
                        <AnswerForm q={question} status={room.answer} disabled={status !== "running" || left <= 0} onSubmit={v => room.submit(question.askedId, v)}/>
                        {room.answer?.askedId === question.askedId && room.answer.state === "refused" && (
                            <p className="text-center text-sm text-destructive">{room.answer.reason ?? "Your answer wasn't accepted."}</p>
                        )}
                        {room.answer?.askedId === question.askedId && room.answer.state === "accepted" && (
                            <p className="flex items-center justify-center gap-1.5 text-sm text-[#0ca30c]"><Check className="size-4"/> Answer received</p>
                        )}
                    </div>
                ) : (
                    <Waiting reveal={state.reveal} lobby={status === "lobby"} title={state.title}/>
                )}

                {status === "paused" && (
                    <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 backdrop-blur-sm animate-in fade-in-0">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <Pause className="size-10"/>
                            <p className="text-lg font-semibold">Paused</p>
                            <p className="text-sm text-muted-foreground">Your teacher paused the session. Hang tight.</p>
                        </div>
                    </div>
                )}
            </div>

            <MyAnswersDialog open={historyOpen} onOpenChange={setHistoryOpen} answers={answers}/>
            <RenameDialog open={renaming} onOpenChange={setRenaming} current={displayName} onSave={n => {
                onRename(n);
                room.rename(n);
            }}/>
        </div>
    );
}

function Center({ children }: { children: React.ReactNode }) {
    return <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">{children}</div>;
}

function Waiting({ reveal, lobby, title }: { reveal: { text: string; correctLabel: string } | null; lobby: boolean; title: string }) {
    return (
        <Center>
            {reveal && !lobby ? (
                <div className="flex w-full max-w-md flex-col gap-2 border p-5 text-left animate-in fade-in-0 zoom-in-95">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Last question</span>
                    <p className="text-base">{reveal.text}</p>
                    <p className="flex items-center gap-2 text-sm"><Check className="size-4 text-[#0ca30c]"/> Correct: <span className="font-semibold">{reveal.correctLabel}</span></p>
                </div>
            ) : (
                <>
                    <Coffee className="size-10 text-muted-foreground"/>
                    <p className="text-lg font-semibold">{lobby ? "You're in!" : "Listen to the lesson"}</p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                        {lobby ? `Waiting for your teacher to start${title ? ` “${title}”` : ""}.` : "A question will pop up here when it's time. Keep this page open."}
                    </p>
                </>
            )}
        </Center>
    );
}

function Ended({ report }: { report: Report | null }) {
    if (!report) {
        return (
            <Center>
                <Check className="size-10"/>
                <p className="text-lg font-semibold">The session has ended</p>
                <p className="text-sm text-muted-foreground">Thanks for taking part.</p>
            </Center>
        );
    }
    return (
        <div className="flex flex-col gap-4 animate-in fade-in-0">
            <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Class report · anonymous</span>
                <h1 className="text-xl font-semibold">{report.title || "How the class did"}</h1>
            </div>
            {report.questions.map((q, i) => (
                <div key={i} className="flex flex-col gap-3 border p-4">
                    <p className="text-sm font-medium"><span className="text-muted-foreground">Q{i + 1}.</span> {q.text}</p>
                    <AnswerPie question={{ type: q.type as "multiple_choice" }} size="sm"
                               slices={q.slices.map((s, k) => ({ ...s, key: s.label === "Not answered" ? "__not_answered__" : `r${k}` }) as Slice)}/>
                    <p className="text-xs text-muted-foreground">Correct: <span className="text-foreground">{q.correctLabel}</span> · {q.answered}/{q.eligible} answered</p>
                </div>
            ))}
        </div>
    );
}

function MyAnswersDialog({ open, onOpenChange, answers }: { open: boolean; onOpenChange: (o: boolean) => void; answers: MyAnswer[] }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>My answers</DialogTitle>
                    <DialogDescription>Only on this device. Correct answers appear if your teacher reveals them.</DialogDescription>
                </DialogHeader>
                {answers.length === 0 ? <p className="text-sm text-muted-foreground">You haven&apos;t answered anything yet.</p> : (
                    <ol className="flex flex-col gap-2">
                        {[...answers].sort((a, b) => a.at - b.at).map((a, i) => (
                            <li key={a.askedId} className="flex flex-col gap-1 border p-3 text-sm">
                                <span className="text-muted-foreground">{i + 1}. {a.text}</span>
                                <span>You: <span className="font-medium">{a.answer}</span></span>
                                {a.correctLabel && <span className="text-xs">Correct: <span className="font-medium">{a.correctLabel}</span></span>}
                            </li>
                        ))}
                    </ol>
                )}
            </DialogContent>
        </Dialog>
    );
}

function RenameDialog({ open, onOpenChange, current, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; current: string; onSave: (n: string) => void }) {
    const [name, setName] = useState(current);
    return (
        <Dialog open={open} onOpenChange={o => {
            if (o) setName(current);
            onOpenChange(o);
        }}>
            <DialogContent>
                <DialogHeader><DialogTitle>Change your name</DialogTitle></DialogHeader>
                <form className="flex flex-col gap-3" onSubmit={e => {
                    e.preventDefault();
                    if (name.trim()) onSave(name.trim());
                    onOpenChange(false);
                }}>
                    <div className="flex gap-2">
                        <Input value={name} onChange={e => setName(e.target.value.slice(0, 40))} autoFocus className="h-11 flex-1 text-base md:text-base" aria-label="Name"/>
                        <Button type="button" variant="outline" className="h-11" onClick={() => setName(randomName())} aria-label="Random name">🎲</Button>
                    </div>
                    <DialogFooter><Button type="submit" disabled={!name.trim()}>Save</Button></DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function LeaveButton({ onLeave }: { onLeave: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><LogOut/> Leave</Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Leave the session?</DialogTitle>
                        <DialogDescription>Your teacher will see that you left. You can join again with the PIN.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Stay</Button>
                        <Button variant="destructive" onClick={onLeave}>Leave</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
