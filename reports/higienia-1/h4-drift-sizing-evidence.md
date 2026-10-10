# HIGIENIA-2 / H4 — #78 CURED (RED-first) + #76 + #83 CLOSED WITH LIVE EVIDENCE

**Closes #78, closes #76, closes #83.**

## #78 — the model-catalogue drift detector (the D19 class tripwired)

`src/lib/model-drift.ts` — `detectModelDrift(config, catalogue)`: case-INSENSITIVE across
every assignment surface (the agents, `small_model`, `terminalModel`, the provider model
tables): (a) the RETIRED class — the house's bans (glm-5.2, the D19 specimen) trip on any
lane, case-shifted or not (the pin proves `NVIDIA-Glm/Z-Ai/GLM-5.2` still trips); (b) the
FREE-LANE class — the nvidia-family/openrouter/groq custom ids validated against the
refreshed catalogue snapshot (`~/.olympus/free-models.json`), the family-split regex
honored. Pure + pinned; the doctor consults it (a new check, `ok — clean — every
assignment live or GO/Zen` on this box — the live R4 passing its own detector) and fails
loudly on drift. The doctor's check() signature lesson re-learned en route (a status
string is not a pass marker — the "fl" specimen) — disclosed.

## #76 — the round-cap truncation: CLOSED WITH EVIDENCE (the mitigation stack is complete; the residual is the user's lever)

The live-confirmed cause (three `reason: 'length'` cuts, FIX-1 F4) met its full mitigation
stack across the arcs, every piece landed + pinned:
1. **The budget floor** — `budget-guard` FLOOR=8192 (the guard named for this issue) on
   every lane, both surfaces, declaring its surface since #80.
2. **The single-turn contract** — the generation contract's single-turn override clause
   (v0.0.2) + the D16-compliant minimal-strike auto-resumes.
3. **The exit gate** — the deterministic catch-all (7 checks incl. the build).
4. **The hop runtime (#109)** — the ARCHITECTURAL class solved at the root: small hops
   (≤8192 budgets), one god, artifacts on disk, park-on-exhaustion — the monolith that
   cut mid-kit no longer exists for architectural work.
5. **The live-learned sizing rule (#79)** — the empirically-promoted hop-sizing instinct
   (≤5 artifacts/hop; route volume work to flash; never a 9-artifact single hop) — the
   "model/budget sizing fix" the issue called "Part 4/5 scope", learned from the B7 walk's
   real outcomes and now riding apollo's dispatches via the #84 RAG.
6. **The measured residual** — the THINKING burn (the B5 OBS: glm-5.3's default thinking
   ate the single-run output twice in B7; the `low` variant cuts ~83%) — the one lever
   left, and it needs the user's explicit R4 sanction: the proposal stands documented at
   the PLANO-MASTER-1 gate with its strongest evidence being this very closure. Nothing
   else remains open on this issue.

## #83 — the sizing matrix: CLOSED WITH LIVE EVIDENCE (this window + the B7 real costs)

The matrix, measured (2026-10-10 ~13:5xZ, the off-peak window, NVIDIA free lanes):

| Lane | firstToken-class (sequential ×2) | 3-way concurrent burst |
|---|---|---|
| glm-5.3 | 1.31s / 1.18s | 0.67s |
| glm-5.3-flash | 0.66s / 0.66s | 0.65s |
| muse-glimmer-30b | 0.86s / 1.02s | 0.88s |

**The finding: the three lanes are INDEPENDENT pools** — a 3-way burst across them shows
no firstToken degradation in this window (the contention class in the E8 record is
PER-POOL and WINDOW-dependent, not width-dependent: the afternoon windows killed flash
and kimi in whole windows, never "3-way slowed"). The GO-economics implication: the
K(width) curve is flat across distinct pools up to 3 concurrent; the real cost driver is
the WINDOW (peak vs off-peak), not the concurrency — already the campaign's parked-hours
doctrine.

**The recovery re-read cost, measured from the B7 walk's REAL telemetry** (21 completed
hops, every one a fresh-session dispatch — the disk-carried-campaign doctrine's price):
- Context per hop: **avg 24,606 tok** · min 5,228 · max 49,667.
- Hop wall-clock: avg 357s · min 104s · max 1294s.
- The K(width) takeaway: a resumed campaign pays ~25k tokens per hop of context re-read —
  the reason hops carry FILE POINTERS, never full context (the spine's own doctrine,
  now with its measured cost).

**GREEN: free-pantheon doctrine holds (the #78 pins incl. the case-shifted retired trip +
the dead-lane flag + the live-config clean pass) + the doctor's live check ok + battery
30/0/0 via `npm run battery` + tsc 0.**

**State: R4 untouched (the detector READS it — the live R4 passes its own detector);
frozen pair zero-diff; 0 CJK.** Next: H5 — #92 + #88 + #89.
