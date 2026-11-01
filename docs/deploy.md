# Deploy checklist

Everything that needs your accounts, router or domain. Do the steps in order; each takes a few minutes.
Code and local setup are done. See the end for what was verified locally.

## 1. Room relay → Cloudflare (≈5 min)

```bash
npx wrangler login          # opens a browser; create a free account if needed
npm run party:deploy        # prints https://flowera-rooms.<subdomain>.workers.dev
curl https://flowera-rooms.<subdomain>.workers.dev/health    # {"ok":true}
```

Keep the host (`flowera-rooms.<subdomain>.workers.dev`) for step 2. Details: [`party/README.md`](../party/README.md).

## 2. Web app → Vercel (≈10 min)

1. Push the `overnight-build` branch (or merge it into `main`) to GitHub.
2. In Vercel, import the repo (framework: Next.js, defaults are fine).
3. Environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_PARTY_HOST` | `flowera-rooms.<subdomain>.workers.dev` (no `https://`) |
   | `ASR_GATEWAY_URL` | `https://asr.floweratrustlens.tech` (after step 3; leave empty until then) |
   | `ASR_TICKET_SECRET` | the value from `~/flowera-asr/gateway.env` |

4. Domains: add `floweratrustlens.tech` and `www.floweratrustlens.tech`, then follow Vercel's DNS instructions at your
   registrar.
5. Redeploy after changing environment variables. `NEXT_PUBLIC_*` values are baked in at build time.

> The old `.env` / `.env.local` variables (`AUTH_*`, `BETTER_AUTH_SECRET`, `DATABASE_URL`) are no longer used. Login and
> the Supabase database were removed, so you can delete those variables and pause or delete the Supabase project.

## 3. Home GPU transcription (≈20 min)

Follow [`asr-server/README.md` → "Expose it to the internet"](../asr-server/README.md#expose-it-to-the-internet-you-need-to-do-this):
CGNAT check → DNS `A` record for `asr.floweratrustlens.tech` → forward ports 80/443 → firewall → Caddy → add the
production origin to `ALLOWED_ORIGINS` → set `ASR_GATEWAY_URL` in Vercel.

Then start the services (or run them by hand for the demo):

```bash
cp asr-server/systemd/*.service ~/.config/systemd/user/ && systemctl --user daemon-reload
systemctl --user enable --now flowera-audiocpp flowera-asr-gateway
```

The PC only has to be on while Flowera is in use. When it's off, teachers get the browser fallback and a warning.

## 4. Smoke test (≈5 min)

1. On a laptop: open the site → Automated → Create session. In the lobby, the realtime badge must not say "offline".
2. On a phone (mobile data, not the school Wi-Fi, to test from outside): scan the QR code, join.
3. Start. The AI panel should say **GPU transcription**. Talk for a minute, then press **Generate a question now**.
4. Answer on the phone; toggle **Show answers** on the laptop to see the chart.

## Verified locally on 2026-11-01

- VibeVoice-ASR on the RX 9070 XT via audio.cpp/HIP: ~8× real time, good Romanian ([phase0.md](asr/phase0.md)).
- A full teacher + two-student session in headless Chromium: join, reconnect mid-question, answers, early close,
  pause/resume, end, shared report, history, anonymous JSON/CSV export.
- The AI path with real audio: a Romanian recording played into a fake microphone → GPU transcription → Kilo
  (`kilo-auto/free`) → approval card → question on the student's phone, about 80 s after start.
- End-of-session AI analysis through Kilo.
- LLM7.io's keyless tier answered once, then returned "Daily token quota exceeded"; that's why Kilo is the default.

**Not verified** (needs your accounts or a real classroom): the deployed Cloudflare/Vercel setup, access from outside
your network, Safari/iOS behavior, the Web Speech fallback in a real browser, and transcription quality with a real
classroom microphone.
