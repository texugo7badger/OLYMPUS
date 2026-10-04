# MADRUGA-3 rev 2 — PART 1 of 6 — FINAL REPORT (THE DISPATCH SPINE)

**Mission:** close the L1–L5 dispatch blockers so a dispatch emitted by any
god reaches its target agent through `symphony-dispatch` with a real registry
entry and zero concessions. **Exit criterion met:** one dispatch fired and
audited end-to-end (fixture S2, 27/27), zero fallbacks.

**Branch:** `night/m3r2-p1` (from `night/14a` @ `b57a227`, the rev-1 Phase-0
frontier; origin/main `6694a3f` is its ancestor — one ff-merge carries both).
**Commits:** `83362e9` (generator: L1+L4), `97c6997` (spine: L2+L3+L4-gate),
+ this report. **Re-derived HEAD at report time:** `97c6997f7605784d52fed8898660f5db7494f9ad`.

---

## 0. P0 intake — reality re-derivation + deltas (P0.3)

Re-derived, never trusted: HEAD was `b57a227` on `night/14a` (NOT main);
origin/main `6694a3f`; worktree DIRTY with rev-1's uncommitted L-work
(`dispatch.ts`, `apply-strategy.js`, `opencode.json` modified). Deltas found:

1. **Rev-1 died mid-Part-1.** Its Phase 0 (registers seed `b57a227`, tag
   `madruga-3-base`, `phase0-close.json`) was committed at 03:49 local; its
   Part-1 code sat UNCOMMITTED. The register rows D16/D19 claimed "FIXED this
   night" for code that was **never live**: the overlay could not compile
   (`import.meta.url` in a CJS target — TS1470), so the deployed dist never
   contained it (registered as **D22**, fixed in `97c6997`).
2. **opencode.json mutated vs the recorded frontier.** Phase-0 baseline
   `db62995d…` → session-start `fcaf7c13…`: an applied free-openrouter config
   (L1 grants + refreshed models) — rev-1/texugo's doing, uncommitted. My R4
   posture: snapshot `fcaf7c13` (pre-my-first-mutation), never touch it,
   verify at close — **VERIFIED byte-identical at close**. The delta vs
   `db62995d` is disclosed, not reverted (batch-13 doctrine: the user's own
   uncommitted state).
3. **The part prompt's L-list differs from the repo's recorded chain** — repo
   wins (see §1).

## 1. Phase 1 — the L-list, re-derived from the repo records

**Source of truth:** `~/OLYMPUS-VAULT/02_Projects/madruga-2b/findings-2b.md`
§"The complete dispatch-blocker chain" (lines 32–34): **L1** free-config tool
grants · **L2** demigods registry at OLYMPUS_ROOT · **L3** prompt dilution ·
**L4** stale model map · **L5** task-invoke follow-through. Corroborated by
`madruga-2/findings.md` D9 (the grant gap) and the register targets
(D16→"Phase 1 L3", D19→"Phase 1 L4").

**DELTA recorded:** the part prompt's working list ("L1 placeholder contracts
/ L2 registry fallback (unrecorded dispatches) / L3 directive curation /
L4 schema validation / L5 end-to-end proof") is a DIFFERENT decomposition. Per
protocol the repo list wins for MEANING; I treated the prompt's list as the
ACCEPTANCE SHAPE of each kill (L1 = no silent defaults in the generator;
L2 = every dispatch registered, loud on failure; L3 = curated per-god
directive; L4 = validated before emission; L5 = the e2e proof, delta-1
preserved). Both readings are satisfied and evidenced below.

**Delta-1 (the MADRUGA-2 proof to preserve):** `madruga-2b/ledger.jsonl` line
5 — probe-1: dispatch FIRED, the model composed the task invoke with
`subagent_type=athena` (the parent god), spawn died on the stale model (D19).
The proven contract = short single-action directive invoking the
registry-derived parent god. **Preserved** (fixture S2/S3/S4).

## 2. Phase 2 — L1 killed (generator, no placeholder contracts)

