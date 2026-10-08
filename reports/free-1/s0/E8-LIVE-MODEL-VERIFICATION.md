# E8 — the live model verification (MADRUGA-FREE-1's probe gate, 2026-10-08)

> The #105 doctrine generalized: **a claim about model availability carries PROBE EVIDENCE or it
> is not made.** No anchor is assigned without its live ping. Everything below is verbatim from
> tonight's own probes (the public list + the user's key from the live config env, 5 anchor pings
> + 1 dead-pool re-verification — a rounding error on credits).

## 1. The public model list (no key needed)

```
$ curl -s https://integrate.api.nvidia.com/v1/models
→ reports/free-1/s0/nvidia-models-2026-10-08.json — 80 models live TODAY
```

Anchor presence check (verbatim output):

```
TOTAL MODELS: 80
PRESENT deepseek-ai/deepseek-v4.1-flash
PRESENT z-ai/glm-5.3
PRESENT z-ai/glm-5.3-flash
PRESENT moonshotai/kimi-k3
PRESENT meta/muse-glimmer-30b
--- nemotron family count: 16   (all banned by the user — zero gods assigned)
```

## 2. The anchor pings (one chat completion each, max_tokens 16, "reply OK")

Ping tool: `https://integrate.api.nvidia.com/v1/chat/completions`, Bearer `nvapi-…` (the
user's key from the live config env — `~/.local/share/opencode/auth.json` → `nvidia`).

### Round 1 (curl batch, 2026-10-08 ~03:15Z)

```
=== deepseek-ai/deepseek-v4.1-flash | HTTP 000 | --max-time 60 EXPIRED (no response bytes)
=== z-ai/glm-5.3 | HTTP 200 | {"id":"chatcmpl-6b54890d-…","choices":[{"message":{"content":null,
    "reasoning_content":"The user has sent \"reply OK\" - this is a minimal message."},…
    "finish_reason":"length",…],"model":"z-ai/glm-5.3","usage":{"prompt_tokens":14,"completion_tokens":16,…}}
=== z-ai/glm-5.3-flash | HTTP 200 | {"id":"chatcmpl-1b922d39-…",…,"model":"z-ai/glm-5.3-flash",…}
=== moonshotai/kimi-k3 | HTTP 200 | {"id":"chatcmpl-968f000a-…","choices":[{"message":{"content":"<|open|>response",…},…],"model":"moonshotai/kimi-k3",…}
=== meta/muse-glimmer-30b | HTTP 200 | {"id":"ba880fcf536875ef",…,"model":"meta/muse-glimmer-30b",…}
```

(The 16-token budget lands in `reasoning_content` before the content mouth opens on the
thinking models — `finish_reason:"length"` with `usage.completion_tokens:16` — the pool
SERVES. Kimi K3 emitted content directly.)

### Round 2 — the dead-pool re-verification (python urllib, proper latency)

```
deepseek-ai/deepseek-v4.1-flash | ERROR after 90335ms | TimeoutError: The read operation timed out
deepseek-ai/deepseek-v4.1-flash | ERROR after 90364ms | TimeoutError: The read operation timed out
```

### Round 3 — the green anchors with honest latency (verbatim file: `s0/e8-anchor-pings-green.txt`)

```
z-ai/glm-5.3 | HTTP 200 | 834ms | content='None' | usage=16 completion tokens
z-ai/glm-5.3-flash | HTTP 200 | 32367ms | content='None' | usage=16 completion tokens
moonshotai/kimi-k3 | HTTP 200 | 1181ms | content='OK' | usage=16 completion tokens
meta/muse-glimmer-30b | HTTP 200 | 1963ms | content='None' | usage=16 completion tokens
```

## 3. The verdict (the E8 discipline applied — honest adaptation, DISCLOSED)

| Anchor | Live list | Ping | Verdict |
|---|---|---|---|
| `deepseek-ai/deepseek-v4.1-flash` | PRESENT | **HTTP 000 ×3** (60s curl timeout, then 90,335ms + 90,364ms read timeouts) | **DEAD POOL tonight — EXCLUDED from the assignment** |
| `z-ai/glm-5.3` | PRESENT | HTTP 200, 834ms | **ASSIGNED** |
| `z-ai/glm-5.3-flash` | PRESENT | HTTP 200 ×2 (one ping slow at 32,367ms — completes, recorded honestly) | **ASSIGNED** |
| `moonshotai/kimi-k3` | PRESENT | HTTP 200 ×2, 1,181ms, said "OK" | **ASSIGNED** |
| `meta/muse-glimmer-30b` | PRESENT | HTTP 200 ×2, 1,963ms | **ASSIGNED** |
| every `nemotron-*` (16 in the list) | present | not pinged | **BANNED by the user — zero gods, forever** |

The deepseek pool accepts the connection and never completes the response — three consecutive
probes across two tools. The E8 law: a pool that fails the ping is recorded and EXCLUDED from
tonight's assignment. The reassignment consequence (apollo + hermes move off deepseek) is
disclosed in the distribution table in the CLOSE-OUT.

## 4. The honest context windows (per LIVE model card, 2026-10-08 — never inflated)

| Model | Context window | Source |
|---|---|---|
| `z-ai/glm-5.3` | 1,000,000 | curated override (refresh-free-models.js) + the GAP-1 s3 verification (2026-10-07) |
| `z-ai/glm-5.3-flash` | 1,000,000 | curated override + GAP-1 s3 verification |
| `moonshotai/kimi-k3` | **1,048,576** | LIVE model card build.nvidia.com/moonshotai/kimi-k3 — "Input Context Length (ISL): 1,048,576 tokens" (verified 2026-10-08) |
| `meta/muse-glimmer-30b` | **131,072** | LIVE model card build.nvidia.com/meta/muse-glimmer-30b — "Combined input and output context length is 131,072+ tokens" (verified 2026-10-08; NOT 1M — the honest window) |

The `/v1/models` API does not report context lengths — the cards are the truth. Kimi K3:
2.8T MoE / 104B active, function calling + structured output + reasoning, multimodal.
Muse Glimmer: 29.6B dense + ViT-G/14, function calling + reasoning, multimodal
(SWE-Bench Verified 76.0 for a 30B — the honest fast lane).

## 5. The rate-limit shape (the auditor's research, re-verified)

- Free-tier limit: **40 requests/minute PER API KEY** (aggregate across ALL models — NVIDIA
  developer forum + community docs). The observed "Service temporarily overloaded" is NOT the
  key limit (429) — it is **per-model serving-pool contention (503-class)**.
- Spreading gods across DIFFERENT MODELS spreads load across different inference pools — the
  real resilience win. The provider split adds client-side isolation on top.
