import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/nav/top-bar";
import Providers from "@/components/providers/providers"
import { Toaster } from "@/components/ui/sonner";

import { cookies } from "next/headers";
import { SideBar } from "@/components/nav/side-bar";
import { ORIENTATION_COOKIE, SIDEBAR_WIDTH_COOKIE, clampSidebarWidth, type Orientation } from "@/components/nav/orientation";
import {NavShell} from "@/components/nav/nav-shell";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
    metadataBase: new URL("https://www.floweratrustlens.tech"),
    title: {
        default: "Flowera",
        template: "%s · Flowera",
    },
    description: "AI Powered Education",

    icons: {
        icon: [
            { url: "/icons/flowera.png", media: "(prefers-color-scheme: light)" },
            { url: "/icons/flowera_white.png", media: "(prefers-color-scheme: dark)" },
        ],

        apple: "/icons/flowera_white.png"
    },

    applicationName: "Flowera",
    openGraph: {
        type: "website",
        siteName: "Flowera",
        title: "Flowera",
        description: "Education made comprehensive.",
        url: "/",
        locale: "en_US",
    },
    twitter: {
        card: "summary_large_image",
        title: "Flowera",
        description: "Education made comprehensive.",
    },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
    const cookieStore = await cookies();

    const orientation: Orientation = cookieStore.get(ORIENTATION_COOKIE)?.value === "vertical" ? "vertical" : "horizontal";
    const width = clampSidebarWidth(Number(cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value ?? NaN));

    return (
        <html lang="en"
              suppressHydrationWarning
              className={cn("h-full", "antialiased", "font-mono", jetbrainsMono.variable)}>

        <body className="min-h-full flex flex-col">
        <Providers>
            <ThemeProvider>
                <Toaster/>
                <div className={cn("flex flex-1", orientation === "horizontal" ? "flex-col" : "flex-row")}>
                    <NavShell initial={orientation} topBar={<TopBar/>} sideBar={<SideBar width={width}/>}>
                        {children}
                    </NavShell>
                </div>
            </ThemeProvider>
        </Providers>
        </body>

        </html>
    );
}