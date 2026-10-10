# PLANO-MASTER-1 / B7 — the acceptance test: LUMINA walked by the cured machine — PASSED

**Closes #121** (the seam the acceptance test itself discovered). The campaign's cures
proved themselves ON the real UAT residue — the 19-hop plan that died on paper on
2026-10-09 13:47 was WALKED to completion on 2026-10-10, by the machine, never by hand.

## The DoD — met with evidence

| Requirement | Evidence |
|---|---|
| `npm run build` green | the house gate `project-exit-gate.mjs` — **7/7 PASS, verdict PASS** (lockfile, npm-ci, **build**, dev-curl-200, symlinks, imports-deps, composition) |
| registered in the vault | `02_Projects/lumina-crm` — the home since 13:41 on UAT day; project.md + context intact |
| probe-green | `probe-green ipv4 :3011 in 1ms` (the trigger's own words) |
| HTTP 200 | the gate's dev-curl-200 PASS + the trigger's probe |
| **the URL in the terminal** | **`http://127.0.0.1:3011`** — THE port of the UAT's failure, now alive durably (pid 585445, the panel picks it up) |

## The walk — the honest numbers

- **20 hops walked** (the original 19 + the declared split below), **21 completion rows**,
  **18 parked attempts survived by resume** — the B3 doctrine ("the disk carries the
  campaign") proven at scale: every death, cut, and stall parked honestly and resumed
  from the state file; nothing was ever lost, nothing was ever narrated as done that wasn't.
- **516,734 tokens in / 76,811 tokens out — $0.00, the free tier.** 125 minutes of summed
  hop wall-clock across ~2.5 hours of campaign.
- **34 source files** on disk — the full componentized tree the user's prompt specified:
  the landing (hero, logo bar, features, testimonials, pricing, FAQ), /login + /signup
  (split layout, the auth form), /dashboard (shell, KPI cards with deltas, the rich leads
  table, the pipeline board), /leads/[id] (the detail with timeline), the ui library,
  the auth utils, and the single fixtures file — in the VAULT HOME, where B2 said it belongs.

## What the acceptance test discovered (and cured) — the machine healed itself

1. **#121 — the lane config bootstrap.** The walk's FIRST dispatch parked 0/19 with
   `ProviderModelNotFoundError: Model not found: nvidia-glm/z-ai/glm-5.3` — opencode
   resolves its config from the CWD, and the intake-created home carried NO config copy
   (the #99 workspace lanes always got one; the intake homes never did). **This was
   ALSO the true root cause of the UAT afternoon's two "dispatch-failed exit 1" hops**
   (the s0 telemetry rows — not just the dead deepseek lane, as first believed). The
   cure: `ensureLaneConfig` in the walker (the #99 doctrine extended to the intake
   home), pinned in the child fixture. RED-first: the live park was the specimen.
2. **The lane-aware replans (3 declared plan edits, the original preserved in
   `b7/dispatch-plan.uat-original.json`).** (a) The 06:09Z probe found kimi dead
   (hephaestus ×3 + prometheus ×1 rode it) → the 4 hops re-assigned (→ apollo ×3 on
   glm-5.3; → dionysus, the QA god, for the final verify). (b) When glm-5.3's default
   thinking twice consumed the single-run output before writing a single file (the
   9-file and 5-file base hops, ~20 min each, zero artifacts — the B5 OBS's own
   prediction biting in production), the 9-file hop was SPLIT into 2 + the base hops
   re-routed to the flash lane — the spine's own "small hop" doctrine applied.
   (c) `auth-form-utils` likewise re-routed after its apollo death. Every edit declared
   here; the vault is the user's.
3. **The 15-min ceiling was too tight for the free tier's thinking speed** — the R3 knob
   (`OLYMPUS_HOP_TIMEOUT_MS=1800000`) raised it with ZERO code (the knob's exact design
   purpose); the layout-shell hop completed at 1294s — the old default would have killed
   a green 21-minute hop.
4. **The stream deaths** (exit-null at ~350–600s, the free tier's long-thinking runs
   stalling mid-stream) — the honest answer was the DESIGNED one: park → resume →
   re-roll. login-page died once, then completed. leads-table died twice, then
   completed. The machine never lied about a single one of them.

## The absorption verdict — nothing to absorb, declared

The orphan lane's only real asset (`src/lib/fixtures.ts`, 483 lines — exactly the
"single fixtures file, ~12 realistic leads" the user's prompt specified) is **byte-identical**
in the home; the rest of the orphan is the create-next-app default, identical to the home's
scaffold. **DISCARDED with the reason on record; nothing absorbed; the lane stays on disk,
inert — B2's `note-home` resolution guarantees it can never shadow the home again.**

The improvised-harness residue (`walker-local.ts`, `run-hops.ts`, `plan-schema.ts` —
Apollo's UAT-afternoon improvisation) was REMOVED from the home (copies preserved at
`b7/harness-residue/`) — the generation-contract doctrine: harness artifacts never inside
the deliverable. Declared, never silent.

The scaffold-completion riders (declared): `postcss.config.mjs` + the devDep swap
(`@tailwindcss/turbopack` → `@tailwindcss/postcss`, per the Next 16 bundled docs — the
house's own read-the-docs rule) so the dark identity actually renders; the lint script
fixed to `eslint .` for the final hop's deterministic check.

## The gate's approval of record

The user's B7 approval at the campaign gate (2026-10-10) is the walk's approval of record —
the hop-state predates the B6 gate (the resume doctrine: a resumed walk carries its
campaign's approval). The B6c gate itself is proven in the suites; this walk RESUMED the
UAT's parked campaign, which is the doctrine's exact designed path.

## The cures' report card (what B7 proved about B2–B6)

- **B2**: every artifact landed in the VAULT HOME; the orphan never touched the run.
- **B3**: the walk + 18 honest parks + resumes; the summary lines told the truth every time.
- **B4**: the trigger served :3011 with deps present + probe patience — the UAT's exact
  failure point, now green in 1ms.
- **B5**: the inline contract shaped this very report's plan edits; the OBS's thinking-burn
  finding was the diagnosis for the base-hop failures (the `low`-variant wiring proposal
  remains at the gate — this walk is its strongest evidence).
- **B6**: the pool narration named god+lane+pool on every hop event (see `walk-run.log`);
  `publishActivity` fed the durable cross-session feed; the build banner will greet the
  user's next terminal.
