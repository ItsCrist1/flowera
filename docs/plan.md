# Flowera — Build plan

The spec is in [spec.md](spec.md). Each phase ends in a working state and its own commit. Tick the boxes as phases
land, so work can resume cleanly after any interruption, such as a usage limit.

Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (Next 16.4 has breaking
changes; see `AGENTS.md`).

## Phase 0 — ASR feasibility on the RX 9070 XT (do first, it de-risks everything)
- [x] Build audio.cpp with `--backend hip`; fall back to `vulkan` if HIP fails.
- [x] Download the model. The cstr GGUF didn't work; audio.cpp's own `audio-cpp/audio.cpp-gguf` package did.
- [x] Transcribe English and Romanian samples. Record the real-time factor, VRAM use, and quality by eye.
- [x] Confirm nothing (audio or temp files) is written to disk during transcription.
- [x] Write the results into `docs/asr/phase0.md`. If it fails, stop and report before going further.

## Phase 1 — Cleanup and skeleton
- [x] Remove Auth.js, Drizzle/Postgres, `/api/models`, the old `/api/llm`, the provider and chat tables, and the
      unused dependencies and env vars.
- [x] Fix the doubled flex wrapper in `layout.tsx`; update the metadata.
- [x] New tabs: New session `/`, Join `/join`, History `/history`; placeholder pages.
- [x] `npm run lint` and `npm run build` pass.

## Phase 2 — Panel 0 (template tiles)
- [ ] The rhombus pattern, four tiles, colors matched to `design.png`, and shared-edge coloring (hover/selected/blend).
- [ ] Keyboard navigation, mobile layout, and the choice persisted to `localStorage`.

## Phase 3 — Panels 1 and 2 and the question builder
- [ ] A config schema (zod) with the four templates as presets.
- [ ] The question builder: MC / TF / Number, correct answers, limits, time override, the "On timeline" toggle,
      reordering.
- [ ] Panel 1 per template; Panel 2 with Questions, AI and Advanced sections; Worriless's big Continue button.
- [ ] Everything persisted to `localStorage`.

## Phase 4 — Realtime room and joining
- [ ] A `party/` partyserver room: host token, presence, snapshot, message types (spec §11).
- [ ] Teacher lobby: PIN and QR code.
- [ ] Student join: PIN/QR, consent, default name, reconnect via client ID, Leave.
- [ ] Tested locally with `wrangler dev` and several browser tabs.

## Phase 5 — Live session core (no AI yet)
- [ ] Question open/close, student answering, Not answered, early close.
- [ ] Queue, timeline, manual send.
- [ ] Pause/resume (manual and on teacher disconnect) freezing all timers.
- [ ] The Show answers toggle, live pie charts, the trends chart, the students panel, the color-coded event log.
- [ ] Student idle screen, their own history, late joiners.

## Phase 6 — LLM
- [ ] Provider and model pickers with icons (copied from trustlens); live keyless-model lists.
- [ ] LLM7 called directly from the browser; Kilo via a locked-down `/api/llm` proxy.
- [ ] The check loop: interval, skip rule, transcript window, cooldown, the three trigger modes, Generate now.
- [ ] Tolerant JSON parsing with zod validation and one retry.
- [ ] The approval card with editing and the timeout policy.

## Phase 7 — ASR client and gateway
- [ ] Teacher mic capture (AudioWorklet → 16 kHz PCM16), in-memory chunks, sending.
- [ ] The `asr-server/` gateway: ticket check, FIFO queue to audio.cpp, `/health`.
- [ ] The `/api/asr-ticket` route (HMAC with a shared secret).
- [ ] Web Speech fallback with a visible warning and automatic switch-back.
- [ ] A Caddyfile, a systemd unit, and `asr-server/README.md` covering port forwarding, DDNS and CGNAT checks.

## Phase 8 — End of session
- [ ] Summary screen, Share report to students, the optional LLM analysis (anonymous aggregates only).
- [ ] History page: view, delete, export JSON/CSV (no names), import JSON.

## Phase 9 — Polish and verification
- [ ] An end-to-end run with a teacher plus several student tabs, covering pause, reconnects and an ASR outage.
- [ ] Lint and build clean; update `README.md` to match the spec.

## Needs you (can't be done unattended)
- [ ] A Cloudflare account and the first `wrangler deploy` of the room.
- [ ] Router port forwarding (443 → the PC), a DNS record and DDNS for the ASR hostname, and a CGNAT check.
- [ ] A Vercel project, environment variables (the ASR ticket secret, the room URL), and pointing `floweratrustlens.tech`.
- [ ] Keeping the PC awake while running unattended overnight.
