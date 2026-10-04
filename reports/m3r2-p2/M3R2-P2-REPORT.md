# MADRUGA-3 rev 2 — PART 2 of 6 — FINAL REPORT (ATLAS: THE SINGLE WRITER)

**Mission:** Atlas becomes the sync center for ANY prompt the system
receives — project-side or god dispatch — recorded in the sync-map before
anything else happens. One writer; everyone reads.
**Exit criterion met:** a project prompt AND a dispatch prompt both land in
the sync-map via Atlas (verbatim entries in §3); the map answers a state
query from any god (identical results from athena + prometheus, §5); E1–E4
closed with evidence; E5 registered.

**Branch:** `night/m3r2-p2` from main @ `d03f2d4`. **Commits:** `04c6d2c`
(code) + this report. **Re-derived HEAD at report time:**
`04c6d2c78e7b386c0858593ecabb3dc93f8baa59`.

---

## 0. Session intake

- **P0.1 (auditor ruling):** SESSION INPUT read from the verified frontier —
  `reports/m3r2-p1/M3R2-P1-REPORT.md` @ `d03f2d4`, sha256
  `9d83ec32e87e25ebef4db5934466c7dc6d05a72cb50a002a4d9df898731ffd28`.
- **P0.2:** executed at dispatch-hold time and re-verified at branch time —
  HEAD == origin/main == `d03f2d4`, no lingering branches, `opencode.json` @
  `fcaf7c13`, standing untracked state untouched (docs/superpowers/,
  public/landing/, testimonial-section.html).
- **P0.3:** zero delta — Part 1's STATE AT END matches re-derived reality.

## 1. Entry conditions (the carried debt — all dispositioned)

- **E1 (D18) — CLOSED.** The exit-path finalize: the tracker now tracks
  locally-registered dispatch ids; `finalizeLocalDispatchesOnExit` finalizes
  exactly those at process exit (mid-flight deaths land `'failed'`, never
  `'unknown'`); a failed outcome write keeps the entry OPEN (vanishing is
  worse than dangling) and reports loudly. `process.on('exit')` is
  registered in BOTH #25 gate paths — managed runs the full finalize;
  unmanaged finalizes only its own dispatches (none dispatched → zero
  writes). Fixture S/E1 blocks: 6/6 green incl. the loud negative (exact
  EACCES text below). Registers: D18 row updated.
- **E2 (D12/D17) — CLOSED (re-gated + struck).**
  - **D12 re-gated:** the REPO parser was never broken — `readRealCosts()`
    reads the on-disk snake_case shape directly (src/lib/olympus.ts,
    `ev.input_tokens` / `ev.god` / `ev.spend_usd`). The zero-rows parser was
    BENCH-DRIVER-side, fixed in the madruga-2b sandbox (driver evidence
    only, no repo code). rev-1's "FIXED this night (Phase 2 parser)" claim
    retired — it described no repo change.
  - **D17 STRUCK then re-opened:** rev-1's "FIXED this night (Phase 2
    per-god attribution)" is struck — the agent-present attribution ladder
    predates the night (commit `392d3e2`, olympus-hooks.ts:194-212
    `resolveCostGod`; god-name rows at :201) and the OBSERVED case —
    agent-less rows from one-shot subagent sessions — is closed by NO code
    (the ladder has no session→dispatch linkage). Re-opened, target Part 5
    with D20 (deterministic spawn carries the linkage).
- **E3 (D21) — CLOSED.** `getVaultRoot()` is THE single resolver:
  `OLYMPUS_VAULT` canonical; `OLYMPUS_VAULT_DIR` deprecated with a loud
  once-per-process warning (vault-root.ts:5-13). All 14 overlay call sites
  migrated (zero direct `process.env.OLYMPUS_VAULT` reads remain —
  grep-proven in source AND dist). The 2 stale shipped artifacts
  (resonance-registry.js, tuner.js — the ones that leaked Part 1's fixture
  writes) are refreshed, and the overlay postcompile now SYNCs emitted
  src/lib artifacts into the shipped tree on every compile — the
  stale-artifact class is structurally dead. `vault-root.d.ts` seeded once
  to break the emit cycle, maintained by the sync thereafter. R11
  hardening proven: the spine fixture now sets the ONE canonical var.
