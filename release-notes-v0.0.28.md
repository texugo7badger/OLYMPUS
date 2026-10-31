# OLYMPUS v0.0.28 — THE GATE THAT BITES

The v0.0.27 release note said "the fixes the AIME continuation exposed, before you test."
Three of those fixes did not hold. This release makes them real, and adds the test that
would have caught each one.

## What was actually wrong

| v0.0.27 claim | What the code did |
|---|---|
| "A pasted plan can no longer create a project" | The guard sat **after** `#144`'s distinct-name law, which returns NEW on any quoted 2–6 word phrase — plan pastes are full of them. `your taste` was minted again. |
| "Chat dispatch works — one implementation, both dialects" | The chat probed the dialect; the **warm hop lane** hardcoded the opposite body and its comment asserted the inverse. #266's 405 masked it. |
| "A finished hop is no longer parked" | The rescue re-ran `file-exists`. `aime-b2-brand-ui` declares three files that **already exist** → green with zero work. |
| "AIME state restored" | The state used `f3-4`; the CAL-2 plan uses `aime-f3-4`. Zero overlap → FRESH walk → `f3-4` would re-run and overwrite the good dashboard. |

## What v0.0.28 changed

1. **Plan-paste guard, reachable** — moved above `extractProjectName`; signal = 2+ `##` hop headings **and** 2+ `DONE:` markers; routes to the active project or asks; never derives a name from prose.
2. **The hop runs as its god** — `opencode run --agent <hop.god>` (probed on 2.2.2). No more Apollo's system prompt on Athena's model.
3. **One dialect probe, both lanes** — `{ text }` first, flip once on the exact 400, keep other errors.
4. **The gate bites** — `file-contains:` / `file-omits:`; the AIME plan asserts content, and `b3` runs `build` + `lint` deterministically.
5. **The plan has edges** — `after` is used: `b2`/`b4` ← `b1`; `f3-7` ← `b1,b2`; `b3` ← all. `aime-f3-4` is removed.
6. **Brand coverage** — new `aime-b4-hero` (`/` + deck); `b1` imports the tokens and addresses the font.
7. **Dashboard truth** — streak walks the calendar; real `progressbar`; hard edges.
8. **Error honesty** — a 400 is not "rate limited, resend".
9. **MCP** — AIME lane: `playwright` ON (25 tools), `git` OFF (no repo). Repo curated default unchanged (6 / 44).

## The manual test (deterministic path)

**Phase 0 — preflight**
1. Rebuild and restart. Header must read **v0.0.28**. If it says v0.0.26/27, stop.
2. `cd ~/OLYMPUS-VAULT/02_Projects/aime`
3. `npx tsc --noEmit --incremental false` → 0
4. `npm run lint` → 0 errors (24 pre-existing warnings ok)
5. Back up state: `cp .olympus-hop-state.json .olympus-hop-state.pre-028.json`
6. Confirm MCP: AIME lane shows `playwright` ON, `git` OFF; header budget ≤ 128.

**Phase 1 — dialect (chat)**
Send `Say ok`. Expected: a real answer. If `Missing key` returns, capture the 400 and stop.

**Phase 2 — the guard**
Paste a short plan-shaped message (2 `##` blocks, 2 `DONE:`, one quoted phrase).
Expected: **Routed to existing project 'aime'** — and no `your taste` project.
If a project is minted, the guard regressed; stop.

**Phase 3 — the walk**
Send exactly: **`Walk the AIME plan that is already on disk.`**
(Verified: this classifies `simple · planning=no` and routes to `aime`. Do **not** send a bare `continue` — it classifies `architectural · planning=yes`, and the plan-freshness guard would refuse the pre-written plan as stale. See "Known, still true".)
Expected: the Pantheon approval toast ("Plan ready: 5 hops…"). Approve it.
The order must be: `b1` → (`b2` ∥ `b4`) → `f3-7` → `b3`.

**Phase 4 — per-hop gates (the walker enforces these now)**
- `b1`: `logo.tsx` is a pixel mountain (`no <circle`, `withWordmark`, `0 0 64 64`); `icon.svg` exists; `brand-tokens.css` has all 9 vars; `globals.css` imports it.
- `b2`: login/register/onboarding import `@/components/logo`; no `lucide-react` on login/register; handlers intact.
- `b4`: `/` imports the Logo, no `aime-red`; deck has no `#e11d2e`, `rounded-3xl`, `linear-gradient`, `radial-gradient`, `blur(`.
- `f3-7`: `tests/e2e/flow.spec.ts` exists and asserts through the real API.
- `b3`: `BRAND-CHECK.md` exists **and** the gate runs `npm run build` + `npm run lint`.
- Then run the e2e yourself: `npx playwright test tests/e2e/flow.spec.ts --project=desktop`.

**Phase 5 — evidence**
- One telemetry row per hop with transport + tokens.
- `/api/olympus/hops/stream` shows the campaign.
- Short-circuit log stays 0 (expected — the gate has never fired).

## Known, still true

- **A bare `continue` cannot resume a plan written in a previous turn.** `estimateComplexity` classifies it `architectural · planning=yes` (the W-S PT-BR resume rule), so `expectPlan` is true and the plan-freshness guard refuses the on-disk plan as stale. The working resume prompt is **`Walk the AIME plan that is already on disk.`** (`simple · planning=no`, routes to `aime`). The guard's comment still claims "a resume prompt is short → planning=no"; that is false for the word "continue".
- The warm lane 405s on `POST /session` (#266) — spawn carries every hop. The dialect probe is now correct in both lanes, so fixing #266 will not re-break them.
- `b3`'s `build` check needs network only if `next/font/google` is used; the `b1` prompt allows the explicit stack fallback.
- The project has no `.git`; the lane's `git` MCP is OFF until you `git init`.
- The MCP panel writes the **repo** `opencode.json`; the lane reads `02_Projects/aime/opencode.json`. Toggling in the panel does not change the lane. Both were set explicitly for this run (playwright ON, git OFF in the lane; repo stays curated 6 / 44).
