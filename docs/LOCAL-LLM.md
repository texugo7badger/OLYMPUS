# LOCAL-LLM — Running OLYMPUS on your own hardware (v0.0.22)

The `local` strategy is OLYMPUS's zero-cost path. It runs the full 10-god + 122-demigod
arsenal against an LLM server on your own machine — no plan, no API key, no data leaving
the box.

## Supported runtimes

| Runtime | Default endpoint | Model list |
|---|---|---|
| Ollama | `http://localhost:11434` | `GET /api/tags` |
| LM Studio | `http://localhost:1234` | `GET /v1/models` |
| vLLM | `http://localhost:8000` | `GET /v1/models` |
| llama.cpp server | `http://localhost:8080` | `GET /v1/models` |
| Any OpenAI-compatible | user-entered `baseURL` | `GET /v1/models` |

## Probe first

```bash
node scripts/local-llm-probe.js      # JSON report, exit 0 when an endpoint answers
```

The probe tries all five endpoints (3 s each), reports every one it found and every one
that did not answer, and names the best endpoint + model. Nothing is guessed.

## Apply

```bash
node scripts/apply-strategy.js --strategy local
# or inside the app: Settings → LLM Strategy → Local
```

The apply:

1. runs the probe (the probe IS the validation — the cloud catalogue does not know your model);
2. writes the `local` provider block into `opencode.json` (`@ai-sdk/openai-compatible` +
   `baseURL` + the discovered model);
3. pins every god to `local/<model>` and keeps the full 132-agent shape (all plugins,
   `{file:}` prompts, demigods loaded);
4. sets `small_model` to the same local model.

**With no endpoint answering, the apply REFUSES** and prints the probe table plus the fix.
It never writes a config that cannot serve a single request.

## Requirements (honest)

- **Tool calling** — the gods need tools. A model without tool calling cannot drive OLYMPUS.
- **Context ≥ 32k** — below that the god prompts + project context do not fit; the planner
  will truncate and quality collapses.
- **Throughput** — local inference serializes. The hop runtime keeps `maxHopsPerPool` low
  for local lanes and the dashboard shows the elapsed time per hop.

## Hardware tiers

| Tier | Hardware | What runs |
|---|---|---|
| **S** | ≥48 GB VRAM (or ≥64 GB unified) | Full campaign — 30B+ MoE class, whole 132-agent arsenal, long hops |
| **A** | ≥24 GB VRAM | Full campaign — 14–32B class, slower but complete |
| **B** | 8–16 GB VRAM | Single-god work — 7–14B class; campaigns will be slow and may park |
| **C** | <8 GB VRAM / CPU-only | Chat and planning only — 3–8B class; campaigns are refused with the reason |

OLYMPUS reports the tier the probe infers and never pretends a tier-C box can walk a
30-hop campaign.

## Cost and privacy

- Cost: **$0** — no provider bill.
- Privacy: **nothing leaves the machine**. The provider block points at localhost; the app
  labels the lane `LOCAL · $0` everywhere it shows the strategy.