- **E4 (live opencode.json provenance) — DECISION REGISTERED: EXPLICIT
  ACCEPTANCE.** The gated generator's dry-run against the live config:
  `node scripts/apply-strategy.js --strategy free-openrouter --dry-run` →
  **"No changes needed -- opencode.json already matches the strategy."**
  (zero diff; L1 grants present; models match the fresh refresh; L4
  preflight green against the live catalogues). `fcaf7c13` stays; no
  re-apply (a 0-change apply would churn backups + restart the warm server
  for nothing). R4: byte-identical at close.
- **E5 (D20) — REGISTERED (no implementation, by instruction).** Scope
  decision: the deterministic spawn hook lands in **Part 5** (Athena's
  domain) as the R3 deterministic substitute — auto-spawn the parent god
  on dispatch, removing the model-behavioral link; it also carries the
  session→god linkage that closes D17's observed case. Registers: D20 row
  updated with the scope decision.

## 2. Phase 1 — the ingest funnel (complete entry-point list)

Every prompt entry point, with the Atlas hook attached (file:line):

| Entry point | Origin | Funnel call site |
|---|---|---|
| App warm-session message POST | project | lands as a chat message → chat.message hook |
| App one-shot fallback spawn | project | lands as a chat message → chat.message hook |
| Direct CLI `opencode run` | project | lands as a chat message → chat.message hook |
| Electron terminal session | project | lands as a chat message → chat.message hook |
| **ALL project prompts** | project | **olympus-hooks.ts:1278** `atlasIngestProjectPrompt` — the single project surface, called before marker parsing, before the model runs |
| olympus-dispatch tool (every process) | dispatch | **dispatch.ts:518** `atlasIngestDispatch` — first statement of execute, universal (managed or not — the Part 1 tool-side spine doctrine) |
| symphony-resonate broadcast | dispatch | **symphony-resonate.ts:100** `atlasIngestDispatch` — a broadcast is a god-dispatch prompt |

