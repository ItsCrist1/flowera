import { NavTabs } from "@/components/nav/nav-tabs";
import {OrientationToggle} from "@/components/nav/orientation-toggle";
import {ThemeToggle} from "@/components/theme/theme-toggle";
import {ResizableAside} from "@/components/nav/resizable-aside";
import Image from "next/image";

export function SideBar({width}: {width: number}) {
    return (
        <ResizableAside initialWidth={width}>
            <Image src="/flowera.png" width={120} height={68} alt="Flowera Logo"
                   className="dark:invert @max-[120px]:hidden" loading="eager"/>
            <Image src="/icons/flowera.png" width={40} height={40} alt="Flowera Logo"
                   className="dark:invert hidden @max-[120px]:block"/>

            <NavTabs orientation="vertical"/>

            <div className="mt-auto flex flex-row justify-evenly gap-2 @max-[120px]:flex-col @max-[120px]:items-center">
                <ThemeToggle/>
                <OrientationToggle orientation="vertical"/>
            </div>
        </ResizableAside>
    );
}