"use client"

import {signIn, signOut, useSession} from "next-auth/react"
import Image from "next/image"

import {
    DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const authProviders = [
    { id: "google", name: "Google", icon: "/icons/google.svg", iconClass: "" },
    { id: "github", name: "GitHub", icon: "/icons/github.svg", iconClass: "dark:invert" },
    { id: "discord", name: "Discord", icon: "/icons/discord.svg", iconClass: "" },
] satisfies { id: string; name: string; icon: string; iconClass: string }[];

const avatarClass = "relative w-10 h-10 rounded-full overflow-hidden border-2 border-gray-300 hover:opacity-80 transition cursor-pointer"

export default function LoginButton() {
    const { data: session, status } = useSession();

    if(status === "loading")
        return <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse"/>

    const user = session?.user;

    return(
        <DropdownMenu>
            <DropdownMenuTrigger className={avatarClass} title={user ? "Account" : "Sign In"}>
                <Image src={user?.image ?? "/icons/unknown-user.svg"}
                       alt={user?.name || "Unknown User"}
                       fill
                       sizes="40px"
                       className="object-cover"/>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="min-w-48">
                {user ? (
                    <>
                        <DropdownMenuGroup>
                            <DropdownMenuLabel>{user.name ?? user.email}</DropdownMenuLabel>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer">
                            Sign Out
                        </DropdownMenuItem>
                    </>
                ) : (
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Sign in with</DropdownMenuLabel>
                        {authProviders.map((p) => (
                            <DropdownMenuItem key={p.id} onClick={() => signIn(p.id)} className="cursor-pointer">
                                <Image src={p.icon} width={16} height={16} alt={`${p.name} logo`} className={p.iconClass}/>
                                {p.name}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}