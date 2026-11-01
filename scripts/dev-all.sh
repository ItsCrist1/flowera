#!/usr/bin/env bash
# Start the whole local stack for development or a demo on this PC:
#   room relay (8799) · Next.js (3000) · audio.cpp + VibeVoice-ASR on the GPU (8091) · ASR gateway (8787)
# Ctrl+C stops everything. Students on the same Wi-Fi can join via http://<this-PC's-LAN-IP>:3000/join
# (set NEXT_PUBLIC_PARTY_HOST=<LAN-IP>:8799 in .env.development.local for that).
set -euo pipefail
cd "$(dirname "$0")/.."
ASR_HOME="${ASR_HOME:-$HOME/flowera-asr}"
pids=()
cleanup() { echo; echo "Stopping…"; kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if [[ -x "$ASR_HOME/audio.cpp/build/linux-hip-release/bin/audiocpp_server" && -f "$ASR_HOME/gateway.env" ]]; then
  (cd "$ASR_HOME" && ./audio.cpp/build/linux-hip-release/bin/audiocpp_server --config audiocpp.json 2>&1 | sed 's/^/[audiocpp] /') & pids+=($!)
  (set -a; . "$ASR_HOME/gateway.env"; set +a; node asr-server/gateway.mjs 2>&1 | sed 's/^/[gateway] /') & pids+=($!)
else
  echo "GPU transcription not set up in $ASR_HOME; teachers will use the browser fallback."
fi
(npx wrangler dev -c party/wrangler.jsonc --port 8799 --ip 0.0.0.0 2>&1 | sed 's/^/[rooms] /') & pids+=($!)
(npx next dev -H 0.0.0.0 -p 3000 2>&1 | sed 's/^/[next] /') & pids+=($!)
wait
