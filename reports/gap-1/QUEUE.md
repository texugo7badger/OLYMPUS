# MADRUGA-GAP-1 — CAMPAIGN QUEUE

The truth between sessions. Every session re-derives against this file BEFORE
work; every close updates it. No session trusts a report header over it.

## Frontier record

| Marker | Value |
|---|---|
| Campaign entry (S1) | `main @ a73dca6` (SWEEP-1 close, auditor-verified 2026-10-06) |
| After S1 close | **S1 DONE** — frontier = the S1 close-out commit (the ff-merge of `night/gap-1-s1`; sha re-derived at S2 entry per protocol) |
| After S2 close | (pending) |
| After S3 close | (pending) |
| After S4 close | (pending) |

## Session status

| Session | Scope | Status | Branch | Merge sha |
|---|---|---|---|---|
| S1 THE RESET | branch-truth + AN10/AN13 + N38 + #70 + register reconciliation | **DONE** (all must-ship: A1–A7 + close-out; #70 closed post-merge; AN10 refuted-alive-kept) | `night/gap-1-s1` (merged + deleted) | (the ff-merge = the close-out commit; re-derive at S2 E1) |
| S2 THE PULSE | #69 one-shot telemetry + #77 root heartbeat | PENDING — **next** | `night/gap-1-s2` | — |
| S3 THE FOUNDRY | #67 Apollo scaffold + catalogue refresh (AN11/AN12) | PENDING | `night/gap-1-s3` | — |
| S4 THE FUTURE LEDGER | 15 issues filed + ROADMAP + register wiring | PENDING | `night/gap-1-s4` | — |

## Session ledger (R7 — every row logged immediately)

| Row | Session | Entry |
|---|---|---|
| GAP-1-S1 | S1 | scope = branch-truth + AN10/AN13 + N38 + #70 + register reconciliation. Budget split declared: E-intake (battery-19 sweep + guard) done; A1–A7 code phases; close-out (merge + #70 close). Evidence dir: `reports/gap-1/s1/`. R4 entry snapshot sha `5d1d544100a125c9fcd9bd8e1b7c382f418f8bf2d7f435b7a99671392ac26259`. |
| GAP-1-S1-A3 | S1 | **AN10 REFUTED — lane ALIVE, NOT removed.** Auditor claimed `openrouter/nvidia/nemotron-3.5-lightning:free` dead residue (one-line removal). Verified ALIVE on 3 surfaces (2026-10-06): (1) live OpenRouter list via refresh-script fetch path — exact id served, pricing 0/0, ctx 1M, max_completion 65536; (2) cached strategy top-10 (`~/.olympus/free-models.json` 2026-10-03) — ranked #2; (3) opencode binary probe `opencode models openrouter` — both lightning ids served. Also pinned by 6 gods in tracked config (not inert). Card's ALIVE branch taken: no removal, no stash-dance. Tracked stays 10/10, live 8/8+16/16. R7 discovery: the register row needs the refutation verdict (done in A7); the "tracked vs generator-table divergence" is the already-filed N29 class, NOT a dead id. |

## Standing facts (re-derived at S1 entry, 2026-10-06)

- E1: main == `a73dca6`; only `main` local + 5 dependabot remotes (observe-only).
- E2: budget-guard exit 0 — live 8/8 + generator 16/16; live `glm-5.2` count 0.
- E3: open issues exactly #67/#69/#70/#76/#77 (#76 ×5 comments).
- E4: battery-19 green (16 script suites + context-distill 4/4 + telemetry-slice
  10/10 via `npx tsx`) + `npx tsc --noEmit` exit 0. NOTE: several suites REQUIRE
  `npx tsx` (plain `node` crashes on `@/lib` imports) — invocation of record.
  **After S1 A4 the battery is 20** (apply-noop joined; 17 script suites).
- D-1: NO version moves until Monday 2026-10-12 (the user's).
- D-2: closes ONLY for #67/#69/#70/#77, post-merge, with evidence. #76 untouched.
- **S1 dispositions (2026-10-06):** #70 CLOSED (8f822fa, post-merge evidence);
  AN10 REFUTED (the lightning lane is ALIVE on all three probe surfaces — no
  removal, the card's ALIVE branch); AN13a CLOSED (battery suite #20, e284dc2);
  N38 MARKED (e8743f2, datum unchanged); AN6-extra RESOLVED (both empty dirs
  disposed); the register reconciled (63 rows; 19 → S4 filing; D28 SPLIT with
  the onChange half uncovered). Live surface: R4-restored + sha-verified
  (5d1d5441…), guard re-green 8/8 + 16/16 post-restore.
