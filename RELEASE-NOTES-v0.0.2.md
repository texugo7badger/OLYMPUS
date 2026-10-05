# OLYMPUS v0.0.2 — Release Notes

**Date:** 2026-10-05 · **Tag:** v0.0.2 · Full evidence register: `docs/registers/ISSUES.md`; reports under `reports/m3r2-p1/`, `reports/m3r2-p2/`, `reports/bench-in-1/`, `reports/fix-1/`.

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
