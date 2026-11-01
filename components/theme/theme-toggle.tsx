"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();

    return (
        <Button
            className="size-10 rounded-full cursor-pointer"
            variant="outline"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => {
                const next = resolvedTheme === "dark" ? "light" : "dark";
                if(!document.startViewTransition)
                    return setTheme(next);

                const html = document.documentElement;
                html.dataset.themeSwitch = "";
                const transition = document.startViewTransition(() => {
                    html.classList.toggle("dark", next === "dark");
                    setTheme(next);
                });

                transition.finished.finally(() => delete html.dataset.themeSwitch);
            }}>

            <Sun className="dark:hidden"/>
            <Moon className="hidden dark:block"/>
        </Button>
    );
}