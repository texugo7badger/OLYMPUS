# OLYMPUS Workflow

![The workflow](public/diagrams/workflow.svg)


> OLYMPUS v0.0.91 — how a task flows through the 10 gods, 61 demigods, Symphony, and the VaultBrain. See [AGENTS.md](AGENTS.md) for the full agent roster and [TOKEN-ECONOMY.md](TOKEN-ECONOMY.md) for the cost flow. The v0.0.91 design-first, quick-edit and night-shift path is in the section below.

## Task lifecycle

Every user request follows this path:

```
User input
    │
    ▼
Task classifier (heuristic, < 1ms)
    │  detects: domain, complexity, stack, needsPlanning
    │  outputs: TaskClassification JSON
    │
    ▼
/api/olympus/action (spawns `opencode run --agent apollo`)
    │  sets OLYMPUS_TASK_CLASSIFICATION env var
    │
    ▼
olympus-dynamic-context plugin
    │  rewrites system prompt:
    │    - Hot tier (mastered skills, always loaded)
    │    - Warm tier (stack-relevant, capped at 20)
    │    - Cold tier (not loaded — lazy via skill index)
    │    - God's MCP allowlist
    │    - Stack-relevant reference docs
    │    - Token budget by complexity
    │
    ▼
olympus-router chat.params hook
    │  1. Instinct gate — query god's instincts
    │     confidence ≥ 0.85? → SHORT-CIRCUIT (skip deliberation)
    │  2. Skill index search (if no short-circuit)
    │     top-5 relevant skills surfaced as hints
    │  3. Arsenal recon (Symphony quick-circuit)
    │     coherence ≥ 0.85? → quick-circuit fires
    │
    ▼
Apollo deliberates (or short-circuits)
    │  decomposes task into DAG of sub-problems
    │  defines acceptance criteria per node
    │  hands execution DAG to Atlas
    │
    ▼
Apollo hands DAG to Atlas via Symphony
    │  olympus-dispatch({ godId: 'atlas', task: 'exec DAG', dag, acceptanceCriteria })
    │  → composes VibrationalSignature
    │  → logs to live.jsonl + arsenal-resonance.jsonl
    │  → registers open dispatch with dispatch-tracker
    │
    ▼
Atlas orchestrates execution waves
    │  dispatches independent sub-tasks concurrently
    │  serializes only where dependencies force it
    │  tracks progress, detects failures
    │  reports back to Apollo after each wave
    │
    ▼
Specialist gods dispatch to demigods (parallel waves)
    │  each demigod's MCP calls gated by:
    │    - permission.ask hook (god MCP allowlist + tier check via mcp-tiers.ts)
    │    - mcp-gate.ts (mcp-state.json toggle + API key check)
    │  each demigod uses the same hot/warm/cold tier system
    │  human-in-the-loop review tools:
    │    - olympus-design-review (Athena: design-system candidates)
    │    - olympus-integration-review (Hermes: integration approach candidates)
    │    - olympus-deploy-review (Prometheus: deployment strategy candidates)
    │
    ▼
tool.execute.after hook captures everything
    │  attributes tool calls to open dispatch
    │  logs tokens, duration, outcome to live.jsonl + cost.jsonl
    │
    ▼
Dispatch finalization (when active agent changes)
    │  finalizeDispatch() logs outcome
    │  logs to arsenal-resonance.jsonl (feedback loop)
    │  if short-circuited: reward/penalize instinct confidence
    │
    ▼
Callimachus heartbeat (on session.idle)
    │  7-stage brain maintenance:
    │    observe → distill → inject → prune → compact → evolve → stocktake
    │  promotes high-confidence empirical instincts to seed
    │  detects cross-god patterns → creates quick-circuits
```

---

## Complexity routing

The task classifier routes based on complexity:

| Complexity | Token budget | Path |
|------------|-------------|------|
| **trivial** | 5K | Fast-path: Apollo answers in ≤ 30 tokens. No dispatch. |
| **simple** | 30K | Apollo handles directly or dispatches one demigod. |
| **moderate** | 80K | Apollo dispatches to one specialist god. |
| **complex** | 150K | Apollo dispatches to multiple gods in parallel waves. |
| **architectural** | 150K | Apollo runs spec interview first, then dispatches. |

---

## Short-circuit flow

When an instinct matches with confidence ≥ 0.85:

1. The god calls `olympus-dispatch` with `shortCircuit: true, instinctId: <id>`.
2. The dispatch tool composes the VibrationalSignature and dispatches directly.
3. The `olympus-shortcircuit` tool logs the short-circuit to the activity feed.
4. The instinct's `samples` count is incremented.
5. When the dispatch finalizes:
   - **Success** → `successes++`, confidence rewarded
   - **Failure** → `failures++`, confidence penalized by 0.3