Scoping disclosed (not a bypass): the #25 managed-process gate means
chat.message fires only in OLYMPUS-spawned (managed) processes — foreign
unmanaged sessions (Zed's agent, manual CLI) are outside the pantheon's
recording boundary by that gate's existing design; a god DISPATCH from any
process still records (the tool-side funnel is universal).

**Bypass-hunt grep (zero results, shown verbatim):**
```
$ grep -rn "writeSyncMapEntry\|sync-map.json" .opencode/olympus --include="*.ts" \
    | grep -v "lib/atlas-sync.ts"
(1 — no matches: no writer outside the Atlas module, no direct map-file path anywhere else)
```

## 3. Phase 2 — the entry contract + real entries (verbatim)

Schema test green (fixture P2 blocks). One real entry of EACH origin,
verbatim from the fixture run:

```
dispatch: {"id":"sync-ffa48425-...","origin":"dispatch","source":"olympus-dispatch:atlas-green-1","ts":"2026-10-04T22:11:34.859Z","intent":"Verificação de código da landing page da Loja Dado Vinte: erros de tipagem, imports inválidos. Máx 5 achados.","status":"routed","meta":{"godId":"apollo","demigod":"frontend-reviewer","sessionID":"atlas-green-1","dispatchId":"e00b8fba-...","parentGod":"athena"},"seq":1,"chainHash":"84063ebc..."}
project:  {"id":"sync-583ba735-...","origin":"project","source":"chat.message:atlas-green-1","ts":"...","intent":"Crie uma landing page para a padaria Pão Quente com formulário de contato.","status":"received","meta":{"sessionID":"atlas-green-1","agent":null},"seq":2,"chainHash":"ba51360e..."}
```

A dispatch that dies mid-flight lands `'failed'` — never vanishes (E1
pairing: the exit finalize transitions routed→done/failed by tracker
outcome, received→failed).

## 4. Phase 3 — single-writer discipline (hard guard)

RED (captured verbatim BEFORE implementation — the fixture's historical
evidence): `dispatch fired ok=true; sync-map exists=false; atlas module=
false; exit-finalize api=MISSING` — a full dispatch through the real tool
left NO record; there was no writer to refuse anyone.

GREEN: `writeSyncMapEntry(actor, …)` requires the module-internal token (a
non-exported symbol — outsiders cannot forge it). Every outside-Atlas
write fails loudly, naming the offender + the funnel. All four personas
refused (exact texts in the fixture output), e.g.:

```
"sync-map write REFUSED: actor \"symphony\" is not Atlas. The sync-map has exactly ONE writer. Route through the Atlas funnel instead: atlasIngestProjectPrompt() (the chat.message hook) or atlasIngestDispatch() (the dispatch tool's entry) in .opencode/olympus/lib/atlas-sync.ts — never write the map directly."
```

Plus the file-level guard: the map is hash-chained; an out-of-band raw
file write is flagged by the read path — `chainValid: false`,
`tampered: ["evil-raw"]` (fixture P3b). A tampered entry is never
transitioned by Atlas (it stays as the out-of-band writer left it).

## 5. Phase 4 — the read path

`atlasQueryPathState({reader})` — the returned state is
reader-independent (the reader tag is query metadata). The same query from
athena and prometheus returned identical results (both verbatim in the
fixture output; `JSON.stringify` equality asserted). No private
side-channels: the map file is the disk truth — no caches, every read
re-verifies the chain.

## 6. Validation battery (all VERIFIED, this session)

```
 1. agreement-metric        green        7. checkpoint          18/18
 2. context-distill         4/4          8. opencode-session    33/33
 3. task-classifier         29/29        9. dispatch-spine      27/27 (R8 held
 4. telemetry-slice         10/10           after the funnel wrap; the
 5. autonomy-gate            21/21         L2 exact error text intact)
 6. findings-foldback         6/6        10. free-lane-generator 22/22
                            11. atlas-sync (NEW) 16/16
root tsc --noEmit: exit 0 · overlay tsc --noEmit: exit 0
npm run overlay:compile: green — 25 shipped src/lib artifacts synced
R12 behavioral greps (dist): funnel markers in dispatch.js(1) +
olympus-hooks.js(3) + symphony-resonate.js(1); getVaultRoot in
dispatch-tracker.js(1) + dispatch.js(1); zero direct OLYMPUS_VAULT reads;
zero OLYMPUS_VAULT_DIR reads outside the resolver's own deprecation handling.
R5 honored: no full npm run build — tsc + overlay compile only.
```

## 7. Full disclosures

**`git status --porcelain` at report time (verbatim):**
```
 M docs/registers/GAPS.md
 M docs/registers/ISSUES.md
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```
(registers committed with this report; `opencode.json` @ `fcaf7c13` —
byte-identical to the session-start R4 snapshot; the three untracked paths
are texugo's pending disposition, untouched.)

- **R11 held from the first run:** every p2 fixture run (red included) used
  throwaway OLYMPUS_HOME/OLYMPUS_VAULT/OLYMPUS_ROOT; the red run's
  verbatim line was captured from a hermetic child. Zero real-state
  incidents this part — verified by the in-fixture hash guards
  (repo opencode.json + the real vault registry untouched, both asserted).
- **Fixture iterations disclosed (mine):** the atlas module originally
  cached state in-process — the tamper scenario exposed it (the fixture
  write was invisible to the next read); fixed by making the map disk-truth
  (no cache). The loud-fail scenario originally chmod'ed the FEED
  DIRECTORY — appending to an existing file in a read-only dir still
  succeeds; fixed to chmod the file (a genuine fs-semantics find, kept in
  the fixture comment). The spine fixture's env-var simplification (drop
  OLYMPUS_VAULT_DIR) is the E3 R11 proof, not a regression.
- **The spine R8 wobble, honestly:** the first post-funnel spine run failed
  2/27 — the Atlas ingest threw in the unregistrable-home scenario BEFORE
  the L2 gate (the ingest shared the read-only home). Fixed: the funnel is
  loud-but-non-blocking (same doctrine as the chat.message ingest); the
  spine's 27/27 restored with the L2 exact error text intact. The wobble
  never touched real state (hermetic fixture caught it).
- **R1 (2-strikes):** no step failed twice.
- **LIVE-PROBE-SKIPPED (R3):** a live managed-session dispatch through the
  running host would inject into the repo's `opencode.json` (R4 risk, same
  reasoning as Part 1). Deterministic substitute: the atlas fixture drives
  the REAL tool + REAL funnels + REAL registries hermetically; dist
  equivalence via compile + behavioral greps (R12).

