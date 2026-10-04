# FACTS LEDGER — MADRUGA-3 rev 2, Part 2 (Atlas: the single writer)

Every claim: `claim | proving command | one-line output`.

## P0 — intake

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p2.0-1 | SESSION INPUT read from the frontier (auditor ruling) | `sha256sum reports/m3r2-p1/M3R2-P1-REPORT.md` @ d03f2d4 | `9d83ec32e87e25ebef4db5934466c7dc6d05a72cb50a002a4d9df898731ffd28` |
| p2.0-2 | P0.2 re-verified at branch time: main == origin/main == d03f2d4, clean branches | `git rev-parse HEAD origin/main && git branch -a` | `d03f2d4…` ×2 / main only |
| p2.0-3 | P0.3 zero delta | `sha256sum opencode.json` + status | `fcaf7c13…`; standing untracked state only |
| p2.0-4 | E4 dry-run: live config == gated generator output | `node scripts/apply-strategy.js --strategy free-openrouter --dry-run` | `No changes needed -- opencode.json already matches the strategy.` |
| p2.0-5 | E2/D12: repo parser reads the on-disk shape | src/lib/olympus.ts readRealCosts | `ev.input_tokens` / `ev.god` / `ev.spend_usd` |
| p2.0-6 | E2/D17: attribution ladder predates the claimed night | `git log -S "resolveCostGod" -- .opencode/olympus/olympus-hooks.ts` | `392d3e2 2026-10-02` |

## ATLAS — phases + E1 (commit 04c6d2c)

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p2.1-1 | RED (verbatim, pre-implementation): full dispatch leaves NO sync-map; no exit-finalize API | atlas fixture first (hermetic) run | `dispatch fired ok=true; sync-map exists=false; atlas module=false; exit-finalize api=MISSING` |
| p2.1-2 | a real DISPATCH entry lands via the tool funnel, full contract, linked to the registry id + parent god | fixture P2 | PASS (verbatim entry in the report §3) |
| p2.1-3 | a real PROJECT entry lands via the chat.message funnel | fixture P2 | PASS (verbatim entry in the report §3) |
| p2.1-4 | single-writer guard: symphony/callimachus/athena/tool:write all refused, named, funnel in message | fixture P3 ×4 | PASS ×4 (exact texts in fixture output) |
| p2.1-5 | out-of-band raw file write flagged by the read path | fixture P3b | PASS `chainValid:false, tampered:["evil-raw"]` |
| p2.1-6 | tampered entries are never transitioned by Atlas | atlas-sync.ts exit loop + fixture P3b/E1 interplay | code + green run |
| p2.1-7 | two readers get identical state | fixture P4 | PASS (JSON equality; both outputs verbatim in fixture log) |
| p2.1-8 | exit finalize: mid-flight dispatch → 'failed' in map + tracker + dispatch_outcome event | fixture E1 ×3 | PASS ×3 |
| p2.1-9 | the finalize's own failure is LOUD (exact text) | fixture E1-neg | `dispatch finalize failed at process exit: <id>: EACCES: permission denied, open '…/live.jsonl'` |
| p2.1-10 | full atlas fixture | `npx tsx scripts/atlas-sync.test.mjs` | `All 16 atlas-sync (P1-P4 + E1) assertions passed` |
| p2.1-11 | bypass hunt: zero writers outside the Atlas module | `grep -rn "writeSyncMapEntry\|sync-map.json" .opencode/olympus --include="*.ts" \| grep -v "lib/atlas-sync.ts"` | exit 1 — no matches |

## E3 — D21 (commit 04c6d2c)

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p2.2-1 | OLYMPUS_VAULT canonical; OLYMPUS_VAULT_DIR deprecated with a loud warning | vault-root.ts:5-13 + :29-43 | resolver order + DEPRECATION console.error |
| p2.2-2 | all 14 overlay call sites migrated — zero direct reads | `grep -rn "process.env.OLYMPUS_VAULT\b" .opencode/olympus --include="*.ts" \| grep -v VAULT_DIR` | exit 1 — zero |
| p2.2-3 | the 2 stale shipped artifacts refreshed | `grep -c getVaultRoot src/lib/symphony/vault/resonance-registry.js src/lib/symphony/vault/tuner.js` | 2 + 2 |
| p2.2-4 | postcompile syncs shipped artifacts every compile | overlay:compile log | `Synced 25 shipped src/lib artifact(s)` |
| p2.2-5 | spine fixture needs only the ONE canonical var (R11 proof) | dispatch-spine.test.mjs env block + 27/27 run | green with OLYMPUS_VAULT only |
| p2.2-6 | dist carries the funnel + resolver (R12) | behavioral greps | dispatch.js(1) hooks.js(3) resonate.js(1); zero direct env reads in dist |

## Validation + hygiene

| # | claim | proving command | one-line output |
|---|-------|-----------------|-----------------|
| p2.3-1 | R8: all prior suites green after the funnel wrap | battery run | 10/10 prior suites green (spine restored to 27/27 after the loud-but-non-blocking funnel fix) |
| p2.3-2 | tsc ×2 green (R5: no full build) | root + overlay `--noEmit` | exit 0 ×2 |
| p2.3-3 | R4: opencode.json byte-identical at close | `sha256sum opencode.json` | `fcaf7c13…` == snapshot |
| p2.3-4 | R6: ports + pidfiles clean | `ss` + `ls ~/.olympus/*.pid` | no listeners / no pidfiles |
| p2.3-5 | R11: zero real-state incidents (hash-guarded in-fixture) | atlas fixture R4/R11 blocks | PASS ×2 |

## Fixture iterations disclosed (mine)

- atlas module in-process cache hid the tamper (fixture write invisible to the next read) → map made disk-truth (no cache).
- loud-fail scenario chmod'ed the feed DIR — appending to an existing file in a read-only dir still succeeds (dir perms gate create/unlink, not writes); fixed to chmod the FILE (fs-semantics find, kept as a fixture comment).
- spine R8 wobble: the funnel ingest threw in the unregistrable-home scenario before the L2 gate → funnel made loud-but-non-blocking; spine 27/27 with the exact L2 error text intact.
- olympus-hooks vault-root import depth (3 ups vs the needed 2) — caught by the overlay compile, fixed.
- vault-root.d.ts emit-cycle — hand-seeded once, thereafter maintained by the postcompile sync.