1-in-10 short-circuits are **verification samples** — forced to re-deliberate. If re-deliberation picks a different approach AND it succeeds, the instinct's confidence is penalized (keeps patterns fresh).

---

## Symphony dispatch flow

```
God calls olympus-dispatch
    │
    ▼
Compose VibrationalSignature
    │  protocol: "symphony/1.0"
    │  composer: godId
    │  intentVector: { intentType, semanticTokens, dimensions }
    │  constraintMatrix: { hard, soft, scope }
    │  successCriteria: [{ predicate, type }]
    │  targetOrchestra: [demigod]
    │  broadcastMode: "single" | "parallel"
    │
    ▼
Broadcast to demigod(s)
    │  Conductor calls dispatchFn for each target
    │  dispatchFn wraps signature → invokes demigod
    │
    ▼
Demigod executes, returns HarmonicPattern
    │  outcomes: [{ predicateKind, target, status, evidence }]
    │  artifacts: [{ kind, location, summary }]
    │  tokensConsumed, durationMs, confidence
    │
    ▼
Conductor fuses harmonics (if parallel broadcast)
    │  consensus: { fusedOutcomes, fusedAt, coherence }
    │
    ▼
Choir decodes for the user
    │  produces polished user-facing response
    │  fallback: if coherence < baseline, use textual reconstruction
    │
    ▼
Vault Brain captures everything
    │  registry.jsonl — signature + harmonic + consensus
    │  templates.json — learned shorthand (promoted by tuner)
    │  metrics.json — aggregate counters
```

---

## Background maintenance

