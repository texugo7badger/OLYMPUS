# PLANO-MASTER-1 / B4 — dev-server dignity CURED (RED-first): deps before the spawn, the growing patience, the legible death

**Closes #118.** The LOCAL symptom's second half.

## The RED (the defect named, before the cure)

- `A16/#118 THE DIGNITY STEP: deps installed BEFORE the spawn` — FAIL verbatim:
  `nodeModulesAfter=false` — start() spawned a project whose deps were never installed (the
  s0 shape, reproduced).
- `A17/#118 a package.json the deps step cannot install = the HONEST REFUSAL` — FAIL
  verbatim: `{"ok":true,…,"pid":441801…}` — the spawn "succeeded" over a corpse-to-be; the
  failure would only ever surface as probe silence.
- `D/#118 resolveDevProbePatienceMs + resolveDevFastSilenceMs exported` — FAIL: **absent —
  the trigger still waits a flat 15s (cold next + Tailwind does not fit; a dead child gets
  15s of silence)**.
- `D/#118 THE FLAT DEADLINE IS GONE` — FAIL: the `Date.now() + 15_000` still governed.
- `D/#118 the DEAD-CHILD fast refusal` — FAIL verbatim: the old silence line, `elapsedMs=15040`.

## The cure

**The dignity step** (`src/lib/dev-server-manager.ts`): `ensureProjectDeps` runs in
`start()` between the log setup and the spawn — deterministic (0 LLM), BOUNDED
(`resolveDepsTimeoutMs`: `OLYMPUS_DEPS_TIMEOUT_MS`, default 300s — the #107/R3 knob
family), LOGGED to the same trigger log. Skips when `node_modules` exists (idempotent) and
when the project declares zero dependencies — an empirical finding on this box: `npm
install` with zero deps does not even create the dir, so the rule is honest, not a
shortcut. A failed install = the HONEST REFUSAL naming the step + the log path, BEFORE any
pid exists — never a silent probe over a corpse.

**The growing patience** (`src/lib/dev-server-trigger.ts`): the flat 15s died. Two
env-tunable windows: the FAST window (`OLYMPUS_DEV_FAST_SILENCE_MS`, default 15s) — once it
elapses, a DEAD pid refuses in seconds, NAMING the death and surfacing the LOG TAIL into
the terminal (the s0 `sh: 1: next: not found` becomes legible right where the user looks);
the PATIENCE ceiling (`OLYMPUS_DEV_PROBE_PATIENCE_MS`, default 90s) — a LIVE pid compiling
a cold next + Tailwind gets the full window. The #105 doctrine text stays verbatim in both
refusals ("unverified — no probe evidence (#105)").

## The honest notes of the batch

1. **The fixture parser bug my RED exposed** (and fixed): the suites' FIXTURE_SERVER_JS
   parsed `-p` with `indexOf` → without the flag, `argv[0]` (the node path, truthy) won the
   `||` and `Number(nodePath)` = NaN → `ERR_SOCKET_BAD_PORT` crash. Latent forever, exposed
   when the marker moved into a dev-script comment. Both fixtures now guard `i >= 0` — a
   fixture-side robustness fix, disclosed.
2. **The dying fixture got LOUD**: a real death writes stderr (the s0 shape); the silent
   `process.exit(1)` made the log-tail surface unfaithful in the fixture env. The dying
   server now logs its death — the tail is real.
3. **My own test bug, caught by the battery**: the R-deps pins referenced the child-scope
   `mgr` binding from the driver → `ReferenceError` — the manager suite crashed after its
   checks (and my grep filter swallowed the crash once: the standalone "pass" read as
   silence). Fixed with a driver-side import (pure function, explicit env params). Double
   lesson: check the EXIT CODE, not the grepped output — the same "captured stdout is not
   liveness" law the campaign is built on, applied to my own harness.

## GREEN (the evidence)

- dev-server-manager **56/56**: A16 (a fixture with a REAL declared dep + NO node_modules →
  the dignity step installs BEFORE the spawn → the server still greens end-to-end + clean
  stop); A17 (the unparseable package.json → the honest refusal, NO pid ever spawned, the
  log named); R-deps (the knob pins: default 300s / env override / junk fallback).
- first-prompt-intake FULL: the dead-child e2e — the death NAMED + the log tail surfaced,
  the refusal in ~2s via the env-tuned fast window (was 15s of silence); the resolver unit
  pins; the flat-deadline-gone source pin. The #112/#110 greens ride along unchanged.
- **Battery 30/30 + tsc 0** (two sweeps: the first caught my driver bug — the battery doing
  its job; the second all-green).
- R4 untouched; frozen pair zero-diff; 0 CJK.

**Merge trail after this merge: 8 of the 12 cap.** Next at the user's gate: **B5 — the
inline planner contract (F4) + the thinking-knob OBS (evidence first).**
