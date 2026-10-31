import { pgTable, text, timestamp, integer, primaryKey } from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"

export const users = pgTable("user", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image")
});

export const accounts = pgTable("account", {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state")
}, (a) => [primaryKey({ columns: [a.provider, a.providerAccountId] })])

export const sessions = pgTable("session", {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull()
})

export const verificationTokens = pgTable("verificationToken", {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull()
}, (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })])

export const providerSettings = pgTable("provider_settings", {
    id: text("id").primaryKey().$default(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    apiKey: text("apiKey").notNull().default(""),
    provider: text("provider").notNull(),
    endpoint: text("endpoint").notNull().default(""),
    models: text("models").array().notNull().default([]),
    kind: text("kind").notNull().default(""),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow()
})

export const llmChats = pgTable("llm_chat", {
    id: text("id").primaryKey().$default(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    settingId: text("settingId").references(() => providerSettings.id, { onDelete: "set null" }),
    model: text("model"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const llmMessages = pgTable("llm_message", {
    id: text("id").primaryKey().$default(() => crypto.randomUUID()),
    chatId: text("chatId").notNull().references(() => llmChats.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    content: text("content").notNull(),
    model: text("model"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});