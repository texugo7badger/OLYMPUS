# FACTS LEDGER — MADRUGA-3 rev 2, Part 1 (dispatch spine)

Every claim: `claim | proving command | one-line output`. No ledger entry → no claim.

## P0 — reality re-derivation

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p1.0-1 | session-start reality: night/14a @ b57a227, NOT main; dirty tree with rev-1 L-work | `git rev-parse HEAD` + `git status --porcelain` | `b57a227…` / ` M dispatch.ts opencode.json apply-strategy.js` |
| p1.0-2 | opencode.json mutated vs recorded frontier (db62995d → fcaf7c13) — rev-1-era free-openrouter apply, disclosed not reverted | `sha256sum opencode.json` vs phase0-close.json | `fcaf7c13…` ≠ `db62995d…` |
| p1.0-3 | the repo's L-chain record located (L1 grants, L2 registry, L3 dilution, L4 model map, L5 invoke) | madruga-2b findings-2b.md:32-34 | "L1 free-config tool grants → … → L5 task-invoke follow-through" |
| p1.0-4 | delta-1 record located: probe-1, dispatch ✓, subagent_type=athena, spawn died on stale model | madruga-2b ledger.jsonl line 5 | `"demigod":"frontend-reviewer (spawn ERRORED: Model not found nvidia/z-ai/glm-5.2…)"` |
| p1.0-5 | glm-5.2 dead / glm-5.3 live on NVIDIA Build (live probe, read-only) | `node_modules/.bin/opencode models nvidia \| grep glm` | `nvidia/z-ai/glm-5.3` + `nvidia/z-ai/glm-5.3-flash` (no 5.2) |
| p1.0-6 | rev-1 preflight was a no-op: `node <native binary>` fails → silent skip | first fixture run output | `could not query catalogue … skipping its 1 id(s)` + `OK: Applied strategy` |

## L1+L4 — generator (commit 83362e9)

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p1.1-1 | free shape grants all 11 olympus tools × 10 gods | fixture G1 | PASS `all 10 gods carry all 11 olympus tools` |
| p1.1-2 | prompts are REAL canonical cores (inlined ≤1000, no {file:} refs) | fixture G1 | PASS `real canonical cores` |
| p1.1-3 | unreadable prompt file refuses the apply (free) | fixture G5 | PASS `exit 1` + `god prompt file unreadable for apollo` |
| p1.1-4 | missing prompt file refuses the apply (GO) incl. unchanged refs | fixture G7 | PASS `exit 1` + `god prompt file missing for apollo` |
| p1.1-5 | zero behavioral silent-default lines remain | `grep -nE "using current prompt\|leaving existing prompt\|no model in map — skipping\|skipping its\|keep the existing" scripts/apply-strategy.js` | exit 1 (zero matches) |
| p1.1-6 | glm-5.2 pin retired → glm-5.3 (coding gods) | fixture G1 | PASS `pinned to the LIVE z-ai/glm-5.3` |
| p1.1-7 | dead id fails apply with live suggestions (D19 shape) | fixture G3 | PASS `exit 1` + `nvidia/z-ai/glm-5.2` + `live suggestions: nvidia/z-ai/glm-5.3` |
| p1.1-8 | --force = loud WARNING escape | fixture G4 | PASS `exit 0` + WARNING names the dead id |
| p1.1-9 | missing probe binary = explicit error (never silent skip) | fixture G6 | PASS `exit 1` + `catalogue probe is missing` |
| p1.1-10 | fixture is hermetic (real config + real home hash-guarded) | fixture R4 guards ×4 | PASS ×4 (incl. llm-providers.json) |
| p1.1-11 | full generator fixture | `npx tsx scripts/free-lane-generator.test.mjs` | `All 22 free-lane generator (L1+L4) assertions passed` |

## L2+L3+L4+L5 — spine (commit 97c6997)

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p1.2-1 | unregistrable dispatch fails loudly (RED first: ok:true pre-fix) | fixture S1 | exact: `"Dispatch not registered: dispatch registry write failed: EACCES: permission denied, open '…/dispatch-state.json.tmp'"` |
| p1.2-2 | registry entry contract {id, god, target, ts, directiveHash, status} | fixture S2 | PASS, directiveHash === sha256(task).slice(16) asserted |
| p1.2-3 | zero-loss: vault registry payload === task verbatim + checksum match | fixture S2 | PASS ×2 |
| p1.2-4 | live.jsonl event carries signature_id/vault_anchor/intent_hash/status | fixture S2 | PASS |
| p1.2-5 | repo-registry fallback: lane without registry resolves the repo's demigods | fixture S2 (injection assertion) | PASS (frontend_reviewer.txt prompt injected) |
| p1.2-6 | already_present keeps the registry parent (no apollo default) | fixture S3 | PASS `subagent_type="athena"` |
| p1.2-7 | curated directive per god — 10/10, zero defaults | fixture S4 table | PASS (table printed in output) |
| p1.2-8 | refusals: god-target / unknown / prefixed / no-instinctId | fixture S5 ×4 | PASS ×4 |
| p1.2-9 | schema gate: valid record accepted, 7 invalid records rejected with exact violations | fixture S6 | PASS ×8 |
| p1.2-10 | full spine fixture | `npx tsx scripts/dispatch-spine.test.mjs` | `All 27 dispatch-spine (L2+L3+L4+L5) assertions passed` |

## Validation + hygiene

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p1.3-1 | all 8 prior suites green (R8) | battery run | metric ✓ distill 4/4 classifier 29/29 slice 10/10 autonomy 21/21 foldback 6/6 checkpoint 18/18 opencode-session 33/33 |
| p1.3-2 | tsc ×2 green; overlay dist rebuilt (R5: no full build) | `npx tsc --noEmit` + overlay tsc + `npm run overlay:compile` | exit 0 ×2 + `Overlay post-compile complete.` |
| p1.3-3 | dist carries the spine | grep compiled dist | 11 markers (dispatch.js) / 9 (dispatch-tracker.js) |
| p1.3-4 | R4: opencode.json byte-identical at close | `sha256sum opencode.json` | `fcaf7c13…` == session-start snapshot |
| p1.3-5 | R6: ports + pidfiles clean | `ss -tlnp \| grep -E "3737\|3738\|3740\|3777"` + `ls ~/.olympus/*.pid` | no listeners / no pidfiles |
| p1.3-6 | real-vault registry restored to 21 pre-existing lines (my 29 fixture lines removed, python-verified) | prune script assertions | `dropped 29 fixture lines, kept 21 pre-existing` |
| p1.3-7 | active-strategy.json restored to the reconstructed pre-fixture state | dry-run on pre-state copy + rewrite | `No changes needed` ⇒ changes:0; content matches 171619Z.bak apply |

## Fixture iterations disclosed (mine)

- generator fixture: stub-catalogue id normalization ×2 (my data bug — top[0] + nano ids had to be post-normalize form); plugin-preset expectation (nvidia strips cache plugins); per-provider id check (was nvidia-only). All fixture-side.
- spine fixture: host-boundary shim ×3 (exports shape → tool.schema → .optional chain) — the SDK surface is host-provided; the final shim is documented in-fixture.
- REAL-STATE incidents (fixture-design debt, both fixed + disclosed in report §7): pre-override red run wrote real ~/.olympus; pre-OLYMPUS_VAULT_DIR runs leaked 29 registry lines to the real vault. Both restored; both are the exact defect classes the landed code prevents.
