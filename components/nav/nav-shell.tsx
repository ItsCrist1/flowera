"use client"

import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";
import type { Orientation } from "@/components/nav/orientation";

const SetOrientationContext = createContext<(o: Orientation) => void>(() => {});
export const useSetOrientation = () => useContext(SetOrientationContext);

export function NavShell({ initial, topBar, sideBar, children }: {
    initial: Orientation;
    topBar: React.ReactNode;
    sideBar: React.ReactNode;
    children: React.ReactNode;
}) {
    const [orientation, setOrientation] = useState(initial);

    return (
        <SetOrientationContext value={setOrientation}>
            {/* --top-bar-h lets full-height pages (panel 0) subtract the top bar. Keep in sync with TopBar's h-14. */}
            <div className={cn("flex flex-1", orientation === "horizontal" ? "flex-col [--top-bar-h:3.5rem]" : "flex-row")}>
                {orientation === "horizontal" ? topBar : sideBar}
                <main className="flex-1 min-w-0 [view-transition-name:page]">{children}</main>
            </div>
        </SetOrientationContext>
    );
}