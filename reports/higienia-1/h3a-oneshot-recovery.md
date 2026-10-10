# HIGIENIA-2 / H3a — #91 + #86 CURED (RED-first): the one-shot lane covers + the crash-recovery reader

**Closes #91, closes #86.** HIGIENIA-2 opens.

## #91 — the one-shot retry + watchdog coverage (D13)

The honest state at entry: the walker's hop dispatcher ALREADY carried the retry half
(the #107 crescendo inside `spawnHopDispatcher`, post-B3) AND the watchdog-equivalent
(the R3 ceiling + the #111 ceiling-kill classification landed hours ago — a provider-
erroring hang absorbs within the crescendo; a pure hang parks named). The REAL remaining
gap: **the route's fallback one-shot** (`fallbackOneShot`) — a single attempt with no
stall bound once output started. The cure, warm-machinery-reused (no new classes):
- **The stall watchdog**: the S3 `watchdogDecision` (the warm path's own decision
  function) consults on the fallback's stream every 15s — `lastOutputAt` rides the
  output events, `permissionPending` rides the permission ask/replied events (the S3
  override preserved: a pending ask is NOT a stall). Silence past 150s (no permission
  pending) → **nudge-abort**: the child dies + **ONE re-attempt** (the S3 parity — the
  nudge fires exactly once, `attempt` caps at 1).
- **The fast-fail retry**: a non-zero close with no output whose stderr carries a
  provider-error class (`classifyRetry`, the #107 classification) re-attempts once.
  Anything else stays terminal — honest.

## #86 — the dispatch journal replay as the crash-recovery reader (F4/G2)

The foundations were already pinned: the P3 replay-parity (the log alone reconstructs
godStates) + the E1 exit-finalize (a dying process closes its own opens — the crash
safety). This batch adds the NAMED PRIMITIVE — `recoveryReport()` in atlas-sync:
- `openDispatches`: every map entry still routed/received — what a crash left mid-flight;
- `walkParks`: every vault project with a parked hop (the hopId, the reason, the
  completed count, the plan total when readable) — where a resume picks up: THE TRUE
  FRONTIER;
- `chainValid`: the map's tamper verdict.

The reader is pure (reads the map + the hop-states; one unreadable hop-state never
breaks the report). Pinned: the export + the three-truths shape.

**RED → GREEN:** 3 named FAILs (the watchdog absent from the route + the classify absent
+ the reader absent) → opencode-session FULL + atlas-sync 16/16 + **battery 30/0/0 via
`npm run battery`** + tsc 0.

**State: R4 untouched; frozen pair zero-diff; 0 CJK.** Next: H3b — #84 + #79.
