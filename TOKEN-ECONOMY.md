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

## 6. v0.0.91 — the honest ETA, the design kit, the 60-second lane

The numbers below are a **snapshot of the AIME lane on 2026-11-08T20:45Z**,
read from `.olympus-hop-telemetry.jsonl` and the tasks sheet. The walk was
still live; re-run the commands for the current row.

| Metric | Measured |
|---|---:|
| Telemetry rows | 559 |
| Completed rows | 400 |
| Parked rows | 159 |
| Park rate | 28.4% |
| Duration mean / p50 / p90 / max | 839s / 731s / 1,579s / 5,115s |
| Tokens in (all rows) | 17,368,177 |
| Tokens out (all rows) | 1,984,646 |
| Campaign hops at the snapshot | 96 / 100 |
| Design review | 7.0 (gate 7) |
| List value (estimated) | $0.94 |
| Tokens per completed hop | 64,035 |
| ETA p50 / p90 | 1h05 / 2h23 |

### The ETA is a band

`src/lib/eta.ts` keeps the v0.0.30 critical-path shape (same-pool hops
serialize; the max across gods is the projection) and adds the two omissions
that made the old “~40m” lie:

```
p50_hop, p90_hop = recent medians by god + hop kind
parkFactor       = 1 + parkRate * 2   (p90 uses * 3)
designFactor     = 1 + max(designParkRate, 0.25) * 2  (design gates only)
eta = criticalPath(hop * parkFactor * designFactor, concurrency)
```

The answer is always the **band + confidence + basis**: `p50 1h26 · p90 3h04 ·
28% park · high`. A parked walk says `PAUSED`, never an ETA. A design gate is
not a normal hop: it carries a higher park factor, and its score is shown as
`design 7.0` next to the ETA.

### The design kit is per hop

The old manifest was the union of every hop's MCP plus the curated baseline —
a 16-server fleet for a review. v0.0.91 derives `buildHopMcpManifest()` per
hop:

- baseline: `filesystem`, `memory`, `context7`, `sequential-thinking`,
  `olympus-craft`;
- design hop (Athena, design/hero/logo/landing/onboarding/motion id, or a
  design skill): `nakkas` + `playwright`, plus `originkit` only when
  `ORIGINKIT_API_KEY` is present;
- the hop's own `mcp`/`mcps` always wins;
- `git` only when the lane is a git repository;
- known-broken servers are excluded.

The walker re-applies the manifest before every dispatch, so a data hop does
not carry the design fleet.

### The 60-second lane

`POST /api/olympus/quick-edit` takes a mark or a one-line instruction, runs
**one bounded Athena turn**, and accepts only a patch of ≤3 files / ≤200
changed lines. It verifies with typecheck + lint, keeps a sha256 snapshot for
deterministic undo, and reloads the preview. A larger patch or a failed verify
restores the snapshot and names the reason. It never creates a hop and never
touches the campaign budget.

### The night shift

`npm run campaign:night-shift -- --slug <slug> --hours 8 --max-hops 100
--headless` runs the supervisor through `systemd-run --user` (outside the
Electron cgroup), enforces the deadline/hop cap, restarts only retryable
parks, and writes a morning letter with the six release gates. It refuses a
lane with a live walk. The current AIME walk predates this mode and is still
inside the app cgroup; do not close the app until it finishes.

### Re-measure

```bash
npx tsx scripts/cost-audit.ts --lane ~/OLYMPUS-VAULT/02_Projects/<project>
curl -s http://127.0.0.1:3737/api/olympus/tasks | jq '.stats'
npx tsx scripts/eta-model.test.mjs
npx tsx scripts/night-shift.test.mjs
```

## 7. v0.0.97 — the console anchor and the quota guard

The GO account percentage is read from the logged-in OpenCode GO console frame
every 30s (`src/lib/go-console-read.ts` → `POST /api/olympus/go-usage/console`).
The console is the source of truth for the three windows; the local ledger only
attributes spend to models between syncs.

- **A stale anchor cannot upgrade.** Anchor age >5 min →
  `blocked:'stale-anchor'`, no roster, no upgrade. Keep Frames → OpenCode open
  (it auto-syncs) or use Sync GO console.
- **Rolling is the immediate ceiling.** ≥65% steps the roster down, ≥80%
  enforces Reserve, and 100% is `blocked:'quota-hit'`: Burn/Pace are disabled
  and the walker parks before dispatch with the console's resume time. No
  request is spent collecting a refusal.
- **Weekly/monthly pressure.** Weekly ≥75/90 and monthly ≥80 step down; a
  projection >100% steps down.
- **The session is pinned per god.** Every chat message pins the session model
  to the current god's model (a burn override wins); the unverified GO
  `qwen3.7-plus` lane maps to `opencode-go/deepseek-v4.1-flash`.

