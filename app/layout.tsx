import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/nav/top-bar";
import { SideBar } from "@/components/nav/side-bar";
import { NavShell } from "@/components/nav/nav-shell";
import { ORIENTATION_COOKIE, SIDEBAR_WIDTH_COOKIE, clampSidebarWidth, type Orientation } from "@/components/nav/orientation";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-mono" });

const description = "Live, anonymous comprehension checks for the classroom.";

export const metadata: Metadata = {
    metadataBase: new URL("https://www.floweratrustlens.tech"),
    title: {
        default: "Flowera",
        template: "%s · Flowera",
    },
    description,
    icons: {
        icon: [
            { url: "/icons/flowera.png", media: "(prefers-color-scheme: light)" },
            { url: "/icons/flowera_white.png", media: "(prefers-color-scheme: dark)" },
        ],
        apple: "/icons/flowera_white.png",
    },
    applicationName: "Flowera",
    openGraph: {
        type: "website",
        siteName: "Flowera",
        title: "Flowera",
        description,
        url: "/",
        locale: "en_US",
    },
    twitter: {
        card: "summary_large_image",
        title: "Flowera",
        description,
    },
};

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    ],
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
        <ThemeProvider>
            <TooltipProvider>
                <Toaster/>
                <NavShell initial={orientation} topBar={<TopBar/>} sideBar={<SideBar width={width}/>}>
                    {children}
                </NavShell>
            </TooltipProvider>
        </ThemeProvider>
        </body>
        </html>
    );
}
