import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Github from "next-auth/providers/github"
import Discord from "next-auth/providers/discord"

import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { users, accounts, sessions, verificationTokens } from "@/db/schema"

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
    providers: [Google, Github, Discord],
    callbacks: {
        session: ({ session, user }) => ({ ...session, user: { ...session.user, id: user.id } }),
    },
})