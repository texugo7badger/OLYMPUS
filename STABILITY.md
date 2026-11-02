# OLYMPUS — stability protocol

> v0.0.40 · The harness is shipped and measured; the 8-hour / 100-hop
> certification is **not** claimed yet. This page records what was actually
> run and what remains.

## What the harness measures

`npm run soak` probes the running app every few seconds and fails on the
truth, not on a vibe:

| Probe | What it proves | Budget |
|---|---|---|
| `/api/olympus/health` | the Next server answers | 1200 ms |
| `/api/olympus/power` | the power/suspend lane answers | 1500 ms |
| `/api/olympus/resources` | the governor can read the host | 2500 ms |
| `/api/olympus/run-state` | the campaign truth answers | 2500 ms |
| `/api/olympus/projects` | the project store answers | 2500 ms |

Thresholds:

- any non-2xx or timeout is a **failure** (an unreachable app is never a skip);
- a probe above its budget is a failure;
- available memory below **900 MB** is a failure (the governor floor is
  1.2 GB, with headroom for the sampler);
- OLYMPUS RSS growth above `max(600 MB, 25% of the first sample)` is a leak
  signal. A single sample is not a trend; the harness compares the run.

The report lands in the temp directory (or `--report <path>`) with p50/p95/max
per endpoint, memory first/last/growth, the process census and every failure.

## What was run (2026-11-02)

```
npm run soak:short   # 2 minutes, every 3s
```

- **40 rounds · PASS** · 5/5 probes on every round.
- p50 / p95 / max: health 34/54/65 ms · power 44/52/55 ms ·
  resources 60/66/66 ms · run-state 73/85/85 ms · projects 65/75/75 ms.
- Available memory: min **8,330 MB** · last 8,383 MB.
- OLYMPUS RSS: 4,624 → 4,503 MB (**−121 MB**, no growth), 37 processes.

Report: `~/Documents/OLYMPUS-plan/soak-v0.0.40.md` (machine-local evidence,
not committed).

## The certification still owed

The roadmap's v0.0.40 asks for an **8-hour soak + 100-hop campaign** and the
chaos matrix. They are not claimed:

| Drill | Expected typed recovery | Status |
|---|---|---|
| Kill the warm server mid-hop | spawn fallback / next prompt recreates | covered by unit suites, not a live 100-hop run |
| Kill the app chat server | next prompt recreates, lock released | covered by `walk-lock` + `server-lock` suites |
| DB locked by another process | typed refusal, no history deletion | covered by DB-health suites |
| Disk nearly full | honest write failure, no partial state | **not drilled** |
| Network loss mid-hop | retry plan / named park | covered by retry suites |
| Machine suspend/resume | power marker + reconcile | covered by power suites |

To certify: run `npm run soak -- --minutes 480 --interval 10` with a real
100-hop campaign on a lane, then fill the table with the actual evidence.
Do not tag a release as "certified" before that run exists.

## Reading the result

- **PASS** means the app stayed reachable, the governor stayed readable and
  memory stayed bounded for the window. It does not prove a campaign completes.
- **FAIL** names the endpoint, the elapsed second and the measured number. Fix
  the cause; never raise the threshold to make a red run green.
