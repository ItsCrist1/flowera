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
            <div className={cn("flex flex-1", orientation === "horizontal" ? "flex-col" : "flex-row")}>
                {orientation === "horizontal" ? topBar : sideBar}
                <main className="flex-1 min-w-0 [view-transition-name:page]">{children}</main>
            </div>
        </SetOrientationContext>
    );
}