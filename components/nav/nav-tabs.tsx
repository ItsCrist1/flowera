"use client"

import { History, LogIn, type LucideIcon, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Top-level navigation. Add a tab here and it shows up in both the top bar and the sidebar. */
export const tabs = [
    { href: "/", label: "Session", icon: Sparkles, match: (p: string) => p === "/" },
    { href: "/join", label: "Join", icon: LogIn, match: (p: string) => p.startsWith("/join") },
    { href: "/history", label: "History", icon: History, match: (p: string) => p.startsWith("/history") },
] satisfies { href: string; label: string; icon: LucideIcon; match: (pathname: string) => boolean }[];

export function NavTabs({ orientation }: { orientation: "horizontal" | "vertical" }) {
    const pathname = usePathname();

    return (
        <nav className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "flex-row")}>
            {tabs.map(t => (
                <Link key={t.href} href={t.href}
                      aria-current={t.match(pathname) ? "page" : undefined}
                      className="rounded-lg px-3 py-2 transition-colors hover:bg-accent/60 aria-[current=page]:bg-accent @max-[120px]:px-0"
                      style={{ viewTransitionName: `nav-tab-${t.label.toLowerCase()}` }}>
                    <div className="flex items-center gap-2 @max-[120px]:justify-center">
                        <t.icon className="size-5 shrink-0"/>
                        <span className={cn("@max-[120px]:hidden", orientation === "horizontal" && "max-md:hidden")}>{t.label}</span>
                    </div>
                </Link>
            ))}
        </nav>
    );
}
