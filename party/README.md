# Room relay (Cloudflare Workers)

One [partyserver](https://github.com/cloudflare/partykit/tree/main/packages/partyserver) Durable Object per session
PIN. The teacher's browser makes every decision; the room only:

- authenticates the teacher with the token from the first host connection (so nobody can hijack a PIN),
- relays student events (join, answer, rename, leave, disconnect) to the teacher, buffering them while the teacher is
  away, and replays them on reconnect,
- keeps the latest public snapshot so late joiners and reconnecting students see the open question,
- pauses the session for students when the teacher's last tab disconnects,
- deletes itself 24 h after the last activity.

The protocol is in [`lib/session/protocol.ts`](../lib/session/protocol.ts) (shared with the app).

## Develop

```bash
npm run party:dev     # http://127.0.0.1:8799, with NEXT_PUBLIC_PARTY_HOST=127.0.0.1:8799 in .env.development.local
npm run party:check   # type-check
```

## Deploy (you need to do this once)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. From the repo root: `npx wrangler login` (opens a browser), then `npm run party:deploy`.
3. Wrangler prints a URL such as `https://flowera-rooms.<your-subdomain>.workers.dev`.
4. In Vercel, set `NEXT_PUBLIC_PARTY_HOST=flowera-rooms.<your-subdomain>.workers.dev` (no `https://`) and redeploy.

The free plan includes SQLite-backed Durable Objects, which this uses. Check health with
`curl https://flowera-rooms.<your-subdomain>.workers.dev/health`.
