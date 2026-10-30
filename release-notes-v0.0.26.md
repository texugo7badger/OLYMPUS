# OLYMPUS v0.0.26 — THE MEASURED FLOOR

Instruments before features. Three measurement gaps closed, the docs reconciled with the shipped code, and a real medium build used to test the promises — including one that did not survive.

## The docs were lying about the rosters

`TOKEN-ECONOMY.md` claimed Apollo on **GLM-5.3**, go-balanced on **DeepSeek V4 Pro**, and ZEN Atlas on **Gemini 3.5 Flash**. The shipped rosters (and the applied `opencode.json`) are **DeepSeek V4.1 Flash**, **Hy3**, and **GPT 6.1 Sol / GPT 6 Luna**. AGENTS.md carried the same stale table plus an "Apollo is always on GLM (sacred)" rule retired in v0.0.23.

Both now match `src/lib/model-strategies.ts` (checked by `npm run check-strategy-sync`), the counts are corrected (321 skills, 44 curated tools, 28 MCPs), and **every number carries a provenance tag**:

- `[MEASURED]` — a live run on this machine
- `[COUNTERFACTUAL]` — computed from live data
- `[DESIGN-MATH]` — still a projection

## `tokens_saved` is no longer 0

The instinct gate logged an honest zero because nothing backfilled it. Now:

- Each short-circuit row is grounded from the **measured median demigod turn** for that god (basis + sample count recorded; skipped below 3 samples).
- The backfill runs on the Callimachus heartbeat and on demand (`POST /api/olympus/shortcircuit/backfill`).
- The Short-Circuit Health panel's **Tokens Saved** sums the grounded values.

Tagged `[MEASURED]` for the baseline, `[COUNTERFACTUAL]` for the skipped turn — never a fabricated exact count.

## Benchmarks finally say WHO

The "Attribution limit (v1)" was half data, half bug: the warm run **knows its god**, and child sessions carry `info.agent` (the demigod), but the accumulator bucketed everything as `multi` and dropped child `step-finish` tokens entirely.

`benchmark-attribution.ts` resolves `(agentName, parent god, scope)`. `per_god` and the Top-10 demigod breakdowns in `/api/olympus/benchmarks` are populated; an unknown session stays `multi` rather than guessing.

## The classifier gets a feedback loop

`scripts/agreement-metric.mjs` now runs inside the heartbeat (deterministic, zero LLM tokens), persists a window to `07_Reviews/agreement.jsonl`, and is served by `GET /api/olympus/agreement`. The brain dashboard shows a **Classifier Agreement** card.

## The control lane (for honest A/B)

- `OLYMPUS_INSTINCT_GATE=off`
- `OLYMPUS_CAVEMAN=off`
- `OLYMPUS_SKILL_TIERS=off`

No new surface, no new dependencies.

## CAL-1 / MERIDIAN — what survived contact

A real bookmarking service (Next.js + better-sqlite3/FTS5 + Vitest + token auth) built by the hop runtime in a sibling workspace.

| Claim | Verdict |
|---|---|
| 81% input reduction (tiers) | **PARTIAL / COUNTERFACTUAL** — 90.0% on skill descriptions (51,673 → 5,179 bytes); the whole-input share was not measured |
| 97% on short-circuits | **PENDING** — the backfill needs attributed demigod rows |
| 65% caveman output | **NOT-MEASURABLE-HERE** — no second control run |
| 70–90% Symphony transport | **CONFIRMED above ~4.7 KB / REFUTED below ~1 KB** — measured 71% (legacy prompt) and 82.9% (signature) at 4,670 B; the signature is 39% *larger* at 467 B |
| 30%+ short-circuit rate | **PENDING** |
| 89% input on a full build | **PENDING** |
| Hop parks resume | **PENDING** (campaign telemetry) |
| Warm removes cold start | **PENDING** (hop telemetry) |
| Verify = 0 LLM tokens | **CONFIRMED by design** — deterministic-first checks, no model call in the verify path |

Full evidence: `research/CAL-1.md` + `research/cal-1/measurements.json`.

## Upgrade notes

- `opencode.json` is untouched; the strategy truth was already correct — only the docs were wrong.
- Existing short-circuit rows are grounded on the next heartbeat; rows without a baseline stay 0 (honest).
- The agreement metric needs a heartbeat window with at least one classification→dispatch pair.

## Manual test (5 minutes)

1. `npm run check-strategy-sync` → OK.
2. `npm run measure:close` → 25/25 (the instruments).
3. Open the brain dashboard → **Tokens Saved** shows grounded values after a heartbeat; **Classifier Agreement** shows a rate once a window exists.
4. `POST /api/olympus/shortcircuit/backfill` → reports scanned/backfilled/skipped.
5. `GET /api/olympus/agreement` → windows + average.
