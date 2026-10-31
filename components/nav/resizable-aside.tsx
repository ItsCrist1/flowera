"use client"

import { useState } from "react";
import {clampSidebarWidth, SIDEBAR_DEFAULT, SIDEBAR_WIDTH_COOKIE} from "@/components/nav/orientation";

export function ResizableAside({ initialWidth, cookieName, children }: { initialWidth: number; cookieName?: string, children: React.ReactNode }) {
    const [width, setWidth] = useState(initialWidth);

    function startDrag(e: React.PointerEvent) {
        e.preventDefault();
        const startX = e.clientX, startWidth = width;
        let current = startWidth;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";

        const onMove = (ev: PointerEvent) => {
            current = clampSidebarWidth(startWidth + ev.clientX - startX);
            setWidth(current);
        };

        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${Math.round(current)}; path=/; max-age=31536000`;
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, { once: true });
    }

    return (
        <aside style={{ width }} className="@container sticky top-0 flex shrink-0 flex-col gap-6 border-r bg-sidebar p-3 [view-transition-name:nav-shell]">
            {children}
            <div onPointerDown={startDrag}
                 onDoubleClick={() => {
                     setWidth(SIDEBAR_DEFAULT);

                     if(cookieName)
                        document.cookie = `${cookieName}=${SIDEBAR_DEFAULT}; path=/; max-age=31536000`;
                 }}
                 className="absolute inset-y-0 -right-1 w-2 cursor-col-resize hover:bg-border/60 transition-colors"/>
        </aside>
    );
}