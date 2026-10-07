# Changelog

All notable changes to OLYMPUS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [v0.0.2] — 2026-10-05

Every line carries its evidence pointer. The night's register: `docs/registers/ISSUES.md`;
full reports under `reports/m3r2-p1/`, `reports/m3r2-p2/`, `reports/bench-in-1/`, `reports/fix-1/`.

### Added

- **The dispatch spine, closed end-to-end (L1–L5 dead)** — free-tier configs grant the full 11-tool OLYMPUS overlay to every god (L1); every dispatch self-registers in the dispatch registry with {id, god, target, timestamp, directive hash, status} and an unregistrable dispatch fails loudly, never silently (L2); invoke directives are registry-curated per god — the generic `"apollo"` default is dead (L3); emission records are schema-validated before the directive is emitted (L4); the full chain fires end-to-end — god → `symphony-dispatch` → zero-loss Vault signature (checksum-verified) → live feed event → registry entry → auto-injected demigod (L5). Evidence: commits `83362e9` + `97c6997`; `reports/m3r2-p1/` (27/27 + 22/22 fixtures).
- **Atlas, the single writer** — the sync-map records EVERY prompt the system receives (project via the chat.message hook; dispatch via the tool's entry; broadcast via symphony-resonate) with the full lifecycle (received → routed → done/failed); only Atlas writes the map (unforgeable token + hash-chain tamper evidence); any god queries identical state. Evidence: commit `04c6c2c`; `reports/m3r2-p2/` (16/16 fixture).
- **The generated-project EXIT GATE** — `scripts/project-exit-gate.mjs`: seven deterministic checks (lockfile, `npm ci`, build, dev + `curl /` == 200 on a self-cleaned ephemeral port, zero absolute symlinks, imports-vs-deps, route composition). "A generated project runs on the first try" is now structural. Wired at BOTH points: the generator's done-condition (the delivery contract) and the driver's census — the byte-counting census is retired (D30). The bench estimates this gate would have caught 15/16 failures automatically. Evidence: commit `53b8a27`; `reports/fix-1/` (9/9 RED/GREEN fixture).
- **The delivery contract (prompt layer)** — composition-first, `npm view` version resolution, export-surface validation, lockfile, gate-as-done: `.opencode/rules/common/generated-project-delivery.md` + the campaign driver's prompt verbatim. Evidence: commit `53b8a27`; 35/35 wiring fixture.
- **THE PROOF (the headline)** — one fresh cafeteria-class landing ("Cafeteria Grão & Alma") regenerated end-to-end with the corrected pipeline and **passed the exit gate with zero manual fixes** — all seven checks green (lockfile, ci, build, dev HTTP 200, portable tree, imports declared, composed route). Evidence: `reports/fix-1/` F4 (gate output verbatim); the tree at `~/olympus-bench/fix1/projects/cafeteria-grao-e-alma/`.

### Fixed

- **D18 (dispatch_outcome never fires on one-shot exits)** — process-exit finalize in both gate paths; mid-flight deaths land `failed`, never dangle; a failed finalize write is loud and keeps the entry open. Evidence: `04c6c2c`; `reports/m3r2-p2/` E1 (16/16).
- **D19 (dead model ids break subagent spawns)** — the `nvidia/z-ai/glm-5.2` pin retired → `glm-5.3` (live-verified against the catalogue); apply-time catalogue preflight executes the binary directly, with the catalogue's own suggestions and a loud `--force` escape. Evidence: `83362e9`; fixture G1/G3/G4 22/22.
- **D21 (two vault env vars; the real vault leak class)** — `OLYMPUS_VAULT` is the one canonical variable; `OLYMPUS_VAULT_DIR` deprecated with a loud warning; all 14 overlay call sites migrated; shipped src/lib artifacts now SELF-HEAL (the overlay postcompile syncs them every compile — the D22 stale-artifact class is structurally dead). Evidence: `04c6c2c`; zero direct env reads, grep-proven.
- **P-E harness hygiene (D27)** — the driver's lane scaffold puts ALL harness artifacts (opencode.json, .opencode, transcripts, injection root) at the LANE level; deliverables carry zero absolute symlinks/paths. The F4 deliverable verified: zero absolute paths in source, zero harness artifacts. Evidence: driver.mjs:76-90; `reports/fix-1/` F2.

### Changed

- **D12 verdict (misattribution corrected)** — the repo's cost parser was never broken (`readRealCosts` reads the on-disk snake_case shape); the zero-rows parser was bench-driver-side. rev-1's unverifiable register claim retired. Evidence: `reports/bench-in-1/` E2.
- **D17 struck + re-opened** — the agent-present attribution ladder predates the claimed night; the observed agent-less one-shot rows need session→god linkage at deterministic spawn → Part 5 (with D20). Evidence: `reports/m3r2-p2/` E2.

### Also in this release (landed batch 13, on main since `6694a3f` — cited for completeness)

- **#61** auto-retry on transient provider failures (`{429, 500, 502, 503, 504, provider_overloaded, stream_idle_timeout}`; 2 retries, same warm session, loud #56-style exhaustion guidance). Evidence: commit `3ef01b5`; `reports/13/`.
- **#62** watchdog auto-nudge before kill + permission-pending rendered distinct from stall. Evidence: commit `32d8967`; `reports/13/`.
- **#63/#64/#65** continuation inheritance, round-cap + declared defaults, decision checkpointing. Evidence: `reports/13/BATCH-13-REPORT.md` (146 assertions).

### Release facts

- **Suites: 14 green** (agreement-metric, context-distill, task-classifier, telemetry-slice, autonomy-gate, opencode-session, checkpoint, findings-foldback, dispatch-spine, free-lane-generator, atlas-sync, project-exit-gate, generation-contract + the bench RED/GREEN run) — ~250 deterministic assertions.
- **E4 (live config)** — explicitly ACCEPTED as gated-generator-equivalent: the dry-run reports "No changes needed" (zero diff); `opencode.json` @ sha256 `fcaf7c13…`. Evidence: `reports/m3r2-p2/` E4.
- **D10 cause-(c) CONFIRMED live** — the god prompts' #64 round-cap semantics read as "end the round" in one-shot runs, and turns end at the output-token limit mid-kit (`reason: 'length'` in the transcripts); minimal resumes complete in one shot (the D16 dilution curve held all night). Evidence: `reports/fix-1/` F4 (all strikes verbatim).


### Known Issues

- **D31 — one-shot generation turns can end at the output-token limit mid-kit (`reason: 'length'`) and the #64 round-cap god-prompt semantics read as "end the round" in one-shot runs** (the live-confirmed mechanical twin of D10). Mitigations shipped in this release: the single-turn override clause in the generation contract, minimal-strike automated resumes (the D16 dilution curve's compliant shape), and the exit gate as the deterministic catch-all — but a model/budget sizing fix remains open (Part 4/5 scope). Evidence: `docs/registers/ISSUES.md` D31; `reports/fix-1/` F4 (three `reason: 'length'` cuts verbatim).

## [Unreleased]
### Fixed (MADRUGA-GAP-1 S3 — the foundry night)

- **AN11 closed — the dead context-override key**: `NVIDIA_CONTEXT_OVERRIDES` in `scripts/refresh-free-models.js` still carried `'z-ai/glm-5.2'` while the NVIDIA endpoint serves the glm-5.3 family only (live-verified against `https://integrate.api.nvidia.com/v1/models` — 80 models, 2026-10-07 — recorded verbatim before any edit). The refresh removed ALL 18 override keys the live list no longer serves (glm-5.2 + the llama-3.3/deepseek/minimax/mistral-medium/stepfun-era residue) and added the current coding family (`z-ai/glm-5.3` + `z-ai/glm-5.3-flash`, 1M ctx).
- **AN12 closed — the stale "best coding model" prose**: `MODEL-STRATEGIES.md` still described glm-5.2 as the platform's best coding model. The `free-nvidia-build` section now pins `nvidia/z-ai/glm-5.3` with the live verification date; TOKEN-ECONOMY.md and the README strategies table cured in the same stroke. The four code mirrors were verified already-5.3 (FIX-3's work stands — tonight's residue was docs + script only). The GO/Zen live-provider ids untouched (the stale GO-card prose is ledgered as the GO-CARD-PROSE S4 filing candidate).
- **#67 closed — the Apollo project scaffold**: on a NEW project session (a distinct task/project detected — never a continuation), Apollo creates the project folder with `README.md` before anything else: the project description in the task's own words, the chosen stack with a one-line justification per choice, and a `## Decisões` block APPENDED each approval round — never rewritten (the session-retention alicerce texugo asked for 2026-10-04; the prompt-level proxy for #65). Placement honors the D16 dilution law: a short directive after the Identity paragraph, INSIDE the free 1000-char inline window (char ~447 — the free tier sees the law), plus a one-line cross-reference in the Project Auto-Creation section. The tracked `opencode.json` apollo inline refreshed via the stash-dance (surgical, the guard read the tracked 10/10 + generator 16/16 + sync 9/9 in-window; the live cp-restored byte-exact).
- **Battery suite #22** — `scripts/apollo-scaffold.test.mjs`: red-first hermetic. RED 13 FAILs (no directive → the simulated session produces no folder/README/decisions); GREEN 17/17 — the directive's presence, completeness, free-window placement, and mechanical executability (first turn = 1 scaffold write; the second round appends under `## Decisões` with prior lines intact; the census proves the file GROWN, never rewritten). Transcripts: `reports/gap-1/s3/`.

### Fixed (MADRUGA-GAP-1 S2R — the pulse pair, re-landed)

- **#69 closed — one-shot spawns write to live.jsonl**: driver-spawned `opencode run` sessions never fire `session.created` (opencode 1.18.10), so `state.agentId` never populated and the hard `if (!state.agentId) return;` gate froze every activity write while the cost line kept flowing — a busy one-shot session with a rich cost.jsonl and a dead feed (the D8 blindness, now reproduced deterministically as the suite's RED). The fix: `activityAgent = state.agentId || eventAgent || null` — attribution falls back to the same trusted sources the cost path uses (#25): the call's own agent, else the bus-recorded agent for the callID, else "global" via godId. The tracker is never mutated by the fallback; interactive behavior unchanged with zero duplicate rows (asserted, before and after).
- **#77 closed — the root session heartbeat lane (opt-in)**: the #25 managed-process gate silenced foreign runs AND the user's interactive root session (heavy tool activity, zero heartbeats on the bus). The root session now declares itself with `OLYMPUS_ROOT_SESSION=1` and `buildRootSessionHooks()` registers exactly the Part-3 wiring — acting heartbeats at `tool.execute.before`, idle at `session.idle`, on the bus + Atlas — driven by an in-memory session-local tracker. The #25 contract preserved verbatim (asserted, not assumed): no cost writes, no active-agent.json, no VaultBrain/Callimachus/dispatch registration; foreign processes keep the bare tools-only return.
- **Battery suite #21** — `scripts/telemetry-pulse.test.mjs`: red-first hermetic (temp OLYMPUS_ROOT/VAULT/HOME/HOME before any import; the real state never touched). RED verbatim: the one-shot shape `rowsTotal: 0` with `costRows: 2` + the root shape `hooks.event is not a function` (the filed live evidence's deterministic twin) — 7 FAILs / 17 checked, exit 1; GREEN 17/17, exit 0. Transcripts: `reports/gap-1/s2r/`.
- **R14 disclosure — this is the redo**: the original S2 ran on a credential-less container box; its local-only merge and the honest bundle substitute were LOST to a box reset before the user could apply them. The lost shas are never evidence; the work above was re-implemented from the recovered spec with new shas and fresh RED/GREEN transcripts, and pushed for real this time (R15 — the box had credentials).

### Fixed (MADRUGA-GAP-1 S1 — the reset night)

- **#70 closed — harness portability**: `scripts/opencode-session.test.mjs` no longer hardcodes `/home/texugo/Projects/olympus`; the repo root is derived from `import.meta.url` (the checkpoint.test.mjs pattern). The suite now runs on any box — 33 PASS / 0 FAIL verbatim. Evidence: commit `8f822fa`; issue #70 closed post-merge.
- **AN13a — the N37 no-op regression test persisted** (battery 19 → 20): `scripts/apply-noop.test.mjs` guards the no-op marker — apply-1 (changes > 0) → state WITHOUT the marker; apply-2 (no-op) → `noOp: true` + the budget-guard pointer note verbatim. Hermetic (temp `OLYMPUS_ROOT`/`OLYMPUS_HOME`/`HOME`; the real state never touched) + offline-deterministic (`--force` escapes key validation and the catalogue preflight; no fresh refresh file → the curated table). Red-first: against the pre-N37 mutant the two N37 assertions FAIL (exit 1, verbatim); against the real script 12/12. Evidence: commit `e284dc2`.
- **N38 — the load-bearing dead id marked**: the free-lane-generator fixture's `z-ai/glm-5.2` datum now carries the deliberate-dead-id comment + the swap rule (the day the catalogue retires glm-5.3, swap in a fresh dead id). Datum unchanged; suite 22/22. Evidence: commit `e8743f2`.
- **AN10 — the auditor's residue-lane claim REFUTED, no removal**: `openrouter/nvidia/nemotron-3.5-lightning:free` is ALIVE on all three probe surfaces (the live OpenRouter list — free, 1M context; the strategy's cached top-10, ranked #2; the opencode binary's provider catalogue) and is pinned by 6 gods in the tracked config. The card's ALIVE branch taken: tracked stays 10 lanes, guard green on both surfaces.
- **AN6-extra — the two empty pre-campaign dirs disposed** (the user's full-hygiene call): `docs/callimachus/` + `src/app/api/olympus/providers/keys/` removed via rmdir after a zero-files verification; recreatable the day Callimachus ships.
- **The register reconciliation (63 rows, verdicts + pointers only)**: the F6 exit-gate class verified against the gate's seven checks — D24/D25/D26/D27/D29/D30 CLOSED; D28 SPLIT (the duplicated-onChange half is genuinely uncovered → GAP-1-S4 filing); N37 CLOSED + persisted; N38 marked; AN6-extra resolved; N39-old superseded by the pinned row; UAT-R1 resolved-by-R2; D31's config-side done (the live bar is #76, the user's UAT); D27's stale row now agrees with the landed P-E CHANGELOG entry; 19 rows marked OPEN → GAP-1-S4 filing. Evidence: commit `f1b12d9`; `docs/registers/`.

### Fixed (MADRUGA-SWEEP-1 — the ledger night)

- **AN6**: the strike-residue captured first (tar + sha manifest, `reports/sweep-1/an6-capture/`) then removed — the repo root is clean for the v0.0.3 tag (two empty pre-campaign dirs remain, reported not blind-cleaned). **AN5**: the tracked config folded — the dead plain-nano lane + the groq residue removed (the tracked converges to the live's lane set; guard green on both). **AN2**: the static-map dead pin (callimachus's plain-nano, catalogue-absent) repointed to the live omni lane across all four surfaces — the canonical, the generator, the hooks (R12: dist rebuilt + grep-verified), the settings-dialog mirror (sync 9/9) — plus the stale "GLM-5.2 (best coding)" UI string. **AN3**: the refresh script's inert dead-pin override removed; the OUTPUT_CAP doctrine rewritten to the 16384 floor law. **N37 closed**: a no-op apply now records `noOp: true` + a guard-pointer note (red-first hermetic: apply-2 carries the marker, apply-1 does not) — the false-green's silent accomplice disarmed.
- **N39 PINNED (the diagnostic lane)**: the skill-load storm is the turn-death mechanism — the skills-trimmed lane (the 2 skill-data plugins out of the lane copy) completed the Aurora brief with 22 clean step-finishes, ZERO unknown-deaths, ZERO length-cuts, and **the exit gate ALL-7 FIRST-TRY** — a live full-kit generation under the sized caps. Evidence: `reports/sweep-1/n39/N39-VERDICT.md` + the transcript (swept before cleanup, AN7). The KIT §3 watch extended with the re-try shape.
- **Errata (AN4)**: the FIX-3 entry's "17/17" table count — the guard's real generator count is 16/16 (register N35's accounting: 17 lanes minus the dead plain-nano removed).

### Tested (UAT-R1·R2 — the dress rehearsal, round 2)

- The convergence signal MET and re-verified: budget-guard BOTH surfaces GREEN (live 8/8 + generator 16/16, exit 0); live glm-5.2 zero — the curative apply executed by texugo (13 changes, auditor-verified). The rehearsal body ran for real: the **#76 sweep** (`reports/uat-r1/length-cut-sweep.mjs` + `#76-sweep.md`) — **zero length-cuts across both strikes** (the sized budget holds); the closure bar honestly NOT met (both turns died `reason:'unknown'` pre-write — a NEW class, N39: the skill-storm turn-death). The **UAT KIT revised by execution** (3 `[rev: executed R2]` marks): the brief-gate structural mismatch corrected (Next-shaped scaffold), the N34 single-invocation script (`SPAWN-INVOCATION.sh`), the unknown-death watch. #76 stays OPEN with the sweep evidence; the residual registered.


### Fixed (MADRUGA-FIX-3 — the generator night)

- **The generator carried the disease (N35, closed)** — `FREE_MODEL_LIMITS` in `scripts/apply-strategy.js` hard-coded output 2048 (1024 nano) + the dead `z-ai/glm-5.2`, with curated-wins-over-refresh merge (refresh immunity BY DESIGN) — so the live apply FALSE-GREENED over a sick config and a healthy live would be re-infected. All table lanes → 16384; the dead pin → `glm-5.3` across ALL mirrors (apply-strategy, model-strategies, olympus-hooks [R12: dist rebuilt + grep-verified], settings-dialog — found by check-strategy-sync). Evidence: `scripts/budget-guard.test.mjs` (the generator case, green 17/17).
- **Preflight lane-blindness (N36, closed)** — `preflightModelCatalogue` collected pinned models only; provider-block LANES were invisible (how glm-5.2 escaped the D19 gate). Lanes now join the id set; a dead lane fails the apply loudly. Plus **F3**: the modelsInUse scope fix (legacy lanes healed to the floor — groq, stale nvidia lanes) + **F3b** dead-residue cleanup (the apply removes lanes the table no longer knows). Cure-path proof: a dry-run over the live tree heals 12 lanes + removes 5 dead/residual lanes + passes the lane-sighted preflight. Evidence: the FIX-3 session log.
- **A second dead table lane found + fixed**: `nvidia/nvidia/nemotron-3-nano-30b-a3b` absent from the live catalogue (verified 2026-10-06, 57 models — only the omni-reasoning variant remains); pickNano's fallback moved to the live variant.

### Fixed

- **#76/D31 — the config-level output budget (the top killer)** — every provider lane in the shipped `opencode.json` declared `limit.output` 1024–2048 while a complete landing kit measures ~9,633 output tokens; turns ended mid-kit with `reason: 'length'` BY CONFIGURATION (three cuts verbatim, 2,015–2,039 tok at death). All 12 lanes now `16384` (floor 8192, derived from the F4 evidence — the derivation is in the guard's header). The **budget-guard** joins the battery (`scripts/budget-guard.test.mjs`, red 12/12 → green 12/12). Evidence: `scripts/budget-guard.test.mjs`; issue #76 progress comment.
- **D19 shipped-config completion** — the dead `z-ai/glm-5.2` pin (tracked `opencode.json:482`) → `z-ai/glm-5.3` (the live catalogue's own suggestion); grep-zero in the tracked config; the L4 apply-time preflight passes through the designed flow. Evidence: the p1 fixture family + the fix-2 dry-run.



### Added

- **Strategy activation gate** — strategies are blocked until the API they need is authorized inside OpenCode (see Changed).
- **10 built-in LLM strategies** (was 6): the Zen plan has the full 3-tier treatment — `zen-max-quality`, `zen-balanced`, `zen-budget` — on OpenCode Zen (`opencode/<id>`, pay-as-you-go, full 128-agent shape). Since the proprietary-API redesign, the ZEN tiers run Claude Sonnet 5 / GPT-5.4 / Gemini 3.5 Flash / Kimi K2.7 Code / MiniMax M2.7 (see the Changed entry).
- **`free-openrouter`** — the OpenRouter-only split of the Free config: primary trio on #1, specialists on #2, Callimachus on a fast background model.
- **`free-nvidia-build`** — NVIDIA Build free endpoints (build.nvidia.com): GLM-5.2 + the Nemotron family for free. Apollo + Atlas on the strongest NVIDIA free model live (Nemotron 3 Ultra 550B), the coding trio (Hephaestus/Athena/Dionysus) on pinned GLM-5.2 (best coding model), other specialists on #2, Callimachus on a nano-class background model. The NVIDIA model list is fetched live (public endpoint, no key needed); requests use a free `nvapi-...` key configured inside OpenCode. Model ids use the `nvidia/<vendor>/<model>` prefix (OpenCode's built-in `nvidia` provider).
- **Real-time free-model refresh across all free strategies** — `scripts/refresh-free-models.js` now fetches OpenRouter + Groq **+ NVIDIA Build** lists; apply-strategy.js routes the Free Groq / Free OpenRouter / Free Big Pickle / Free Nvidia Build strategies to the strongest free models currently live (24-hour TTL, `--refresh-models` to force).

### Changed

- **ZEN strategies redesigned around proprietary APIs** — `zen-max-quality` (Atlas Gemini 3.5 Flash, Athena+Hephaestus Claude Sonnet 5, others GPT-5.4, vault Gemini 3.5 Flash), `zen-balanced` (Athena+Hephaestus Claude Sonnet 5, specialists Kimi K2.7 Code, vault MiniMax M2.7), `zen-budget` (all others MiniMax M2.7). GO stays on the open-weight line (GLM, DeepSeek, Qwen, Hy3); ZEN is now the proprietary-API plan. Apollo stays on GLM-5.2 in both (sacred). All per-god maps updated in `model-strategies.ts`, `apply-strategy.js`, and the hooks mirror.
- **Full Zen catalog in the model picker** — `ZEN_MODEL_CLASSES` now covers every model OpenCode Zen currently supports (verified 2026-07-31, deprecated models excluded): GPT-5.x family, Claude, Gemini, Grok, Qwen-Max/Plus, Kimi, MiniMax, the open-weight line, and the free-on-Zen trials. Custom strategies and per-god overrides can now pin any of them.
- **ZEN branding** — the three Zen strategies display as **ZEN Max Quality** / **ZEN Balanced** / **ZEN Budget** in Settings and the LLM Strategy menu (ids unchanged: `zen-max-quality`, `zen-balanced`, `zen-budget`).
- **FREE badge** — the three free strategies (`free-openrouter`, `free-big-pickle`, `free-nvidia-build`) show **FREE** instead of `cost: low` in the strategy menu (their `estCostPerDay` is `free`).
- `isFreeTierStrategy` / `strategyFamily` now cover every `free-*` strategy id; the Zen family covers all three `zen-*` ids.
- Free-tier prompt char limits are provider-aware: OpenRouter **and NVIDIA** gods get 1000 chars, Groq gods 300.
- Auth status now detects a configured NVIDIA key (`auth.nvidia`, `OLYMPUS_NVIDIA_KEY`, `nvidia_key` in llm-providers.json) and recommends `free-nvidia-build`.
- Per-god overrides accept `nvidia/...` models; provider limits (context/output) are written for NVIDIA Build endpoints.
- **Strategy activation gate** — strategies are now **blocked** until the API they need is authorized inside OpenCode (GO plan for `go-*`, ZEN key for `zen-*`, Groq/OpenRouter/NVIDIA keys for the free strategies). Blocked cards render disabled with a lock + what's missing; the Settings save flow and the providers API (`/api/olympus/providers/gods`, 403 `API_NOT_CONFIGURED`) both reject blocked switches. Auth detection shared via the new server-only `src/lib/llm-auth.ts`; `strategyApiRequirement()` (pure) defines the strategy→API map.

### Removed

- **`go-with-free-fallback` ("Free") strategy removed** — the free tier is provider-specific now: `free-openrouter` (the direct successor — same split, OpenRouter-only), `free-big-pickle`, `free-nvidia-build`. All migration-remap code for a persisted `strategy: "go-with-free-fallback"` in `~/.olympus/llm-providers.json` has also been removed — re-apply a current strategy (`olympus apply-strategy <id>`) if an old value is still persisted.
- **Auto model fallbacks removed** — the `--use-fallbacks` flag, the `FALLBACKS` map (apply-strategy.js), and `GOD_FALLBACK_MODELS` / `getFallbackModel()` (model-strategies.ts) are gone. When a model's cap is hit, switch strategies manually (`go-balanced`, a Zen strategy, or one of the three free strategies).
- **`free-groq` strategy removed** — Groq's free tier (12K TPM window) cannot serve the ~46K-token OLYMPUS system prompt: every request overflowed and opencode's auto-compaction fell into an endless "anchored summary" loop (reproduced on free-groq, free-openrouter and free-big-pickle — all three had been running the same stale groq/gpt-oss-120b config because strategy switches never restarted the warm `opencode serve` server). All `groq/*` model entries and Groq's live-refresh entry were removed too.
- **Strategy switches now restart the warm OpenCode server** — `apply-strategy.js` kills the running `opencode serve` (and clears the conversation→session map) after rewriting opencode.json, so the new per-god models actually take effect instead of the server serving its stale startup config. This was the root cause of "one corrupted session is corrupting others": every strategy test ran the same stale model.

### Fixed

- **Free strategies no longer load cost telemetry** — the free config shape dropped `./.opencode/olympus` (the overlay that writes `~/.olympus/metrics/cost.jsonl`), so the status bar / Cost menu showed no token usage during free sessions. The overlay is back in the free plugin set (now 4 plugins) and cost events flow again.
- **Context indicator always showed 0%** — OpenCode ≥1.18 stores sessions in SQLite (`~/.local/share/opencode/opencode.db`), but `/api/olympus/context-usage` only read legacy JSON session files that no longer exist. The route now reads real usage from the DB (keyed by `conversationId` → warm session, fallback: newest session), so the ctx % + "new session" button work again.
- **"Stop" / reset / new-session didn't actually stop the run** — the terminal's `stop()` only reset client state; the in-flight POST kept streaming for up to 10 minutes (the stuck "anchored summary" loop the user saw, which kept appending events even after reset). `submit()` now uses an AbortController; `stop()`, reset, and new-session abort it, which propagates to `req.signal` and cancels the server-side warm opencode POST.
- **Handoff summaries could poison the next session** — `buildConversationSummary` fed the last 8 messages verbatim; a run of repeated assistant output (e.g. the loop) was replayed into the new session. Consecutive assistant/system/delegation/todo entries now collapse to the last one.

## [0.0.1] — 2026-07-27

The base release — the most complete and alternative way to run OLYMPUS.

### Added

- Initial public release.
- 10 gods (Apollo, Atlas, Artemis, Athena, Dionysus, Hephaestus, Hermes, Persephone, Prometheus, Callimachus) + 118 demigods (128 agents).
- Symphony v1.0 latent dispatch protocol with VibrationalSignatures.
- VaultBrain v3.0 self-curating brain with instinct short-circuits.
- Electron desktop app with Next.js 16 dashboard (localhost:3737).
- 3D Brain Atlas (Three.js / Canvas2D) visualizing gods, instincts, and knowledge.
- Editor Bridge — launchpad for Zed, VSCode, VSCodium, Cursor.
- Terminal Bridge (port 3740) — token-gated WebSocket for IDE extension PTY sharing.
- WebSocket bridge (port 3738) for real-time UI activity feed.
- **Persistent OpenCode session:** every conversation message runs on one warm `opencode serve` instance (`src/lib/opencode-session.ts`, port 3777, env override `OLYMPUS_OPENCODE_PORT`), with context retained across follow-ups. Applies to all strategies.
- 5-layer cascading compression stack (caveman, strategic-compact, Symphony).
- Hot/Warm/Cold skill + MCP tier system (81% input reduction).
- Skill index (sqlite-vec TF-IDF cosine search, 330 skills).
- 8 plugins (dispatch tracker, instinct gate, MCP gate, skill registry, go-cache, dynamic-context, ECC hooks, superpowers).
- 19 MCP servers with 3-layer gating (toggle, API key, god allowlist).
- 6 LLM strategies: go-max-quality, go-balanced, go-budget, **zen-balanced (Zen — OpenCode's pay-as-you-go gateway, full 128-agent shape, no request caps)**, go-with-free-fallback (Free), free-big-pickle (Free Big Pickle).
- 4 LLM providers (OpenCode GO, OpenCode Zen, OpenRouter free, Groq free).
- Eval harness with 5 golden tasks (CI gate via GitHub Actions).
- Benchmark recording (always-on opt-in, local-only).
- Vault backup via isomorphic-git (auto-commit every 5 min).
- AGPL-3.0-or-later license with CLA requirement.

### Changed

- **Free strategy:** `go-with-free-fallback` is labeled **Free** (id kept for back-compat). Primary gods run on the strongest free model currently live (550B / 1M-context flagship), specialists on the second-strongest, Callimachus on a fast background model.
- **Live model refresh:** `scripts/refresh-free-models.js` fetches the current OpenRouter + Groq free model lists, scores them, and writes `~/.olympus/free-models.json`. The Free strategies route gods to the current top models when that file is fresh (≤ 7 days).
- **Free Big Pickle:** all 10 gods — Callimachus included — run on the same best free model (default: `nvidia/nemotron-3-ultra-550b-a55b:free`, 550B params / 1M context). `small_model` + `vaultLlm` stay on Nemotron nano.
- **Groq path upgraded:** Groq-only config uses `groq/openai/gpt-oss-120b` instead of llama-3.3-70b.
- Action route startup timeout raised 45s → 120s with a clearer error message that covers free-tier rate limiting.
- Router plugin hardened: `isMcpTool` / `getMcpServer` guard non-string tool values.
- Action route: prompt/answer/context/new-session messages stream through the warm session; falls back to one-shot `opencode run --format json --session <id>` if the server dies mid-run.
- Settings: per-god model classes are filtered to the active strategy family (GO → `opencode-go/*`, Zen → `opencode/*`, Free → `openrouter/*` + `groq/*`).

### Fixed

- Overlay compile error in `dispatch.ts` (`lastInjectedAt` type missing on the injected tracker).
- Stale per-god overrides no longer silently pin old free models after a strategy default change.
- Auth detection no longer misreads Zen (`opencode`) or free-tier keys as a GO plan.
- Free-tier provider card no longer duplicates the provider list / models in use.

[0.0.1]: https://github.com/texugo7badger/olympus/releases/tag/v0.0.1