`scripts/apply-strategy.js`:

- **The grant (D9):** every god in the free shape carries the full 11-tool
  OLYMPUS overlay structurally (rev-1's work, now fixture-pinned).
- **Silent defaults → explicit errors:** unreadable/missing god prompt file
  refuses the apply (free shape: "god prompt file unreadable for X … refuses
  to emit a config with a dangling reference"; GO shape: "god prompt file
  missing for X"); the GO existence check now runs even when the ref STRING is
  unchanged (the fixture caught that hole — a config already carrying
  correct-looking refs to missing files sailed through); partial pantheon /
  partial demigod merge refused; the dead `charLimit` ternary removed.
- **Zero-placeholder greps (shown verbatim):**
  - `grep -niE "placeholder|concession" scripts/apply-strategy.js` → 5 hits,
    ALL in the ban-comments ("never a placeholder contract", "the concession
    this kills") — zero emitting code paths.
  - Behavioral: `grep -nE "using current prompt|leaving existing
    prompt|no model in map — skipping|skipping its|keep the existing"
    scripts/apply-strategy.js` → **zero matches** (exit 1) — every
    silent-default line is gone.

## 3. Phase 3 — L2 killed (every dispatch registered, loud fallback)

- The **tool registers the dispatch itself** (single writer; signature id
  end-to-end): `registerOpenDispatch` with the full rich context. The
  `tool.execute.after` hook skips duplicate registration when the tool output
  carries the marker; the legacy hook path catches failures and feed-logs a
  `dispatch_registration_error` event (loud, never crashes the hook).
- `registerOpenDispatch` **throws** on registry-write failure (`persist`
  returns `{ok,error}`); the tool converts it into a refusal.
- Registry entries (dispatch-state.json) carry the full contract:
  **id, origin god, target, timestamp, directiveHash (sha256, 16 hex),
  status** ("open" → outcome at finalize; outcome events carry `status` +
  `directive_hash`; pre-p1 entries normalized on load).
- The live.jsonl write failure now refuses the dispatch ("Dispatch not
  recorded in the live feed: …") — an unrecorded dispatch never reports
  success. `OLYMPUS_HOME` env-overridable (lane/fixture isolation).

**Negative test — exact error text (VERIFIED, fixture S1):**
```
"Dispatch not registered: dispatch registry write failed: EACCES: permission denied, open '/tmp/olympus-m3r2-p1-spine/ro-home/dispatch-state.json.tmp'"
```

## 4. Phase 4 — L3 + L4 killed (curated per god, schema-validated)

- **L3:** the demigods registry is consulted FIRST — the parent god is a
  registry fact on EVERY path including `already_present`; foreign agents (in
  config, not in registry) and corrupt `parent_god` entries are refused; the
  `|| "apollo"` default is **dead**. One curated directive per god (shown,
  fixture S4, 10/10 — table printed in the fixture output, e.g.
  `apollo -> architect: subagent_type="apollo" ✓` …
  `callimachus -> brain-backup: subagent_type="callimachus" ✓`).
- **L4:** `validateDispatchDirective` (exported, pure) gates the emission
  record BEFORE the directive is emitted — god/parent ∈ GOD_IDS, demigod
  unprefixed + not a god, signature id + vault anchor present, hex hashes,
  ISO ts, status, and the message carrying the curated `subagent_type`.
  Schema-validation test green (fixture S6: 1 accept + 7 rejections).
- **L4 generator half (D19):** the `nvidia/z-ai/glm-5.2` pin retired →
  `nvidia/z-ai/glm-5.3` (LIVE-VERIFIED against the catalogue Oct 4 2026:
  glm-5.2 absent; glm-5.3 + glm-5.3-flash present). The preflight now
  executes the opencode BINARY directly (rev-1's version invoked the native
  binary via `node` and **silently skipped every provider** — a structural
  no-op, registered as part of D19's evidence); missing probe binary and
  unqueryable providers are explicit errors; `--force` is the loud escape.

## 5. Phase 5 — L5 killed (end-to-end proof, delta-1 preserved)

`scripts/dispatch-spine.test.mjs` — **27/27**, full chain per dispatch:
tool ok:true + real signature id → curated directive
(`subagent_type="athena"`, no apollo default) → demigod auto-injected into
the lane's opencode.json **via the repo-registry fallback** (the L2 walk-up;
the lane has no registry of its own) → Vault resonance registry entry with
the FULL payload (zero-loss) + checksum = sha256(payload) (asserted) +
intentHash + godId → live.jsonl `symphony-dispatch` event (signature_id +
vault_anchor + intent_hash + status) → dispatch-state.json entry carrying
the six-field contract with directiveHash = sha256(task) (asserted
independently). Delta-1 behavior preserved (parent-god invoke shape). The
spine fixture runs hermetically (temp OLYMPUS_ROOT/VAULT/VAULT_DIR/HOME) with
a documented host-boundary shim (the plugin SDK resolves only inside the
opencode host — G7).

## 6. Validation battery (all VERIFIED by me, this session)

```
 1. agreement-metric        All fixture assertions passed       (25)
 2. context-distill         4/4 self-test
 3. task-classifier         29/29
 4. telemetry-slice         10/10
 5. autonomy-gate            21/21
 6. findings-foldback         6/6   (R8 — tracker changes preserved it)
 7. checkpoint               18/18
 8. opencode-session         33/33  (~3 min; #61+#62+#60)
 9. dispatch-spine (NEW)     27/27  (L2+L3+L4+L5)
10. free-lane-generator(NEW) 22/22  (L1+L4)
root tsc --noEmit: exit 0        overlay tsc --noEmit: exit 0
npm run overlay:compile: green (dist rebuilt — the deployed dist now REALLY
contains the spine; grep-verified: 11 spine markers in dist/tools/dispatch.js,
9 in dist/lib/dispatch-tracker.js)
R5 honored: no full `npm run build` — tsc + overlay compile only.
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
(the registers are committed with this report; `opencode.json` = the standing
user state `fcaf7c13…`, byte-identical to my session-start snapshot; the three
untracked paths are texugo's pending disposition — untouched.)

**REAL-STATE INCIDENT (mine, restored, full account):** the generator
fixture's FIRST (red) run executed before `OLYMPUS_HOME` was env-overridable
— the override was part of the change under test. Three applies then wrote to
the REAL `~/.olympus`: (a) `active-strategy.json` overwritten → **restored**
to the reconstructed pre-fixture content (free-openrouter, applied_at
17:16:19Z, changes:0, backup_path 171619Z.bak — the exact values re-derived
via a `--dry-run` on the pre-state copy, which reports "No changes needed"
= the last pre-fixture apply was an idempotent re-apply); (b) two 2099-byte
lane-config backups polluted `~/.olympus/backups/` → **deleted** (all 8
pre-fixture backups verified present, nothing pruned); (c) the stale-or-live
`opencode-server.pid` was unlinked by `restartWarmServer` — **no listeners on
3737/3738/3740/3777 now** (R6-clean; the pid's process state at unlink time
could not be determined retroactively). `llm-providers.json` shows
`free-openrouter` + `{}` overrides — consistent with the pre-existing 14:16
apply (CLI applies clear overrides), reasoned not reverted. **Second
incident:** before the fixture set `OLYMPUS_VAULT_DIR`, composeSignature
leaked 29 resonance entries into the REAL vault registry → **surgically
removed** (python-verified: only lines with my fixture payloads, all
timestamps tonight 18:53–19:11Z; 21 pre-existing lines kept, file re-verified
at 21). Both incidents are exactly the classes the p1 code now prevents
(env-overridable homes; hermetic vaults) — the red runs proved the fixes
necessary the hard way. No other real-state writes.

**LIVE-PROBE-SKIPPED (R3):** a live dispatch through MY OWN opencode session
was considered and rejected — it would inject a demigod into the repo's
`opencode.json` (an R4 mutation). The deterministic substitute is the spine
fixture driving the real source tool + real composer + real registries,
plus dist equivalence via compile + grep. Delta-1's live record stands
unregressed (no code path that produced it was removed; the directive shape
it proved is now the asserted contract).

**2-strikes (R1):** none — no step failed twice.

## 8. Taxonomy check

- No GitHub issues were created/closed this part (batch-report-only session;
  the registers carry the D-series bookkeeping). The ready-to-file texts for
  the two NEW findings:
  - `fix(vault): two env vars name the vault root — OLYMPUS_VAULT vs OLYMPUS_VAULT_DIR (consumers split)` [bug, vault] — register row **D21**.
  - `fix(harness): overlay builds broke on import.meta.url in a CJS target — rev-1 dispatch fixes were never deployed` [bug, harness] — register row **D22** (fixed same session; kept for the record).
- Rows updated with commit shas: D9 (done p1), D16 (done p1), D19 (done p1),
  D18 (tool-side half landed, exit-path finalize → Phase 2), D20 (directive
  half hardened; hook → Phase 2), G3, + new G7.
- Scope names used: free-tier, dispatch, vault, harness — within the standing
  set (vault is new as a scope for the env-var issue; recorded here per the
  standing rule's extension clause).

## 9. Self-critique (3 weakest claims, re-verified)

1. **"The deployed dist really carries the spine"** — the fixture drives the
   SOURCE, not the dist. Re-verified: `overlay:compile` ran green AFTER the
   final source state; grep shows 11/9 spine markers in the compiled
   tools/dispatch.js + lib/dispatch-tracker.js; overlay tsc --noEmit exit 0.
   CONFIRMED as compile-equivalence — a host-mode dist probe remains open
   (G7).
2. **"The tool-side registration supersedes cleanly in production"** — the
   hook-skip parse relies on the host's `tool.execute.after` output shape
   (`output.output`). Code-path verified against the hook's own
   `isToolOutputError` conventions; the legacy path (register + catch +
   feed-log) covers shape drift. If the host passes a different envelope,
   the worst case is a superseded-then-reregistered entry (same pre-p1
   behavior), not a loss. Held honestly as code-path.
3. **"active-strategy.json restoration is exact"** — `applied_at` (second
   precision, `.000Z`) and `changes` are RE-DERIVED values (the dry-run
   proves changes:0; the backup timestamp bounds applied_at), not a byte
   copy (none exists). The semantic fields (strategy, agent_count,
   god_prompts, demigods_loaded, plugins_enabled, backup_path) are each
   evidence-derived. Disclosed as reconstruction.

## 10. DEFERRED (exact resume instructions)

- **D18 exit-path finalize (Phase 2):** `dispatch_outcome` still never fires
  on one-shot exits — the finalize lives in `session.idle`/agent-change. Next
  session: add the one-shot exit-path finalize (tool-side writer now exists
  as the base — `dispatch-state.json` carries the open entries; a
  `process.exit`/`beforeExit` hook or an explicit finalize on spawn-completion
  in `opencode-spawn.ts` closes it). Register target: D18.
- **D20 deterministic spawn hook (Phase 2):** the directive is curated +
  schema-gated; the auto-spawn hook remains.
- **D12/D17 verification:** register rows claim Phase-2 fixes from the rev-1
  night whose code I did NOT find in the tree — next session should
  re-derive what (if anything) exists and re-gate those rows (honesty debt
  from rev-1's register, flagged here so it is not silently inherited).
- **D21 env-var split:** unify `OLYMPUS_VAULT`/`OLYMPUS_VAULT_DIR` consumers
  (one var, one resolver) — small, p2+.

**Merge authorization executed exactly once:** push `night/m3r2-p1`, ancestry
`git merge-base --is-ancestor origin/main night/m3r2-p1` → ff-merge to main →
delete `night/m3r2-p1` and the contained `night/14a` (the frontier is main).
