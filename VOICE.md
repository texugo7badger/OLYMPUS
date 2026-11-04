# OLYMPUS — voices

> v0.0.78 · The gods speak through the best engine the machine actually has,
> in the user's language, with a per-god profile. A probe decides — never a
> claim.

## The ladder (probed, best first)

| Engine | License | Languages | Cloning | Emotion | Needs |
|---|---|---|---|---|---|
| **Chatterbox Multilingual V3** | MIT | 23+ | zero-shot ~5s | exaggeration 0.25–2.0 | local sidecar on `:4123`, GPU recommended |
| **Kokoro 82M** | Apache-2.0 | 8 | no | no | `pip install kokoro`, CPU-friendly |
| **edge-tts** | free service | 40+ | no | no | `pip install edge-tts` (zero-install default) |

`GET /api/olympus/voice/status` returns the ladder with `available`, `detail`,
`setup` and `preferred`. The probe answers only when the engine answers:
Chatterbox is `available` when `http://127.0.0.1:4123/health` responds, Kokoro
when `python3 -c "import kokoro"` succeeds, edge-tts when `import edge_tts`
succeeds.

**Why this order.** Chatterbox is the only permissively-licensed engine that
combines zero-shot cloning, emotion control and 23+ languages (MIT). Kokoro is
the best CPU-only quality per watt (Apache-2.0, 82M). edge-tts stays the
default because it needs no model download and already speaks all seven UI
languages. **XTTS v2 is not used**: its weights are non-commercial, which is
incompatible with an AGPL project that can be hosted commercially.

## Per-god profiles

Each god keeps its own identity in `src/app/api/olympus/voice/speak/route.ts`:
a gender-true voice pool per language (so Apollo and Atlas never share the
exact same voice when the pool has more than one), plus a pitch/rate profile
(`PROFILE`) that shapes the delivery. The profile is the personality floor;
the god's own words carry the rest.

| God | Pitch | Rate | Voice family |
|---|---|---|---|
| Apollo | 0.92 | 0.96 | male |
| Atlas | 0.78 | 0.90 | male |
| Artemis | 1.06 | 1.00 | female |
| Athena | 1.02 | 0.97 | female |
| Dionysus | 1.12 | 1.04 | male |
| Hephaestus | 0.70 | 0.88 | male |
| Hermes | 1.05 | 1.06 | male |
| Persephone | 0.96 | 0.93 | female |
| Prometheus | 0.84 | 0.96 | male |
| Callimachus | 1.00 | 0.90 | female |

## Chatterbox (the human lane)

The sidecar is [travisvn/chatterbox-tts-api](https://github.com/travisvn/chatterbox-tts-api)
(FastAPI, OpenAI-compatible) wrapping [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox):

```bash
git clone https://github.com/travisvn/chatterbox-tts-api
cd chatterbox-tts-api
uv sync
cp .env.example .env          # DEVICE=auto, USE_MULTILINGUAL_MODEL=true
uv run uvicorn app.main:app --host 127.0.0.1 --port 4123
```

- **Language correctness**: the API picks the language from the *voice
  metadata*. Upload one reference voice per language you speak:

  ```bash
  curl -X POST http://localhost:4123/voices \
    -F "voice_name=olympus-pt" -F "language=pt" \
    -F "voice_file=@pt-reference.wav"
  ```

  Without a voice for the language, Chatterbox defaults to English — which is
  why OLYMPUS keeps edge-tts as the language-correct fallback until a voice is
  registered.
- **Emotion**: `exaggeration` 0.25–2.0, `cfg_weight` 0.0–1.0, `temperature`
  0.05–5.0. The per-god profile will map to these when the sidecar is wired.
- **Watermark**: every file carries Resemble's inaudible PerTh watermark.
- **CPU**: possible (`DEVICE=cpu`) but slow; a GPU is recommended.

## Kokoro (the CPU lane)

```bash
pip install kokoro
# 82M, Apache-2.0, 54 voices, 8 languages; no cloning
```

## Honest limits

- **The speak route still uses edge-tts for synthesis**; the ladder is probed
  and reported, and the Chatterbox synthesis path lands when a language voice
  is registered (the language-metadata rule above is why it is not switched
  blindly).
- **No engine was installed on this machine at the time of writing**; the
  status route reports `available: false` with the exact setup command.
- **Cloning a real person's voice requires consent**; OLYMPUS never clones
  without an explicit reference the user provides.