## 8. Taxonomy check

No GitHub issues created/closed this part (register-only bookkeeping).
Register rows updated with commit shas: **D18** (closed, p2), **D12**
(re-gated: repo non-issue, driver-side), **D17** (struck + re-opened →
Part 5), **D20** (scope registered → Part 5), **D21** (closed, p2),
**D22** (hardened: artifact sync), **D23** (NEW — the E4 acceptance
decision). GAPS: G3 updated, G7 narrowed, **G8** (NEW — sync-map
retention/indexing policy; noted for Phase 4/5 measurement). All rows
carry evidence + targets; scopes within the standing set (vault added in
p1's D21, reused).

## 9. Self-critique (3 weakest claims, re-verified)

1. **"The exit finalize covers every one-shot shape"** — the handler is
   registered at plugin load in both gate paths, so it covers every
   process that LOADS the plugin. A dispatch fired from a process where
   the plugin did NOT load is impossible (the tool lives in the plugin).
   Verified: tool map returned pre-gate (olympus-hooks.ts:~827); the
   spine/atlas fixtures drive the tool standalone and the exit API works.
   Held as compile+fixture-verified; the first real one-shot campaign run
   (Part 3+) is the live confirmation.
2. **"The sync-map is tamper-evident"** — the chain detects additions and
   content edits of CHAINED entries, and flags entries without valid
   stamps. A sophisticated attacker could rewrite the whole file including
   chainHead (a full-file forgery defeats a local chain without a keyed
   MAC). The guard's threat model is accidental/undisciplined writers, not
   an adversarial local process — consistent with the phase's intent
   (discipline enforcement). Disclosed as a boundary, not a claim.
3. **"session.idle pairing completes the lifecycle"** — the idle hook marks
   project turns done + transitions finalized dispatches. In a
   long-lived managed server, idle fires between turns — a project entry
   from turn N is marked done at turn N's idle ✓. But an idle-skipped
   crash (process dies mid-turn) leaves the entry 'received' → the exit
   handler marks 'failed' ✓. Code-path reasoning + fixture-level proof;
   live multi-turn proof deferred to Part 3's campaign probes.

## 10. DEFERRED

- **D17's observed case** (agent-less one-shot subagent cost rows) — needs
  the session→god linkage at deterministic spawn → Part 5, with D20.
- **G8** — sync-map retention/indexing: measure first (Phase 4/5), then
  decide; the map is small and disk-read per operation by design (tamper
  visibility + cross-process truth at current scale).
- **A live managed-session funnel proof** — a real app-path prompt + a real
  dispatch landing in the real sync-map; deferred with the same R4
  reasoning as Part 1 (Part 3's campaign probes can carry it).

**Merge authorization executed exactly once:** push `night/m3r2-p2`,
ancestry `git merge-base --is-ancestor origin/main night/m3r2-p2`,
ff-merge to main, delete the branch. The frontier is main.
