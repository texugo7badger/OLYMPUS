# OLYMPUS v0.0.27 — THE LIVE FLOOR

The fixes the AIME continuation exposed, before you test.

## 1. Chat dispatch works again — the dialect is probed

`Missing key at ["text"]` is gone. opencode 2.2.2 accepts two v2 prompt bodies; the chat now tries `{ text }`, flips once on the exact 400, and preserves every other error. One implementation, both dialects.

## 2. A pasted plan can no longer create a project

The CAL-2 prompt list minted `your taste` from prose and stole the active pointer. A message with `##` blocks + `DONE:` is now a continuation: active project, or ask. `your-taste` is archived (not deleted) and **AIME is active again**.

## 3. A finished hop is no longer parked

Verification runs before parking. `dashboard/page.tsx` was written before the hang; the walker now rescues it as completed. AIME's state was rebuilt from the append-only telemetry: **29 completed** (including the rescued `f3-4`), only `f3-7` + the brand pass remain.

## Manual test (after install)

1. Open OLYMPUS → header shows **AIME**, **v0.0.27**, MCP **curated 6 · 44 tools**.
2. Chat “Say ok” → an answer arrives (dialect).
3. Paste the CAL-2 plan again → it must route to **AIME**, not create a project.
4. Run `aime-b1-brand` → `logo.tsx`, `icon.svg`, `brand-tokens.css` (night `#06071A`, blue `#1432A4/#2B4BD8/#6E82F0`, snow `#FDECEE`; no gradients).
5. Run `aime-b2-brand-ui` → auth/onboarding keep their handlers, adopt the tokens/logo.
6. Run `aime-f3-7` → `tests/e2e/flow.spec.ts`; then `aime-b3-verify` → `BRAND-CHECK.md` with the real build/lint result.
7. Check `/api/olympus/benchmarks` → `per_god` rows; `/api/olympus/agreement` → a window; run the short-circuit backfill after ≥3 demigod rows.
8. Park/resume: stop at a boundary, resume — only the unfinished hop re-runs.

## Known, still true

The warm lane 405s on `POST /session` (spawn carries every hop; #266). The plan schema has no `dependsOn` (#267). The instinct gate has never fired (0/2,144 — the v0.1.0 blocker).
