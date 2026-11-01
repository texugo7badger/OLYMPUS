# OLYMPUS v0.0.30 — TRUTH FIRST

This release is about making the runtime's own numbers honest before adding
more surface. The AIME day-of-build (2026-10-31) exposed four lies and one
data-loss event; v0.0.30 fixes the foundation, not the whole backlog.

## The measured baseline (before these fixes)

| Signal | v0.0.29 |
|---|---|
| Benchmark | 138 rows: 8 work rows, **130 zero-activity no-starts**; the old headline said "4.4% success / 129 errors" |
| Short-circuit | **0 / 2,999** evaluations |
| Cost | step **$1.7272** + list **$1.7480** / 5h; **invoice not exposed**; the screen summed them and called it "spend" |
| Hops | 84 attempts: 63 completed, 17 dispatch-failed, 4 verify-failed; median 9.9 min; **p90 25.0 min**; 18 at the ceiling |
| MCP | 28 configured: 10 alive, **107 tools**, 5 enabled-but-dead, 1 auth; 7 servers failed every AIME run |
| Context | **0%** — the route queried `session`/`message`; OpenCode 2.2.5 uses `session_v2`/`session_message` |
| Campaign truth | 18 campaigns started, **13 ended, 5 orphaned**; 51 hop starts, 35 done, 11 parked, **5 never settled** |
| Sync Map | 731 entries, **669 "prompt died mid-flight"** at process exit |

## What changed

- **API keys reach the MCP process.** `src/lib/integration-env.ts` merges
  `~/.olympus/api-configs.json`, `.env` files and `process.env`; the Next
  spawn path and every MCP probe use it. Originkit/brave no longer read
  "configured" while the server gets a 401.
- **The real god owns the MCP.** `permission.ask` falls back to the last
  session registered by `chat.params` (not Apollo); the equip ledger is
  scoped per god and per session. Athena/Hephaestus can use the MCP the plan
  assigned them.
- **Campaign MCP manifest.** The plan's `hop.mcp` + the curated baseline
  filter the lane's `opencode.json`; known-broken servers (tamp/serena) are
  excluded; `git` joins only in a git lane. The AIME lane no longer spawns
  16 servers/107 tools for a 4-MCP plan.
- **Destructive data gate.** `src/lib/destructive-guard.ts` classifies
  destructive commands, denies them in unattended hops, and backs up the
  lane's databases before a destructive prompt. The 23:01:10Z AIME wipe
  (226 works → 0) is the regression fixture.
- **Context truth.** `session_v2`/`session_message` support; the indicator
  shows "—" when the source is unreadable, never a fake 0%. The live session
  now reads ~52%, not 0%.
- **Benchmark truth.** Zero-activity session starts go to `no-start.jsonl`
  and are excluded from the work success rate. The panel says "Work runs" /
  "Work success" and reports no-start separately.
- **Cost truth.** The screen shows **step cost / list value / invoice
  unknown**; the aggregate "$12/5h budget" is hidden because GO caps are
  per-model. The status bar no longer calls the step cost "charged".
- **Counts.** Atlas is a god in every list (132 agents); the army counts come
  from disk (Hephaestus 20, Athena 14, Hermes 16, …), not the stale 30/7/2.
- **Campaign truth.** The mini-card names the real running hop/god/artifacts;
  a dead walk lock marks inFlight hops **lost**, not running for 30 minutes;
  the 30-minute heuristic is gone. The live preview trusts the manager as a
  second "running" source.
- **Hop resilience.** The rolling silence default is 5 minutes (was 10); a
  warm stall retries the same hop on spawn once before parking.

## Known limitations (not claimed fixed)

- The walker is still in-process: an app restart can orphan a campaign. H1
  (detached supervisor/auto-resume) is the next release's first item.
- Hop output is not streamed live; the heartbeat names the elapsed time, not
  the tool output. H7 remains open.
- The visual/login gate is not yet automatic. The 4/6 `opacity: 0` and dead
  login specimens still require the browser check in H10.
- The full per-god chat tabs and the preview magic wand (E1/E2/F1) are
  v0.0.31.
- The plan's remaining ~30 v0.0.30 issues are tracked in
  `docs/plans/v0.0.30-truth-first.md`; this tag is the truth foundation.

## Verification

- `npx tsc --noEmit` clean.
- Targeted suites: `integration-env` 6, `destructive-guard` 12,
  `mcp-run-manifest` 4, `mcp-health` 30, `mcp-arsenal` 11, `hop-transport`
  25, `tasks-telemetry`, `hop-runtime`, `shortcircuit-gate`,
  `sync-map-retention` — all green.
- Full battery: **80 PASS / 0 FAIL / 1 declared SKIP** (81 suites).
- `npm run build:app` green; `verify-standalone` boot gate green;
  `electron-builder --linux` produced `OLYMPUS-0.0.30-linux-x86_64.AppImage`
  (481 MB), `.deb`, and `.tar.gz`.
- AppImage extract + boot smoke: the packaged app starts the bundled
  standalone server (the GUI stayed up until the smoke timeout).
