# OLYMPUS Token Economy

![Token economy](public/diagrams/token-economy.svg)

> **v0.0.72 — measured reality.** This page used to sell a 97% input
> reduction. The instinct gate measured **0 short-circuits in 4,754
> evaluations** (`GATE.md`), so that reduction is **not happening** and the
> claim is retired. What follows separates what is **measured** from what is
> **design intent**, and gives the command that re-measures each number.
>
> The rule of this file: a number without a source is not a number.

## 1. What is measured (v0.0.72)

### The AIME campaign (read-only, the user's exam)

`npx tsx scripts/cost-audit.ts --lane ~/OLYMPUS-VAULT/02_Projects/aime`

| Metric | Value |
|---|---:|
| Hops in the current campaign | 23 green / 0 parked |
| Tokens in (sum) | 1,009,005 |
| Tokens out (sum) | 74,613 |
| Tokens in p50 / p95 | 52,687 / 69,233 |
| Duration p50 / p95 | 9.1 min / 12.5 min |
| Cache read (ledger) | 914,176 |
| Cache hit | 89.7% |
| Provider invoice | **$0.00** (the GO plan is a subscription) |
| List value (estimate) | **$0.1936** for the campaign, ≈ $0.0084/hop |

**How to read the money.** Three numbers, never one:

- **step cost** — what the provider charged for this step (`spend_usd`);
- **list value** — the catalog price for the same tokens
  (`spend_estimated_usd`, or `priceTokens()` when the ledger row is missing);
- **invoice** — the month's bill. A subscription reports `$0.00` per step and
  still has a quota; the invoice is **unknown** until the provider issues it.

The audit prints `invoice: unknown (subscription reports $0)` whenever the
provider reports zero. That is the honest answer, not a free lunch.

### The MCP surface

- **6 servers / 39 tools** enabled by default (filesystem, memory, git,
  context7, sequential-thinking, olympus-craft).
- Measured by `npm run mcp:audit`; the 128-tool budget is enforced in the
  panel.
- Heavy servers (rea 207 tools, grafana 79, comfyui 41) are opt-in. They are
  not loaded, so they cost nothing until enabled.

### The hop runtime

- One hop = one small turn on the god's lane; deterministic verification
  (file-exists / build / lint / mounted / visual) costs **0 LLM tokens**.
- The warm transport (`opencode serve`, one per lane) removes the per-hop cold
  start; the spawn transport is the fallback.
- Tokens are read from the `session_v2` row, not from the ACK. A null token
  row is a **measurement gap**, never a zero.
- A campaign is bounded twice: by **time** (campaign deadline) and, since
  v0.0.72, by **money** (`~/.olympus/cost-caps.json` → 5h / weekly / monthly
  caps, evaluated on the list value). A cap parks the hop by name
  (`cost-cap-5h|weekly|monthly`) instead of retrying.

### Hop runtime economics

An architectural task is not one giant prompt: Apollo writes a DAG of small
hops (≤16k output tokens each), the walker dispatches each hop on its god's
lane, and deterministic verification (file-exists / build / lint / mounted /
visual) costs **0 LLM tokens**. The request shape is deliberately small and
bursty, so it fits **BETWEEN provider peaks** instead of holding one long
expensive stream open.

When a lane is exhausted (quota / 429 / no-route), the hop **PARKS on exhaustion**
with its artifacts and resume point on disk — the campaign never dies with a
pool burst, and the next resume re-runs only the unfinished hop.

## 2. What is design intent (not measured)

These mechanisms exist and are wired, but their savings are **projections**,
not benchmarks. They are tagged `[DESIGN]` and must never be quoted as wins:

| Mechanism | Intent | Status |
|---|---|---|
| Hot/warm/cold skill tiers | load only mastered + stack-relevant skills | `[DESIGN]` — no A/B measurement |
| Instinct short-circuit | skip deliberation at confidence ≥ 0.85 | **measured 0/4,754 — retired** (`GATE.md`) |
| Symphony latent transport | parallel dispatch without extra tokens | `[DESIGN]` — the 70–90% claim was refuted in CAL-1 |
| Caveman compression | terse output per god | `[DESIGN]` — no measured delta |
| MCP allowlist | only the god's MCPs load | `[DESIGN]` — the campaign manifest filters the lane config, the loading win is unmeasured |

The honest summary: **the only measured economy today is the hop shape**
(small turns, deterministic verification, 89.7% cache hit) **and the curated
MCP surface** (39 tools instead of 107). Everything else is a hypothesis with
a test attached.

## 3. The three strategies

| Strategy | Money | Speed | When |
|---|---|---|---|
| `local` (Ollama / LM Studio / vLLM / llama.cpp) | **$0** — your hardware | slow, model-dependent | privacy, offline, zero budget |
| `go-balanced` (default) | subscription (invoice unknown) | p50 ≈ 9 min/hop (measured) | daily work |
| `go-max-quality` | subscription, higher quota burn | slower, better specialists | hard campaigns |

`npm run apply-strategy <name>` rewrites the 132-agent config. Since v0.0.72 a
strategy switch is **refused while a walk is live** — the old behavior could
break a campaign mid-hop.

## 4. How to verify (the commands)

```bash
# the campaign's economics (tokens, cache, p50/p95, list value, invoice)
npx tsx scripts/cost-audit.ts --lane <project>

# the MCP surface actually enabled
npm run mcp:audit

# the instinct gate's real hit rate
cat ~/OLYMPUS-VAULT/05_Auto_Learning/shortcircuit-log.jsonl | wc -l   # evaluations
# GATE.md records the verdict: retired at 0 short-circuits.

# the caps
cat ~/.olympus/cost-caps.json
```

## 5. What would make the design numbers real

1. An A/B run of the same hop with and without the hot/warm/cold tiers.
2. A gate that actually fires (the current tag-similarity × confidence math
   cannot reach 0.85 except on near-identical tags).
3. A Symphony measurement that survives CAL-1's refutation.
4. A month of invoices compared to the list-value estimate.

Until then, this page quotes the measured row and labels the rest.
