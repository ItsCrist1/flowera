# ASR server (home GPU)

Transcribes the lesson on the RX 9070 XT with **VibeVoice-ASR** (Romanian, English and 50+ other languages, with speaker
labels). It runs on your PC; the Flowera website talks to it over HTTPS.

```
teacher's browser ──HTTPS──▶ Caddy :443 ──▶ gateway.mjs :8787 ──▶ audiocpp_server :8091 ──▶ GPU
                    (60 s WAV chunks, signed ticket)  (queue, ticket check)   (VibeVoice-ASR Q8_0, ~11 GB VRAM)
```

- **Audio is never written to disk.** The gateway holds each chunk in memory and forwards it. audio.cpp decodes WAV
  uploads in memory.
- **Only Flowera can use it.** Every request carries a short-lived ticket signed by the website (`/api/asr-ticket`)
  with a secret only the website and this PC know.
- **Fallback:** if this PC is off or busy, teachers' browsers fall back to the browser's own speech recognition and
  show a warning.

Phase 0 measurements (speed, quality, VRAM) are in [`docs/asr/phase0.md`](../docs/asr/phase0.md).

## What's already done on this PC

Everything lives in `~/flowera-asr/` (outside the repo):

| Path | What |
|---|---|
| `audio.cpp/` | audio.cpp, built with HIP for `gfx1201`: `audio.cpp/build/linux-hip-release/bin/audiocpp_server` |
| `models/VibeVoice-ASR-GGUF/vibevoice-asr-q8_0.gguf` | The model (9.9 GB) |
| `audiocpp.json` | audio.cpp server config (port 8091, HIP backend) |
| `gateway.env` | `ASR_TICKET_SECRET` (shared with the website) and `ALLOWED_ORIGINS` |
| `tests/` | The Romanian/English test clips from Phase 0 |

## Run it by hand

```bash
# Terminal 1: the model server (takes ~5 s to load the model onto the GPU)
cd ~/flowera-asr && ./audio.cpp/build/linux-hip-release/bin/audiocpp_server --config audiocpp.json

# Terminal 2: the gateway
cd ~/WebstormProjects/flowera && set -a && . ~/flowera-asr/gateway.env && set +a && npm run asr:gateway

# Check
curl http://127.0.0.1:8787/health      # {"ok":true,"upstream":true,"queued":0,...}
```

## Run it as services (starts with your session)

```bash
mkdir -p ~/.config/systemd/user
cp asr-server/systemd/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now flowera-audiocpp flowera-asr-gateway
journalctl --user -u flowera-asr-gateway -f      # logs: sizes and timings only, never content
```

The gateway unit expects the repo at `~/WebstormProjects/flowera`. Edit `ExecStart` if you move it.

## Expose it to the internet (you need to do this)

1. **Check you're not behind CGNAT.** Your router's WAN IP must equal what https://ifconfig.me shows. If it doesn't,
   port forwarding can't work; ask your ISP for a public IP, or use a tunnel instead.
2. **DNS:** create an `A` record such as `asr.floweratrustlens.tech` pointing at your public IP. If your IP changes,
   use your registrar's or router's dynamic-DNS feature.
3. **Router:** forward TCP **80** and **443** to this PC's LAN IP (80 is needed once, for the certificate).
4. **Firewall (Fedora):** `sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload`
5. **Caddy (HTTPS):** `sudo dnf install caddy`, then put [`Caddyfile`](Caddyfile) (with your hostname) at
   `/etc/caddy/Caddyfile` and run `sudo systemctl enable --now caddy`.
6. **Allow the website's origin:** in `~/flowera-asr/gateway.env`, set
   `ALLOWED_ORIGINS=https://www.floweratrustlens.tech,https://floweratrustlens.tech` (keep `http://localhost:3000` for
   development), then `systemctl --user restart flowera-asr-gateway`.
7. **Tell the website:** in Vercel, set `ASR_GATEWAY_URL=https://asr.floweratrustlens.tech` and `ASR_TICKET_SECRET` to
   the same value as in `gateway.env`.
8. Test from outside: `curl https://asr.floweratrustlens.tech/health`.

## Configuration (environment variables of `gateway.mjs`)

| Variable | Default | Meaning |
|---|---|---|
| `ASR_TICKET_SECRET` | (required) | Shared with the website; 16+ characters |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated browser origins allowed to call it |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Where the gateway listens (Caddy proxies to it) |
| `AUDIOCPP_URL` | `http://127.0.0.1:8091` | audio.cpp server |
| `AUDIOCPP_MODEL` | `vibevoice-asr` | Model id from `audiocpp.json` |
| `CONCURRENCY` | `1` | Parallel jobs. One model instance fits in 16 GB, so keep 1 |
| `MAX_QUEUE` | `24` | Waiting jobs before it answers "busy" (browsers then fall back) |
| `MAX_BODY_MB` / `JOB_TIMEOUT_S` | `25` / `180` | Upload size and per-job limits |

At about 8× real time, one GPU handles roughly 6–7 classrooms recording at once.

## Rebuilding audio.cpp (Fedora)

Fedora installs ROCm under `/usr`, so the stock build script needs two extra steps. See
[`docs/asr/phase0.md`](../docs/asr/phase0.md#build-notes-fedora-specific).
