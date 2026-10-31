"use client";

import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const subscribeNoop = () => () => {};

export function useJoinUrl(pin: string) {
    const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "");
    return { url: `${origin}/join?pin=${pin}`, display: `${origin.replace(/^https?:\/\//, "")}/join` };
}

export function formatPin(pin: string) {
    return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

/** Big PIN + QR, sized for a projector. */
export function JoinInfo({ pin, size = "lg", className }: { pin: string; size?: "md" | "lg"; className?: string }) {
    const { url, display } = useJoinUrl(pin);
    return (
        <div className={cn("flex flex-col items-center gap-6 md:flex-row md:gap-10", className)}>
            <div className="bg-white p-3 shadow-sm">
                {url && <QRCodeSVG value={url} size={size === "lg" ? 240 : 160} level="M" marginSize={0} title={`QR code for ${url}`}/>}
            </div>
            <div className="flex flex-col items-center gap-2 md:items-start">
                <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Join at</span>
                <span className={cn("font-semibold", size === "lg" ? "text-2xl" : "text-lg")}>{display}</span>
                <span className="mt-2 text-sm uppercase tracking-[0.3em] text-muted-foreground">with PIN</span>
                <span className={cn("font-bold tabular-nums tracking-wider", size === "lg" ? "text-7xl md:text-8xl" : "text-5xl")}>{formatPin(pin)}</span>
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => {
                    void navigator.clipboard?.writeText(url);
                    toast.success("Join link copied.");
                }}>
                    <Copy/> Copy link
                </Button>
            </div>
        </div>
    );
}

export function JoinOverlay({ pin, open, onOpenChange, studentCount }: {
    pin: string; open: boolean; onOpenChange: (o: boolean) => void; studentCount: number;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-w-[min(1100px,95vw)] flex-col items-center gap-8 p-10 sm:max-w-[min(1100px,95vw)]">
                <DialogTitle className="sr-only">How to join</DialogTitle>
                <JoinInfo pin={pin}/>
                <p className="text-lg text-muted-foreground tabular-nums">{studentCount} joined</p>
            </DialogContent>
        </Dialog>
    );
}