Callimachus runs on `session.idle` (when the user hasn't typed for a configurable interval). The 7-stage loop:

1. **Observe** — scan activity feed for new dispatch outcomes
2. **Distill** — extract patterns from successful dispatch chains
3. **Inject** — promote high-confidence empirical instincts to seed
4. **Prune** — archive stale instincts (low confidence, old `last_used`)
5. **Compact** — merge duplicate instincts
6. **Evolve** — update mastered-skills profiles if new skills emerged
7. **Stocktake** — write brain health metrics

The heartbeat is lockfile-protected (only one instance runs at a time). Use the **Compact Brain** button in the status bar for on-demand deep cleanup.

## The workspace lane (#99)

Interactive terminal sessions run their `opencode serve` **inside the workspace lane** — never inside the OLYMPUS repo. Resolution order:

1. `OLYMPUS_WORKSPACE` env — the explicit operator override, used verbatim;
2. default: `~/.local/share/olympus/workspace`.

The lane is bootstrapped with the UAT-kit's proven shape (`reports/uat-r1/SPAWN-INVOCATION.sh`): `.opencode` symlinked to the repo's overlay, `opencode.json` + `opencode.demigods.json` copied from the repo (created-if-missing; refresh semantics belong to the #78 drift-detector class). A workspace path pointing inside the OLYMPUS root falls back to the default — projects never silently land in the working tree. On the first cold start that creates the lane, the terminal shows a one-time notice (the ask seam); override it any time via `OLYMPUS_WORKSPACE`. The serve's spawn env also carries `OLYMPUS_ROOT_SESSION=1` (#95) — the app-spawned serve IS the root session, so the Part-3 heartbeat trio registers without any manual export.

---

## v0.0.91 — design-first, quick edit, night shift

The release adds three lanes that share one rule: **the user's decision is an
artifact, and the machine reads it**.

### 1. The design contract (before the plan)

A refactor/rescue lane starts with a page inventory and a decision ledger, not
a plan:

```
intake → page map (src/app/**/page.tsx)
       → Apollo/Athena interview (purpose, keep, change, tokens, signature)
       → PROJECT-CONTRACT.md + design-contract.json
       → P0 decisions resolved ──► plan allowed
       └─ P0 unknown / pending ──► walk REFUSED (design-contract-incomplete)
```

`design-contract.json` carries `pages[]`, `tokens`, `unknowns[]`, `stops[]`
and `signature[]`. A design stop has `requiresUserApproval: true`; before that
hop spends a token the walker validates `design-approval.json` against the
current `contractHash` + `reviewHash`. The approval is only valid at review
**overall ≥ 7**; a 4.9 cannot be clicked away.

The Studio lives in Athena's chat (`design` button): **style**, **builds**,
**contract** and **review**. ArtCraft keeps apps + references only.

### 2. Quick Edit (the 60-second lane)

A mark or a one-line request that changes ≤3 files / ≤200 lines does not
become a hop:

```
mark → one bounded Athena turn → sha256 snapshot diff
     → typecheck + lint → preview reload
     → success: "quick edit · N files · N lines" + undo
     → too large / verify failed: restore snapshot, name the reason
```

The backup lives in `/tmp/opencode/quick-edit/<lane>-<ts>/`; `undo` restores
the exact snapshot. The mark bar has a `quick` toggle (default off = plan
first). The endpoint is `POST /api/olympus/quick-edit`.

Quick Edit is the small-change lane. A **batch of marks** from the large
preview window takes the durable path: `POST /api/olympus/marks/send` writes
the batch to the god's inbox and returns an `inboxId` immediately; the turn
runs in the background with a **20-minute** budget. `GET /api/olympus/marks/plan`
returns `pending|running|done|failed` plus the plan, `GET /api/olympus/marks/latest`
restores the last batch for the project, and `POST /api/olympus/marks/retry`
re-queues a failed or interrupted batch. A batch still `running` under a
previous app process boot is reported failed (and is retryable) as soon as
the new process reads it; a live turn that overruns its budget becomes
retryable one minute later. Closing the window never loses the marks or the
plan. If the preview is slow or unreachable, the god is told to plan from the
marks and the project source instead of waiting on the page.

### 3. The night shift (headless, outside the app cgroup)

```
npm run campaign:night-shift -- --slug <slug> --hours 8 --max-hops 100 --headless
```

`scripts/night-shift.ts` relaunches through `systemd-run --user
--unit=olympus-night-<slug>`, so closing the Electron app does not kill the
walk. It enforces the wall-clock deadline and the hop cap, restarts only
retryable parks (`tool-budget`, `verify-failed`, `timeout`, `transport`,
`script`), stops on provider/auth/model/unknown, and writes a morning letter
at `~/.olympus/night-shift/<slug>/morning-report.md` with the six release
gates and `SHIPPABLE` / `NOT SHIPPABLE — N gates open`.

It refuses a lane with a live walk (the lane lock is the truth). The Parthenon
has the same control in one tap (`night shift · 8h / stop`).

### 4. The ETA is a band, not a promise

`src/lib/eta.ts` keeps the critical-path shape and adds the two facts the old
projection ignored: the **park rate** and the **design-gate loop**. The
Parthenon shows `p50 1h26 · p90 3h04 · 28% park · high`; the tooltip carries
the basis. A parked walk shows `PAUSED`, never an ETA.

---

## v0.0.97 — the GO console anchor

Frames → OpenCode (the logged-in GO console) is the account truth. Every 30s
`FrameView` executes `document.body.innerText` in that webview, parses the
three windows (monthly, rolling / 5-hour, weekly) plus reset times, and posts
the anchor. The burn panel follows the `olympus:go-console-synced` event.

The walk resolves the lane per hop (lane override → burn roster → configured
god model), then the guard. A **fresh** anchor at 100% rolling parks the hop
before dispatch (`provider quota hit — GO resumes <time>`); a stale anchor
(>5 min) is not a quota claim and never blocks a hop, but it freezes burn
upgrades. Burn/Pace are disabled in the panel at a quota hit; Off/Reserve
remain available.

The chat pins the session model to the current god on every message, so a turn
for Athena cannot leave Apollo on the Athena lane. The exact unverified lane
`opencode-go/qwen3.7-plus` maps to `opencode-go/deepseek-v4.1-flash`.

## v0.0.98 — the walk that waits, recovers and reports

The walk's failure vocabulary now separates a temporary quota (`provider-quota`
→ wait for the console reset) from a terminal auth/route problem (stop and ask).
A blocked gate is not a park: the state's `parks` map keeps every hop's last
failure, and the post-run/warden recover the quarantined dependencies, then
resume with `retryHopIds`. The report is deterministic, always written, and
posted to Apollo's inbox; the terminal polls the campaign entries.

Hibernation writes the night plan, opts the active lane in and starts the
detached supervisor. The warden respects `waitingUntil` for a quota reset and
treats an active plan as opt-in.

The new Logs workspace (left nav) shows hops, walks, models and economy with
full detail. The terminal header's usage meter shows the 5h window by default;
the button cycles weekly/monthly. Both read the console anchor, not the ledger.

## v0.0.98-13 — plan health

The Logs Plan tab names plan size, pending hops, verification count, tight
tool budgets and oversized prompts before the walk. Apply plan is disabled
while a walk holds the lane (`liveWalk`), and the refusal is inline. The guards
are advisory; the delivery profiles in 0.0.98-15 will enforce the chosen one.

## v0.0.98-12 — slow is not dead, OpenCode 2.4.1

A ceiling-kill with recent output marks the lane **slow**, not dead; the
provider panel separates slow from dead and the timeout still tries one
alternate lane. The vendored CLI/plugin is **OpenCode 2.4.1**, approved by the
isolated conformance gate.

## v0.0.98-11 — boot truth

A busy TCP port is attached, never duplicated: the watchdog probes the socket
first and single-flights its work. The detached `opencode serve` is killed by
process group, so its MCP children die with it; a boot reaper clears old
ppid-1 orphans. Electron writes `~/.olympus/boot-health.json`, the API reads
it with live probes, and the Logs **Boot Health** tab shows the process truth.

## v0.0.98-10 — verification hops are one class

`qa-*`, `gate-*` and `design-gate` share `isVerificationHop`: QA 16 calls/12
min, gate 20/18 min, design gate 24/20 min. A failed gate gets an upstream
fix (from the evidence) or a deterministic harness + JSON judge; two cycles,
then BLOCKED with evidence. A blocked hop notifies once per generation; the
walker keeps the state current. A tool-budget park is a narrowed 28-call retry
focused on the missing artifact, never a blind budget increase.

The release line was reset: the 98-9 preview releases are retired (tags kept),
`v0.0.98` is the base, and the next releases are `v0.0.98-10` … `v0.0.98-17`
(displayed as 98.2 … 98.9). Repository hygiene is part of the release: PRs
triaged, branches down to `main`/`dev`, `suites:manifest` current.

## v0.0.98-9.1 — the loop breaker

A deterministic failure is counted per lane + plan generation + hop. The
second one blocks the hop (`.olympus-loop-guard.json`); the warden and the
post-run refuse to auto-resume it, and the digest names it. A new plan
generation is the reset. `opts.unattended` is the night-shift permission; an
expired hibernation window or a stale supervisor flag is not.

A QA gate is never blind-retried: `verify-failed` schedules one upstream fix
hop built from the evidence (then the QA re-runs as a judge), and
`tool-budget` schedules a deterministic harness + JSON judge. The cap is two
cycles; the third failure blocks. QA hops are clamped to 16 tool calls and a
12-minute ceiling, and lint is baseline-aware.

## v0.0.98-9 — the plan archive and the tool ledger

When a plan generation is replaced, `freezePlan`/`applyNextPlan` archive it
under `.olympus-plan-archive/`; the Logs detail resolves the old hop's
prompt/artifacts/checks from the archive. Each settled telemetry row also
carries the hop definition and a tool-call summary, so future rows survive a
rewrite. Old hops without a session id get a `~` window cost from the ledger.

Callimachus's card reads `/api/olympus/callimachus/status` (last run, next
window, reference docs) and `curar agora` posts the 7-stage heartbeat. The
learning rows animate on a fresh poll; the detail box is the shared
`LearningDetailModal`.

