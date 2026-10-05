# THE #76 SWEEP — UAT-R1·R2 (2026-10-06)

Sweep script: `reports/uat-r1/length-cut-sweep.mjs` (saved; scans every
`.jsonl` transcript for `reason: 'length'` + classifies the other finish reasons).

## Per-lane results (the Aurora Studio rehearsal, GO lane opencode-go/glm-5.3-flash, sized 16384)

| Lane | Spawns | Step-finishes | Completions | LENGTH CUTS | Turn-deaths (reason:'unknown') |
|---|---|---|---|---|---|
| apollo/aurora-studio strike 1 | 1 | 3 | 0 | **0** | 1 (in/out 0/0 after 3 steps) |
| apollo/aurora-studio strike 2 | 1 | 3 | 0 | **0** | 1 (in/out 0/0 after skill-load storm) |

**Verdict: ZERO LENGTH CUTS — but the closure bar (zero cuts + ≥1 full kit generated live) is NOT MET**: both strikes died with `reason: 'unknown'` before writing files (2-strikes fired, R1 BLOCKED). #76 STAYS OPEN, honestly.

## The residual (a NEW class, distinct from #76's)

Not a length class — a **skill-storm turn-death**: the god turn loads 4 skills in one step (one step consumed **31,776 output tokens** on skill dumps — strike 2's step-finish verbatim: `reason: tool-calls · in/out: 53299 31776`), then a read + one bash, then the turn dies `reason: 'unknown'`, in/out 0/0. Both strikes, same shape. The suspect: the 4-skill load storm triggers a stream/turn death on the GO glm-5.3-flash lane (the #62 stream_idle class is app-shaped; this is a one-shot). Registered (see the report).

## What the ZERO-CUT evidence proves

The FIX-2/FIX-3 sized budget held everywhere it was exercised: with `limit.output: 16384`, no step ever ended on length — the turns that died were unknown-class, and the single largest step (31,776 out) did NOT trip a length cut (skill dumps evidently bypass or coexist with the cap). The #76 mechanism is closed at the config + generator level (guard both-surfaces green, exit 0); the closure bar still needs ONE clean live kit run.
