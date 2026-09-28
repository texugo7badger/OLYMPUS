# OLYMPUS Worklog — Session Progress

**Date:** 2026-08-01  
**Status:** In progress — diagnostic errors remaining in `settings-dialog.tsx`  
**Next Action:** Fix parsing errors in settings-dialog.tsx, then validate full build

---

## ✅ COMPLETED TASKS

### Task 1 — Settings Save Error (Issue B) — **DONE**
**Root cause:** Settings dialog compared against previously-applied model instead of target strategy's curated default, and didn't pass `strategy` in override POST bodies.

**Files modified:**
- `src/components/olympus/settings-dialog.tsx` (lines 520-535): Changed `orig` comparison to use `STRATEGY_MODELS[strategy]?.[god]`; added `strategy` to POST body
- `src/app/api/olympus/providers/gods/route.ts` (after line 302): Added pruning of stale per-god overrides on strategy switch

**Validation:** `npx tsc --noEmit` passed

---

### Task 2 — Strategy-Identity Injection (Issues A/D) — **DONE**
**Root cause:** Apollo inferred strategy from model IDs + AGENTS.md and hallucinated (e.g., "via OpenRouter" on free-big-pickle).

**Files modified:**
- `src/lib/opencode-session.ts`: Added `activeStrategyId()` + `buildStrategyContextBlock()` — reads live strategy from `~/.olympus/llm-providers.json` / `active-strategy.json`, builds compact authoritative block from `LLM_STRATEGIES`. Injected into warm-session message POST and one-shot fallback.
- `src/app/api/olympus/action/route.ts`: Imported and prepended strategy block to one-shot path.

**Validation:** `npx tsc --noEmit` passed

---

### Task 3 — Free Nvidia Build No Output (Issue C) — **CODE READY, NOT VALIDATED**
**Root cause:** NVIDIA Build rejects OpenCode's injected params: `skills` (from `agent.skills`), `promptCacheKey`/`prompt_cache_key`/`prompt_cache_retention`/`cache_control` (from `olympus-go-cache` and `opencode-context-cache.mjs` plugins).

**File modified:**
- `scripts/apply-strategy.js`: Modified `applyFreeConfigShape(config, modelMap, strategy)` to accept strategy parameter. For `free-nvidia-build`: removes the two cache plugins from plugin array, deletes `agent.skills` property from all 10 gods (removing property prevents OpenCode from sending it; setting `[]` still sends it).

**Validation needed:** `node scripts/apply-strategy.js --strategy free-nvidia-build` then test CLI

---

### Task 5 — Custom Strategy Creator — **MAJORITY IMPLEMENTED**

#### `src/components/olympus/settings-dialog.tsx`:
- ✅ Added imports: `Select`, `Plus`, `X`, `Trash2`, `Calculator`
- ✅ State: `customStrategyOpen`, `customStrategyName`, `customStrategyGodModels`, `customStrategyCost`, `customStrategyDescription`, `customStrategyCreating`, `customStrategyError`
- ✅ `getCustomStrategyModels()` — computes available models from authorized APIs (GO/Zen/Free)
- ✅ `customStrategyModels` derived state
- ✅ `useEffect` for cost estimation via `estimateStrategyCost()`
- ✅ "+" button in LLM Strategy header
- ✅ Full modal: name input, cost banner, per-god model selects (grid), description preview
- ✅ `createCustomStrategy()` handler — validates, POSTs to API, refreshes list, selects new strategy
- ✅ `deleteCustomStrategy()` handler — DELETEs via API, refreshes list
- ✅ Custom strategy cards in strategy picker with delete button (Trash2 icon)

#### `src/lib/model-strategies.ts`:
- ✅ Added `estimateStrategyCost(godModels, auth)` returning `CostEstimate` type with tier (`free`|`low`|`moderate`|`higher`|`unknown`) + description
  - All free models → `free`
  - GO plan models → `low`/`moderate`/`higher` based on K3/Pro/Flash
  - Zen plan models → `low`/`moderate`/`higher` based on MiniMax/Kimi/Claude/GPT
  - Mixed → `higher`

#### `src/app/api/olympus/providers/gods/route.ts`:
- ✅ Added `customStrategy` body handler (POST) — validates all 10 gods, checks API auth per model, saves to `~/.olympus/custom-strategies.json`
- ✅ Added `customStrategy` param handler (DELETE) — deletes from custom-strategies.json

#### `src/components/olympus/provider-settings.tsx`:
- ✅ Added `Trash2` import
- ✅ Added `deleteCustomStrategy()` handler
- ✅ Custom strategy cards with delete button

