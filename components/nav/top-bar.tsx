import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NavTabs } from "@/components/nav/nav-tabs";
import {OrientationToggle} from "@/components/nav/orientation-toggle";
import Image from "next/image";

export function TopBar() {
    return (
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-4 border-b bg-background/70 px-4 backdrop-blur [view-transition-name:nav-shell]">
            <div className="flex min-w-0 items-center gap-6">
                <Image src="/flowera.png" width={120} height={68} alt="Flowera Logo"
                       className="dark:invert hidden sm:block" loading="eager"/>
                <Image src="/icons/flowera.png" width={40} height={40} alt="Flowera Logo"
                       className="dark:invert sm:hidden"/>

                <NavTabs orientation="horizontal"/>
            </div>

            <div className="flex shrink-0 items-center gap-4">
                <OrientationToggle orientation="horizontal"/>
                <ThemeToggle/>
            </div>
        </header>
    );
}