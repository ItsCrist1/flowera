# Phase 0 — VibeVoice-ASR on the RX 9070 XT

**Result: it works.** Tested 2026-11-01 on this machine (Fedora 44, ROCm 7.1.1, RX 9070 XT / `gfx1201`, i7-14700KF).

## Setup that worked

| Piece | Value |
|---|---|
| Runtime | [audio.cpp](https://github.com/0xShug0/audio.cpp) at commit `8da1c39`, built with the **HIP** backend |
| Model | `audio-cpp/audio.cpp-gguf` → `VibeVoice-ASR-GGUF/vibevoice-asr-q8_0.gguf` (9.86 GB) |
| Location | `~/flowera-asr/` (outside the repo: `audio.cpp/`, `models/`, `audiocpp.json`, `tests/`) |

> The `cstr/vibevoice-asr-GGUF` file I first found is packaged for a different runtime; audio.cpp rejects it
> (`missing model package file 'tokenizer_json'`). Use audio.cpp's own package.

### Build notes (Fedora-specific)
Fedora installs ROCm under `/usr` rather than `/opt/rocm`, so the stock build script needs help:

1. Install `rocm-omp-devel`, otherwise CMake can't find OpenMP for ROCm's clang.
2. Configure with ROCm's clang, and point CMake's HIP root at `/usr`:

```bash
cd ~/flowera-asr/audio.cpp
ROCM_PATH=/usr/lib64/rocm/llvm ./scripts/build_linux.sh --backend hip --gpu-targets gfx1201 --ccache \
  --model-set custom --models vibevoice_asr --target audiocpp_cli --target audiocpp_server   # fails at HIP detection, but creates the build dir
cmake -S . -B build/linux-hip-release -DCMAKE_HIP_COMPILER_ROCM_ROOT=/usr \
  -DCMAKE_HIP_COMPILER=/usr/lib64/rocm/llvm/bin/clang++ -DCMAKE_HIP_COMPILER_LAUNCHER=ccache
cmake --build build/linux-hip-release --target audiocpp_cli audiocpp_server -j 26
```

## Measurements

| Audio | Length | Wall time | Speed |
|---|---|---|---|
| English, 4 speakers (bundled sample) | 28 s | 4.3 s (CLI, includes model load) | 6.5× real time |
| Romanian, Creangă "Ursul păcălit de vulpe" excerpt | 60 s | 7.3 s (server, model warm) | 8.2× real time |
| Romanian, the full story | 5 min 34 s | 47 s (CLI) | 7.1× real time |

- **VRAM:** 11.1 GB with the model loaded, so **one instance** fits in 16 GB.
- **Throughput:** at about 8× real time, one GPU keeps up with roughly **6–7 classrooms recording at once**. The gateway
  queue covers short bursts beyond that.

## Quality

- **English:** the 4-speaker sample came out word-perfect, with **4 distinct speaker IDs** in the right places.
- **Romanian** (a LibriVox narration, compared by eye to Creangă's text): about one word in twenty is wrong, with
  diacritics correct. Examples:
  - "se o nată" for "de o noapte"
  - "Făgându-se" for "Făcându-se"
  - "macinea" for "marginea"

  That's ample for the LLM to follow what the lesson is about.
- Speaker turns come back from `POST /v1/audio/transcriptions/details` as `speaker_turns`, with
  `speaker_id`, sample offsets and text.

## Privacy check

- audio.cpp's docs state that multipart WAV uploads are "decoded in memory and are not written to a temporary file".
  The MP3/FLAC frontend that *does* use temp files isn't built here, and our gateway only sends WAV.
- The gateway (`asr-server/`) keeps audio in memory only.

## Not tested

- A real classroom: room echo, students far from the mic, several people talking over each other.
- Switching between Romanian and English within one sentence (the model card says it handles this).