Measured on v0.0.97: the frame synced 46% monthly / 100% rolling / 52% weekly
and the quota guard parked the walk; after the rolling window reset the frame
reported 0% rolling (then 1%) and the guard released. The 30s sync reads a
resolved 120s snapshot or the previous anchor's attribution and **never starts
a cold 57k-row scan** — the first boot sync used to block the event loop long
enough for the burn route to time out. The Cost/usage route warms the cache
for the next sync.

## 8. v0.0.98 — the wait, the recovery and the flight recorder

A quota window is a **pause**, not a stop. `provider.go-limit` and
`provider.quota` canonicalize to `provider-quota`; the walk reads the console
anchor's rolling reset, waits (capped at 6h), and resumes the same hop. No
request is spent collecting a refusal. A blocked design gate is a derived
state: the state's `parks` map names the real quarantined dependencies, and
the walk retries those — never the gate blindly.

The recovery budget is the night window: 4 recoveries per hop and a
window-derived campaign budget (up to 120 starts), not the old 2/6. Tool
budget recovery rises to 36 (verify 32) with a narrower directive.

The report is deterministic and always written. The digest merges the hop
state with telemetry (AIME 6/10, not 4/10), names the quarantined
dependencies, and is posted to Apollo's inbox; the terminal polls the durable
campaign entries.

The new **Logs** workspace (Visão geral, Hops, Walks, Models, Economy) reads
one cached server slice — never the 57k-row ledger on the request path — and
shows step cost, list value and `invoice unknown` side by side. The terminal
header's **usage meter** reads only the anchor (5h by default; one button
cycles weekly/monthly), labels a stale anchor and a quota hit, and never
fabricates 0%.

## 14. v0.0.98-13 — the plan is priced before the walk

Plan Health flags hops whose declared tool budget is below the work estimate,
plus oversized plans and >6-check prompts. The numbers are advisory, but the
user sees the cost shape before a 51-hop campaign starts. Apply plan waits for
a hop boundary; a live walk cannot be rewritten under its own feet.

## 13. v0.0.98-12 — a slow lane is not a wasted retry

A ceiling-kill with recent output no longer marks the model dead, so the UI
does not demand a manual retry for a lane that was working. The timeout still
tries one alternate lane once; if that fails, the original result is returned
instead of "all lanes dead". OpenCode 2.4.1 is vendored and gate-approved.

## 12. v0.0.98-11 — a dead MCP child is wasted context

The boot path no longer spawns a duplicate Next on a busy port or leaves
`uvx mcp-server-git` children alive after a serve reset. The watchdog is
single-flight, the group kill reaps the tree, and the Boot Health tab shows
the process truth (port, PIDs, respawns, MCP children, error-log size). The
saving is not a token line: it is the removal of a second server and its
orphan fleet from the same machine.

## 11. v0.0.98-10 — the retry is narrower, the log is evidence

A verification hop (`qa-*`, `gate-*`, `design-gate`) has a hard tool/wall
clamp and a repair path; a failed gate no longer burns a night on the same
prompt. A tool-budget park retries with 28 calls and only the missing
artifacts, so the spend is a second focused attempt, not a blind 36-call
exploration. A blocked hop emits one event/decision per generation;
`errors.log` filters 1,784 preload/CSP noise rows and rotates at 10 MB, so the
error surface is evidence rather than a console mirror.

## 10. v0.0.98-9.1 — the loop breaker spends nothing twice

A hop that failed deterministically twice in the same plan generation is
blocked by the loop guard; the next walk dispatches it zero times. The
campaign id is stable across resumes, so the recovery ledger no longer resets
and the same QA cannot burn 16 attempts.

A QA gate is split on demand: a harness hop writes a deterministic script +
`evidence/qa/<name>.json` on a tool-budget failure, and a judge hop reads the
JSON with at most 10 tool calls. A verify-failed QA schedules one upstream fix
hop built from its evidence, then a 12-call judge. Two cycles maximum, then
the hop blocks with the evidence. QA hops are clamped to 16 tool calls and 12
minutes; the repo-wide lint baseline is not charged to the feature.

## 9. v0.0.98-9 — every hop keeps its ledger

The plan archive (`.olympus-plan-archive/gen-<n>.json`, last 20) keeps the
replaced generation. A settled telemetry row now records the artifacts,
checks, abilities, prompt excerpt, tool budget and a tool-call summary; the
Logs detail and the task sheet use the row when the live plan has moved on.
When a hop has no session id, the Logs estimates the one-minute ledger
window for its model and marks the value with `~`; step cost/invoice unknown
keep their labels.

Callimachus's brain-health card now shows the last curation, the next
regular/deep window and the reference-doc count; `curar agora` runs the
7-stage heartbeat. The learning rows animate as the bell polls, and the
detail box still shows the 0.85 gate, samples and last outcomes.

The 2-hour night drill and the 8h/100-hop certification remain unclaimed.