---

## ⏳ PENDING TASKS

### Task 4 — Status Bar "Active God: Apollo" While Idle (Issue E) — **NOT STARTED**
**Plan:** Find `activeGod` in `src/lib/olympus-store.ts` and SSE handler; clear on `session.idle` event

### Cost Menu & Status Bar Updates for Custom Strategies — **NOT STARTED**
- Cost menu: Show token/dollar for custom strategies based on `estCostPerDay` tier
- Status bar: Display tokens + cost for custom strategies

### Documentation Alignment — **NOT STARTED**
Update all `.md` files to reflect v0.0.1:
- `MODEL-STRATEGIES.md` — add custom strategy docs
- `README.md` — update strategy table
- `CHANGELOG.md` / `ROADMAP.md` — reset to v0.0.1 baseline
- Others — verify accuracy

---

## 🔴 CURRENT BLOCKER: Diagnostic Errors in `settings-dialog.tsx`

**Errors (from diagnostics):**
```
error at line 912: Parsing error: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?
error at line 1039: ')' expected.
error at line 1157: Declaration or statement expected.
warning at line 1083: 'block' applies the same CSS properties as 'flex'.
```

**Likely causes:**
- Line 912: Unclosed JSX element or brace in custom strategy cards mapping (around line 884-910)
- Line 1039: Unclosed parenthesis in custom strategy modal
- Line 1157: Missing closing brace for component function

**Files needing fix:**
1. `src/components/olympus/settings-dialog.tsx` — primary (parsing errors)
2. Run `npx tsc --noEmit` after fix to catch any other TypeScript errors

---

## 🎯 NEXT COMMANDS TO RUN (After PC Restart)

```bash
cd /home/texugo/Projects/olympus

# 1. Fix settings-dialog.tsx parsing errors (see above)
# 2. Validate TypeScript
npx tsc --noEmit

# 3. Apply and test Free Nvidia Build
node scripts/apply-strategy.js --strategy free-nvidia-build

# 4. Test all strategies via terminal
# Switch strategy in Settings, then ask: "Hello, which LLM are you using at the moment?"

# 5. Test Custom Strategy Creator
# Open Settings → click "+" → create strategy → verify appears in picker

# 6. Run strategy sync check
node scripts/check-strategy-sync.js

# 7. Compile overlay
npm run overlay:compile

# 8. Full build
npm run build
npm run build:electron
```

---

## 📝 KEY FILES MODIFIED THIS SESSION

| File | Purpose |
|------|---------|
| `src/components/olympus/settings-dialog.tsx` | Settings UI + Custom Strategy Creator modal |
| `src/lib/model-strategies.ts` | `estimateStrategyCost()`, `CostEstimate` type |
| `src/app/api/olympus/providers/gods/route.ts` | Custom strategy POST/DELETE handlers |
| `scripts/apply-strategy.js` | NVIDIA Build fix (remove cache plugins + agent.skills) |
| `src/lib/opencode-session.ts` | Strategy context injection |
| `src/app/api/olympus/action/route.ts` | One-shot fallback strategy injection |
| `src/components/olympus/provider-settings.tsx` | Custom strategy delete buttons |

---

## 💡 NOTES FOR NEXT SESSION

1. The `settings-dialog.tsx` parsing errors are likely from the custom strategy cards section (lines ~884-910) where we wrapped buttons in `<div key={s.id}>` but may have mismatched closing tags.

2. The custom strategy modal (lines ~1038-1158) needs verification — check all `<Dialog>`, `<DialogContent>`, `<DialogFooter>` are properly closed.

3. The component ends at line 1158 — ensure the final `});` closes the `export default function SettingsDialog()`.

4. After fixing diagnostics, the Free Nvidia Build test is critical — it was the only strategy returning zero output before.

5. Custom Strategy Creator is feature-complete but needs end-to-end testing (create → appears in picker → applies → works).

---

## Known limitations at v0.0.1

- **Custom Strategy modal** works, but the model dropdown does not yet
  include newer LLM entries, and the dropdown styling does not fully match
  the OLYMPUS palette. Polish item, not a blocker.
- **GO Budget** sometimes returns "Task completed" without an assistant
  response when the underlying dispatch fails — the UI should surface the
  real error instead of silence. Investigate post-v0.0.1.
- **OpenCode Go region opt-in** was enabled on the workspace on
  2026-09-28, which unlocked GO Budget dispatch via
  opencode-go/deepseek-v4-flash.

---

*End of worklog. Resume from "CURRENT BLOCKER" section.*