## Release ritual — the tag IS the release notes

Every version follows the same order; no step is optional.

1. **Docs first.** Update the living docs in the same change that ships the
   behavior: `TOKEN-ECONOMY.md` and `WORKFLOW.md` always; `README.md`,
   `ARCHITECTURE.md`, `MCP.md`, `MODEL-STRATEGIES.md`, `AGENTS.md` and any
   other `.md` the change touched.
2. **Gate.** `npm run battery` green, `npx tsc --noEmit` clean, `npm run lint`
   clean, `npm run repo:privacy` clean, `npm run security:audit` with no high.
3. **Build.** Stop the dev app first (it owns `.next`); `npm run build`
   (Next standalone + Electron compile) and, for a release, `npm run build:linux`
   (AppImage/deb). `npm run verify:standalone` must pass.
4. **Tag.** `git tag -a vX.Y.Z -m "OLYMPUS vX.Y.Z"` on the release commit and
   push the tag.
5. **Release body.** Publish the notes as the GitHub Release body for that tag:
   `gh release create vX.Y.Z --title "OLYMPUS vX.Y.Z" --notes-file /tmp/notes.md`
   (or `gh release edit vX.Y.Z --notes-file /tmp/notes.md`).
   **Never commit `release-notes-vX.md` to the repository** — `repo:privacy`
   fails if one appears.
6. **Verify the surface.** `gh release view vX.Y.Z` shows the body; the tag
   points at the release commit; `npm run doctor` is green.
7. **Live docs.** If the release changed token economics, update
   `TOKEN-ECONOMY.md` **before** the tag; a number without a measurement is
   not published.
