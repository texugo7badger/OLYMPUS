# MADRUGA-FIX-3 — THE GENERATOR NIGHT — FINAL REPORT

**Branch:** `night/fix-3` from main @ `269c5da`. **R4 entry snapshot:** the working-tree bytes cp'd at entry (`9e5f13e5…`, the moved-baseline law N32 — no fixed-sha expectation).

## E2 — the auditor's chain, REVERIFIED (R2; current line numbers)
(a) `FREE_MODEL_LIMITS` scripts/apply-strategy.js:344-366 — 17 lanes ALL output 2048 (1024 ×2 nano) + `'nvidia/z-ai/glm-5.2'` :360 ✓ (b) getFreeModelLimits :373-388 — `{...FREE_MODEL_LIMITS}` + only-unknown merge; the comment verbatim: *"curated entries win when both exist"* ✓ (c) applyFreeProviderLimits — modelsInUse (god pins + small_model) only, writes limit.output from the table ✓ (d) the glm-5.2 god-map mirrors: apply-strategy.js:307,319-325; src/lib/model-strategies.ts:410,415-421,830; olympus-hooks.ts:504-510 (double-quoted) — **a FOURTH mirror found by check-strategy-sync: src/components/olympus/settings-dialog.tsx:239,365-371** ✓ (e) preflightModelCatalogue — pins-only collection; lanes invisible ✓ (f) texugo's terminal evidence (SESSION INPUT, verbatim): the apply answered "No changes needed -- opencode.json already matches the strategy" with backup `opencode.json.20261005T193826Z.bak` + state file written; his grep: `opencode.json:1` glm-5.2; the guard never ran (shell error) — the KIT's convergence signal caught the false-green ✓ (g) the doctrine comment :338-342 — the "rate window" 2048 doctrine ✓. The false-green's mechanism, now explained end-to-end: the live config was CONSISTENT WITH THE SICK TABLE (limits matched; the dead lane was outside modelsInUse) → changes=0 → "No changes needed" over a config still carrying 2048 caps + the dead lane.

## F1 — the table fix ✅
17 outputs → **16384** (context values untouched); glm-5.2 → glm-5.3 (key + values + in-file comments, the supersession RECORDED in the rewritten doctrine comment: #76 evidence, FIX-2 floor/target, the guard as enforcement, request-discipline as the protection); all FOUR mirrors fixed (apply-strategy ×7 god pins + model-strategies ×10 + olympus-hooks ×7 [R12: dist rebuilt, glm-5.3 ×7 / old ×0 in the compiled output] + settings-dialog ×8); **check-strategy-sync: all 9 strategies in sync**; KNOWN_FREE_MODELS follows the table keys automatically (derived from FREE_MODEL_LIMITS — verified by construction). Grep-zero `nvidia/z-ai/glm-5.2` across active surfaces ✓ (two legitimate residuals: the generator fixture's deliberate dead-id test datum — register N38; the D19 preflight doc comment citing the historical incident).

## F2 — guard the source ✅ (N29 closed)
The table exported behind an ESM main-guard (`importing must NEVER execute the apply` — import-probe verbatim: 17 lanes, 0 under-8192, no glm-5.2 key, no apply side effects). **budget-guard now declares BOTH surfaces**: generator table (GREEN 16/16 post-fix) + working-tree config (honestly RED 12/12 until texugo's curative apply — exactly the KIT's convergence signal).

## F3 — the cure path ✅ (+ the scope question answered)
The modelsInUse SCOPE GAP was real: the live carries legacy lanes OUTSIDE the strategy map. **Implemented**: F3 floors EVERY free-provider lane present in the config (openrouter|nvidia|groq, GO/Zen providers untouched) to 16384 when < 8192; **F3b** removes dead/residual lanes the table no longer knows and no pin uses. Hermetic dry-run over the box's own live tree (temp OLYMPUS_HOME/ROOT, R4 intact — no write): **F3b removed 5 lanes** (nemotron-3.5-lightning:free [the refresh expired → the curated ling fallback governs; --refresh-models re-admits it via modelsInUse], groq/gpt-oss-120b + the empty groq block, glm-5.2, the dead nano), **F3 healed the remaining lanes to 16384**, **13 changes**, the lane-sighted preflight **PASSED**. A second dead table lane found live: `nvidia/nvidia/nemotron-3-nano-30b-a3b` (catalogue-verified absent — 57 models, only the omni-reasoning variant) → removed from the table; pickNano's fallback → the live variant.

## F4 — preflight lane-sight ✅ (N36 closed, red-first LIVE)
The dry-run first **FAILED LOUDLY**: "L4 catalogue preflight: 2 model id(s) not in the live catalogue… nvidia/z-ai/glm-5.2 (live suggestions: nvidia/z-ai/glm-5.3…)" — the exact D19 escape shape, now caught. After F3b's cleanup: the preflight **PASSED** (13 changes). Red captured verbatim; green after.

## F5 ✅
#76 progress comment (`6002820069`) — the closure bar unchanged (the live zero-cut run). Registers: N35 (closed), N36 (closed), N37 (state-file no-op note, open), N38 (fixture datum note). KIT §0.2 ERRATA applied (the "live apply carries it" claim falsified; the corrected pre-condition = the FIX-3'd apply + guard GREEN). CHANGELOG entry added + the stacked duplicate `[Unreleased]` folded (N31/N33).

## F6 — battery + close
Spot-sweep: budget-guard (generator surface 16/16 ✓; live surface RED 12/12 = the honest convergence signal) · check-strategy-sync OK (9/9) · tsc 0 · overlay compile 0 errors. The #76-sweep/live-click phases belong to UAT-R1 round 2 (after texugo's apply) — unchanged.

## Taxonomy check
No issues created/closed (#76 stays OPEN — the bar is the live zero-cut run; the progress comment carries evidence pointers). Register rows N35-N38 (scopes: registry/harness/telemetry — within the set). Dependabot untouched.

## Self-critique (3 weakest)
1. **"The curative apply is proven"** — via the HERMETIC DRY-RUN over a lane COPY of the live (13 changes, preflight green); texugo's real apply is staged, not run (R4 + the designed flow — his command is in the #76 comment).
2. **The lightning:free lane removal** — correct under the expired refresh (curated ling governs), but a `--refresh-models` run will re-admit it via modelsInUse; the F3b logic keys on "table ∸ pins" so this oscillation is by design, disclosed.
3. **The guard's live-surface RED** — honest but battery-awkward: on THIS box the suite exits 1 until texugo's apply. The split is declared in its output; the fresh-clone battery sees both green.

## STATE AT END
texugo's staged sequence (recorded in the #76 comment + here): `node scripts/apply-strategy.js --strategy free-openrouter` → `node scripts/budget-guard.test.mjs` (expect BOTH surfaces GREEN) → `grep -c "glm-5.2" opencode.json` (expect 0) → **UAT-R1 round 2** (the re-entry prompt stands unchanged).

## `git status --porcelain` (verbatim, at close)
```
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```
