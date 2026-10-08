# CLOSE-OUT — MADRUGA-CLOSE-1 (paper night, 2026-10-08)

> The register close-out + errata batch. One commit, one ff-only merge, zero logic changed.
> This file is the **first durable close-out** — `#101`'s rule (born this same night) practiced
> at its own filing: the chat message that follows is a pointer, not the payload.

## 1. Why this session exists

The build night's chat-tail close-out packet degenerated (free-lane generation-quality collapse:
CJK fragments + raw tokenizer tokens `<|close|>` / `<|reserved_token_163829|>`, provider-side).
Every durable artifact landed clean (auditor-verified ZERO CJK in the committed report, the
CHANGELOG, and the issue comments) — but the packet the user reads never composed. Two things
went stale: QUEUE.md still said UAT-BUILD-1 "IN PROGRESS", and the box-side close-out claims
deserved a clean re-derivation. Tonight pays both, files the specimen as **#101**, and clears
the four S4 paper erratas.

## 2. Entry gates (all VERIFIED — this session's own runs)

| Gate | Result |
|---|---|
| E1 | `main == origin/main == 7584752` (the 4-merge trail: `8c371e5` paper → `b95c765` #97 → `8a0b3ab` #98 → `7584752` #99); branch = main; only the two known local mods |
| E1b (R4) | live opencode.json sha256 `5534ceab9cfe160da3c5efa4a13c1e8dc8c3df6c2be0d3f0c5b65decabbd3d52` (31863 bytes) — byte-identical to the UAT-FIX-1 baseline; snapshotted to `/tmp/opencode/close-1/opencode.json.r4-snapshot`; the restore target; NEVER committed |
| E2 | budget-guard BOTH surfaces exit 0 (LIVE 9 lanes — the user's post-recon apply added one, an R4-legal move; GENERATOR 16/16; "All 9 generation lanes sized ≥ 8192"); `grep -c "glm-5.2" opencode.json` = **0** |
| E2b | check-strategy-sync: all 9 strategies in sync, exit 0 |
| E3 | open set exactly **#76 + #78–#96 + #100 = 21** (gh re-derived before any mutation); #97/#98/#99 CLOSED with merge-sha evidence (`b95c765`/`8a0b3ab`/`7584752`; #97's close comment carries the in-place backtick-slip correction, disclosed); #86 exactly TWO comments (the recon evidence + the FLIGHT LOG — the pilot WON) |
| E4 | **battery-23 green — this session's own run** (the degenerated close-out re-proven clean): 20 suites via `npx tsx` all exit 0 (catalog-uniqueness 26/26, opencode-session incl. the #99 guards, budget-guard both surfaces) + context-distill self-test 4/4 + telemetry-slice self-test 10/10 + `npx tsc --noEmit` exit 0. Logs: `/tmp/opencode/close-1-battery/` |

Machine facts re-derived, not inherited: the **:3777 warm serve is ALIVE** (PID 993264,
`opencode serve --port 3777`, up since 13:46 BRT — the #86 pilot asset, honored, never killed);
the stray's disposition landed — `~/.local/share/olympus/workspace/exemplo-landingpage` exists
(the Batch C move; exit gate 7/7 per #86's FLIGHT LOG).

## 3. The work

### 3.1 The QUEUE truth-row (the core fix)

- The MADRUGA-UAT-BUILD-1 row: IN PROGRESS → **DONE (auditor-certified PASS WITH NOTES)** with
  the four merge shas (`8c371e5`/`b95c765`/`8a0b3ab`/`7584752`), the pilot outcome (exit gate
  7/7 at the workspace lane — #86's FLIGHT LOG), and the honest note that the chat-tail
  close-out degenerated while the durable artifacts carried the truth.
- The Frontier record row: `main @ 7584752` (the 4-merge trail). The R4 row: CLOSE-1
  re-verification appended.
- The UAT-FIX-1 row's merge sha made concrete: `8c371e5`.
- The **MADRUGA-CLOSE-1 row** added (DONE, paper).
- Standing rules updated for the new arc: battery 23; the durable-packet rule (**#101**); the
  user's manual UAT is THE gate now (auditor-certified); the :3777 serve honored.

### 3.2 The new filing — the degeneration specimen

**#101** — `fix(harness): the close-out packet must be a durable file — the free lane's
chat-tail degeneration (2026-10-07 build night, tokenizer salad verbatim)` [labels: harness,
free-tier — existing only]. The body carries o quê / por quê / spec / aceitação / EVIDÊNCIA
(the paste's verbatim tokens `<|close|>` + `<|reserved_token_163829|>`; the auditor's 0-CJK
verification; the provider-side diagnosis as an honest unknown). The rule: every night's final
report lands as `reports/<arc>/CLOSE-OUT.md` BEFORE the chat summary — the chat becomes a
pointer, never the payload. **This file is the rule's first practice.**

### 3.3 The four S4 erratas paid

- **AN-S4-1** — the S4 reconciliation's row count: 60 → **61** (campaign entry 49 → **50**).
  Git-archaeology over the stage commits (`f382455` 51 lines = 50 rows + header → `f1b12d9` S1
  +2 → `5ee2933` S2R +4 → `43b4292` S3 +4 → `7307530` S4 +1 = 61). Both occurrences cured
  (the GAP-1 summary + the UAT-FIX-1 reconciliation's derived count 66 → 67); the original
  numbers kept visible as history.
- **AN-S4-2** — the GAP-1-S4 FILING-LOG's missing row: **#96** (the register's promised
  D28-onChange, the disclosed 19th filing) added verbatim from the live issue
  (`fix(harness): the exit gate's form-level check — the duplicated-onChange class (D28)` ·
  bug, harness); the header count 18 → 19; the errata disclosed in the log itself.
- **AN-S4-3** — glm-5.2 mentions in free prose: **13 mentions cured across 6 files**
  (AGENTS.md:49, model-strategies-sample.md:3, model-strategies.ts ×5 (:28/:97/:393/:493/:580),
  onboarding-wizard.tsx ×2 (:444/:467), auth/status/route.ts ×2 (:139/:181),
  provider-settings.tsx ×2 (:103/:542)) — all claims about the NVIDIA Build free endpoint's
  catalog, live-verified false since the retirement (2026-10-07: the z-ai family serves
  glm-5.3 + glm-5.3-flash only). Every other tracked glm-5.2 mention dispositioned and LEFT:
  the GO/Zen surface (card prose, GO/Zen ids, TOKEN-ECONOMY/MODEL-STRATEGIES GO tables, the
  rules-file GO clause — **#93's filed scope**, its aceitação keeps free-tier surfaces
  untouched), N38's deliberate dead-id test data, the D19/AN11 history comments, and the
  register/report history rows. The config itself was already clean (grep = 0).
- **AN-S4-4** — the E3 label-set list (23 labels) committed into the register:
  **docs/registers/LABELS.md** (new) — the vocabulary verbatim + the shape rule + the honest
  gap note (the scope words `vault`/`cost` have no matching labels — recorded, not acted on).

### 3.4 The registers

- **docs/registers/ISSUES.md**: the UAT-BUILD-1 row (the execution night's record — the four
  merges, the pilot WON, the degeneration disclosed) + the MADRUGA-CLOSE-1 row + **the CLOSE-1
  reconciliation** (zero divergence: #97/#98/#99 closed with sha evidence; #100 open; #86 two
  comments, stays open; 21 open at entry → 22 at close (+ **#101**); 69 register data rows).

## 4. STATE AT END

- **Frontier:** `main @ <the night/close-1 ff-merge>` (re-derived at the next session's E1;
  this file rides the commit, so its own sha is necessarily the next row's re-derivation).
- **Tracker:** open = #76 + #78–#96 + #100 + **#101** = **22**; #97/#98/#99 closed with sha
  evidence; #86 two comments, OPEN (the automation is its remaining scope); #76 untouched —
  **the user's manual UAT is THE gate now**.
- **Machine:** battery-23 green ×2 runs this session (entry + at-close, both its own runs);
  guard both surfaces exit 0; sync 9/9; tsc 0. R4 sha `5534ceab…` — byte-identical at entry
  and close.
- **The :3777 warm serve:** ALIVE (PID 993264, up since 13:46 BRT) — honored, never killed.
- **Never-staged user dirt (present in the porcelain below, excluded from the commit):**
  `opencode.json` (R4 live config — NEVER committed) + `reports/uat-r1/SPAWN-INVOCATION.sh`
  (the user's own edit).
- **Staged for `night/close-1`:** QUEUE.md · docs/registers/ISSUES.md · docs/registers/LABELS.md
  · reports/gap-1/s4/FILING-LOG.md · reports/uat-close-1/ · AGENTS.md ·
  model-strategies-sample.md · the four AN-S4-3 src files.
- `git status --porcelain` at close-out write time, verbatim (pre-staging):

```
 M AGENTS.md
 M QUEUE.md
 M docs/registers/ISSUES.md
 M model-strategies-sample.md
 M opencode.json
 M reports/gap-1/s4/FILING-LOG.md
 M reports/uat-r1/SPAWN-INVOCATION.sh
 M src/app/api/olympus/auth/status/route.ts
 M src/components/olympus/onboarding-wizard.tsx
 M src/components/olympus/provider-settings.tsx
 M src/lib/model-strategies.ts
?? docs/registers/LABELS.md
```

## 5. Taxonomy check (standing rule)

| Issue | Shape | Labels | Verdict |
|---|---|---|---|
| #101 | fix(harness) ✓ | harness + free-tier | in-pattern (title verbatim per the charter; existing labels only) |
| #86 (commented at build night) | feat(recovery) | enhancement, autonomy | in-pattern per GAP-1 campaign conventions (the vocabulary-drift errata candidate already logged at UAT-FIX-1) |

No closes tonight; the build night's closes (#97/#98/#99) were re-verified with merge-sha
evidence at E3.

## 6. The bar for the next gate

Small, clean, truthful — paid. The queue file no longer lies; the degeneration is a tracked
finding with a durable-packet rule (practiced here); the errata debt is dead; the machine's
green is this session's own run. **The user's manual UAT (issue #76's bar) is THE gate — no
internal night before it.**
