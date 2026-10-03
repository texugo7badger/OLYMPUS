# SESSION CONTEXT — BATCH 12b-NIGHT (verified facts only)

Base: `main @ 2bab1b3` (clean). Branch: `night/12b-overnight`. Never pushed.

## Anchors re-verified this session (file:line)

- `scripts/agreement-metric.mjs` — joins classification×dispatch by ts-proximity (`--window-min`, default 5). Demigod→god resolution scans the ON-DISK prompt dir (`buildDemigodGodMap`, :107-130). `isDispatch` accepts `action === 'dispatch' || action === 'symphony-dispatch'` (:137-139). `--json` prints `{summary, pairs}` (:227-230).
- `src/lib/task-classifier.ts` — `TaskClassification` interface :13-24 (no id field today); `classifyTask` :233-256; `serializeClassification` :262-264 (JSON.stringify → env payload); `parseClassification` :271-283.
- `src/app/api/olympus/action/route.ts` — `action === 'prompt'|'answer'|'context'` block :169-208; classification event write :185-198 (`action: 'classification'`, meta has `routeTo`, NO run/session id); `OLYMPUS_TASK_CLASSIFICATION` env passed via `streamWarm` `extraEnv` :200-207.
- `.opencode/olympus/olympus-hooks.ts` — hook-side `tool.execute.after`; early `if (!state.agentId) return;` :1040 (hook-side `dispatch` writer DEAD today); hook `dispatch` event :1071-1088.
- `.opencode/olympus/tools/dispatch.ts` — tool-side `symphony-dispatch` event write :425-463 (only dispatch writer observed live); `ensureDemigodPresent` auto-injection :382-393; registry `opencode.demigods.json` :108.
- `.opencode/olympus/lib/dispatch-tracker.ts` — `finalizeDispatch` `dispatch_outcome` event :281-310.
- `src/lib/opencode-spawn.ts` — `OLYMPUS_MANAGED = '1'` injection point :241-255 (set AFTER `extraEnv` merge :239 — callers cannot strip it; this is the pattern #51 follows).

## Demigod registry audit (Phase 0)

- `opencode.demigods.json` `_meta.total`: **118** (gods map sums: 8+12+13+6+9+13+17+16+11+13 = 118).
- On-disk prompt files: **118** (`.opencode/prompts/agents/demigods/<god>/<name>.txt`). Every registry name resolves on disk; no orphan files.
- Committed (git ls-files): **117**. The one uncommitted: `artemis/secrets_scanner.txt` — swallowed by `.gitignore:26` pattern `*secrets*` (the "API keys, tokens, credentials" block). `git check-ignore -v` proof: `.gitignore:26:*secrets*`.
- 12a NOTE-2 verdict: metric resolves **118 names** (on-disk view; `demigod resolution: 118 names` line captured this session against `~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl`). Committed tree = 117. Both statements true; divergence = the gitignored file. On a fresh clone: 117 resolvable, and secrets-scanner auto-injection would point at a missing prompt file.
- Phantom names in tool-description vocabularies (NOT in registry; dispatch to them fails gracefully as `rejected_unknown`): `verifier-code` (dispatch.ts:47,295,302,361; shortcircuit.ts:17,42; sub-agent-instinct-query.ts:129,133), `sast-scanner` (dispatch.ts:47,302), `mlops-engineer` (sub-agent-instinct-query.ts:129,133). Registry's real name: `code-verifier`.
- `opencode.json` subagent entries: 10 = 9 gods (mode:subagent, inline prompts) + `architect` (demigod, `{file:...apollo/architect.txt}`). The 4 auto-injected demigods (tdd-guide, secrets-scanner, docs-verifier, security-reviewer) appear only after dispatch-time injection.

## Environment state at session start

- Working tree had ONE pre-existing modification: `opencode.json` with the `architect` subagent entry REMOVED (tooling damage from a prior session; the prompt file exists and the entry is committed at 2bab1b3). Restored via `git checkout -- opencode.json` — disclosed in final report.
- Dev server already running on 127.0.0.1:3737 (`next dev`, PID 795152, started Sat Oct 3 02:15 UTC by the PREVIOUS session's probe-harness — `/tmp/olympus-probe-server.log` is the harness log; pidfile was missing). Adopted into `/tmp/olympus-probe-server.pid` for end-of-run cleanup.
- Electron app running (Terminal Bridge :3740). `opencode serve --port 3777` also running (not mine, untouched).
- live.jsonl shows ongoing foreign prompt activity (classifications every 1-3 min, 07:00-07:27 UTC window) — my probes must use tight `--since/--until` windows; post-Phase-3 id-join is immune to interleaving.

## Probe learnings carried from 12a

- Probes POST `action:"prompt"` non-interactively to `/api/olympus/action` (port 3737); `probe-harness.sh soak 30` first.
- Dispatches only fire when the prompt explicitly commands: "MANDATORY FIRST STEP: call olympus-dispatch ...".
- Probe runs auto-inject dispatched demigods into `opencode.json` — leave uncommitted, disclose.
