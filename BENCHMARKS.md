# OLYMPUS Benchmarks + Eval Harness

> How to measure OLYMPUS's performance — both in CI (golden tasks) and in real-world use (always-on opt-in recording).

**Version:** v0.0.2
**License:** AGPL-3.0-or-later

## Two complementary systems

OLYMPUS has two distinct benchmarking surfaces:

| System | Purpose | Where it runs | How to trigger |
|---|---|---|---|
| **Eval Harness** | CI gate — runs golden tasks, fails on regression | GitHub Actions + local CLI | `npm run eval` or `node scripts/eval/harness/runner.js` |
| **Benchmark Recording** | Real-world metrics — logs every dispatch | In-app (when enabled in Settings) | Settings → Benchmark Recording toggle |

The eval harness proves OLYMPUS works (does Apollo dispatch to the right god? does the task complete within the token budget?). Benchmark recording shows how OLYMPUS performs in your actual workflow (which gods get used most? what's the short-circuit rate over a real refactoring session?).

---

## Eval Harness

### What it does

Runs a set of golden tasks (defined as JSON files in `scripts/eval/tasks/`) against OLYMPUS via `opencode run --format json --auto`. For each task it captures:

- **Token cost** (input + output, summed across all JSONL events)
- **Latency** (wall-clock from spawn to exit)
- **Dispatch correctness** (did Apollo dispatch to the expected gods? — compared against `expectedDispatches` in the task definition)
- **Short-circuit rate** (what fraction of dispatches hit the instinct gate)
- **Quality score** — weighted blend: 50% dispatch match + 30% success + 20% short-circuit rate

### Running it locally

```bash
# Run all tasks (default — outputs JSON report + console summary):
npm run eval

# Run a specific task:
node scripts/eval/harness/runner.js --task security-audit-01

# Generate an HTML report too:
npm run eval:html

# Custom per-task timeout (default 120s):
node scripts/eval/harness/runner.js --timeout 180000
```

Reports are saved to `scripts/eval/results/<timestamp>.{json,html}`.

### The 5 golden tasks (v0.0.1)

| Task ID | Tests | Expected dispatches |
|---|---|---|
| `security-audit-01` | Artemis → security-reviewer / secrets-scanner | artemis, secrets-scanner, security-reviewer |
| `react-perf-02` | Athena → frontend-reviewer | athena, frontend-reviewer |
| `build-resolver-03` | Hephaestus → build-resolver | hephaestus, build-resolver |
| `test-author-04` | Dionysus → test-author | dionysus, test-author |
| `migration-plan-05` | Apollo → planner / Persephone | apollo, planner, persephone |

Each task has a `qualityThreshold` (default 0.7). Tasks scoring below the threshold count as failures.

### CI integration

The `.github/workflows/eval.yml` GitHub Action runs the harness on every PR + push to `main` that touches `.opencode/`, `src/`, or `scripts/eval/`. It:

1. Installs dependencies + builds TypeScript (ECC plugin + OLYMPUS overlay + Electron).
2. Authorizes OpenCode using free-tier keys stored as GitHub Actions secrets (`OLYMPUS_OPENROUTER_KEY`, `OLYMPUS_GROQ_KEY`).
3. Applies the `free-openrouter` strategy.
4. Runs the harness with a 180s per-task timeout.
5. Uploads the JSON + HTML reports as build artifacts (30-day retention).
6. **Fails the build** if any task fails.

This keeps CI free (no GO plan needed) but lower-quality than local runs. Local runs on the GO plan will produce higher quality scores — the CI threshold is calibrated for the free-tier models.

### Adding a new golden task

Create `scripts/eval/tasks/<id>.json`:

```json
{
  "id": "my-new-task",
  "prompt": "Describe the task for Apollo to plan + dispatch.",
  "expectedDispatches": ["apollo", "planner"],
  "maxTokens": 15000,
  "minShortCircuitRate": 0.1,
  "qualityThreshold": 0.7,
  "tags": ["planning"]
}
```

The harness picks it up automatically — no registration needed.

---

## Benchmark Recording (always-on opt-in)

### What it does

When enabled, each finished run is logged to `~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl` — **one row per (session, agent)**. Rows are written when the run goes idle, when recording is toggled off, and best-effort on app shutdown. The writer lives in the app (`src/lib/benchmarks.ts`), not the `olympus-hooks` plugin: that plugin is gated behind `OLYMPUS_MANAGED=1` (#25) and is silent in Zed and other non-OLYMPUS spawns.

Each row carries:

- Timestamp + session label (optional)
- God, demigod (`null` when no single demigod owns the window), instinct ID, short-circuit flag
- Skill + MCP equipped
- Task signature **hash** (12-hex sha256 prefix of the normalized task signature + stack + project — god-agnostic, so the same task hashes identically across gods). The raw task signature is never written.
- Stack, project
- Model (runtime `modelID`) + active strategy
- Outcome (success / failure)
- Duration, input/output tokens, reasoning + cache tokens tracked separately, spend in USD, error flag, tool call count

> **Attribution limit (v1).** The app has no dispatch lifecycle to correlate against — `dispatch-tracker` is plugin-side — and `message.updated` carries no agent name (only `modelID`/`providerID`). God and demigod rows are therefore attributed as `multi` / `null`. The `per_god` and Top-10 demigod breakdowns stay empty until the app can learn the agent name from the stream.

The Benchmarks panel (Activity Bar → BarChart3 icon) shows aggregate totals updated every 30 seconds.

### Enabling recording

Two ways:

1. **Settings → Benchmark Recording** — toggle the switch + optional session label.
2. **Benchmarks panel** — toggle the switch inline at the top of the panel.

Both write to `~/.olympus/benchmark-config.json`:

```json
{
  "recordingEnabled": true,
  "sessionLabel": "refactor-2026-07"
}
```

Recording is **OFF by default**. Enable it when you want to record a real-world session (e.g. refactoring a project) and disable it when you're done.

### What the Benchmarks panel shows

- **Aggregate KPIs:** total dispatches, total tokens, success rate, short-circuit rate.
- **14-day sparkline** of dispatch volume.
- **Per-god breakdown:** dispatches, success rate, tokens, avg duration, short-circuit rate.
- **Top 10 demigods** by dispatch count.
- **Per-session breakdown** (grouped by session label).

### Use case: refactoring a project

The intended workflow (per the maintainer's request):

1. Open OLYMPUS + your target project.
2. Settings → Benchmark Recording → toggle ON → set session label (e.g. `refactor-myapp-2026-07`).
3. Refactor your project as you normally would — dispatch tasks to OLYMPUS, let Apollo plan, let the gods dispatch.
4. Come back to the Benchmarks panel periodically to see how the brain is performing on YOUR real workload.
5. When done, toggle recording OFF.

The recorded data lets you answer questions like:
- "How many tokens did OLYMPUS burn refactoring this project?"
- "Which gods got used most? (Apollo + Hephaestus dominate → backend-heavy refactor)"
- "What's the short-circuit rate? (Low rate → brain is cold-starting; high rate → instincts are forming)"
- "Which demigods are getting reused? (High reuse → good instinct candidates)"

### Privacy

Benchmark data is **local-only**. It never leaves your machine. The log file is at `~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl`. Vault TTL pruning (see [vault-policy](#vault-policy-integration)) rolls the log over when it exceeds 50MB (`maxBenchmarkLogMB`).

### Vault policy integration

The benchmark log is subject to the same pruning policy as the activity feed + short-circuit log. See `~/.olympus/vault-policy.json`:

```json
{
  "maxShortCircuitLogMB": 100,
  "autoPruneOnIdle": true,
  "dryRun": true
}
```

When `dryRun` is true (the default), pruning just logs what it would do. Set `dryRun: false` to actually roll over logs. Run `olympus vault prune --live` to force a live prune.

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/olympus/benchmarks` | GET | Returns aggregate benchmark stats + current recording config |
| `/api/olympus/benchmarks` | POST | Updates the recording config (`{ recordingEnabled, sessionLabel }`) |
| `/api/olympus/shortcircuit-stats` | GET | Returns short-circuit telemetry stats (separate from benchmarks) |
| `/api/olympus/vault/prune` | GET | Returns the current vault policy + a dry-run prune preview |
| `/api/olympus/vault/prune` | POST | Runs a prune (`{ action: 'run', dryRun: true }`) or updates the policy (`{ action: 'set-policy', policy: {...} }`) |
| `/api/olympus/vault/size` | GET | Returns per-directory vault size breakdown |

---

## CLI subcommands

| Command | Purpose |
|---|---|
| `olympus terminal` | Connect to the running OLYMPUS Terminal Bridge (port 3740) |
| `olympus vault prune --dry-run` | Preview what the vault policy would prune |
| `olympus vault prune --live` | Actually prune (no undo!) |
| `olympus apply-strategy <id>` | Switch LLM strategy |
| `npm run eval` | Run the eval harness locally |
| `npm run eval:html` | Run + emit HTML report |
| `npm run detect-editors` | Detect installed external editors |
| `npm run vault-prune` | Direct script entry point for vault prune |

---

## Success metrics (v0.0.1 targets)

| Metric | Target | Measurement |
|---|---|---|
| Eval pass rate (CI, free-tier) | 100% on 5 golden tasks | GitHub Action gate |
| Eval pass rate (local, GO plan) | 100% with quality ≥ 0.75 | Manual `npm run eval` |
| Short-circuit rate (after 100 dispatches) | > 30% | `~/OLYMPUS-VAULT/05_Auto_Learning/shortcircuit-log.jsonl` |
| Vault growth | < 100MB/month/project | `olympus vault prune --dry-run` |
| Benchmark log size | < 50MB before rollover | `~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl` |

---

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) in the OLYMPUS root.
