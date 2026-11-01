"use client"

import { PanelLeft, PanelTop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ORIENTATION_COOKIE, type Orientation } from "@/components/nav/orientation";
import {flushSync} from "react-dom";
import {useSetOrientation} from "@/components/nav/nav-shell";

export function OrientationToggle({ orientation }: { orientation: Orientation }) {
    const setOrientation = useSetOrientation();
    const next = orientation === "horizontal" ? "vertical" : "horizontal";

    return (
        <Button variant="outline" size="icon" className="size-10 rounded-full cursor-pointer"
                aria-label={`Switch to ${next} tabs`}
                onClick={() => {
                    document.cookie = `${ORIENTATION_COOKIE}=${next}; path=/; max-age=31536000`;
                    if (!document.startViewTransition)
                        return setOrientation(next);
                    document.startViewTransition(() => flushSync(() => setOrientation(next)));
                }}>
            {orientation === "horizontal" ? <PanelLeft/> : <PanelTop/>}
        </Button>
    );
}