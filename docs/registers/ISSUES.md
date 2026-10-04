# ISSUES — living register (MADRUGA-3, seeded from D9–D20 + AUD-MADRUGA-2 carry-over)

| id | title | status | evidence | target |
|---|---|---|---|---|
| D9 | free-strategy agent templates omit olympus tools (gods cannot dispatch) | FIXED + GATED (m3r2 p1 @ 83362e9) — generator grants the 11-tool overlay to all 10 gods structurally; pinned by scripts/free-lane-generator.test.mjs (22/22) | madruga-2 configs: `olympus-dispatch: undefined`; now fixture G1 | done (p1) |
| D10 | page-assembly omission: 9/9 runs build component kits, end turn without app/page.tsx | OPEN — dominant quality defect; ruler to decide | madruga-2 ledgers + transcripts | 14a+ |
| D11 | free-pool text channel whitespace-only (21× "\n") | OPEN | barbearia att1 transcript | 14a+ telemetry |
| D12 | cost.jsonl flat snake_case vs call-site parsers | FIXED this night (Phase 2 parser + verification) | madruga-2 "no rows for session" | Phase 2 |
| D13 | #61/#62 app-coupled — one-shots bypass retry/watchdog | OPEN (design decision) | madruga-2 D13 | 14b+ |
| D14 | single-model lane firstToken 1182s under 3-way contention | OPEN (sizing input) | madruga-2 P-bigpickle | Phase 4 matrix |
| D15 | recovery pass ≈ 2× context re-read (ceiling breach) | OPEN (retry pricing) | madruga-2 close.json | Phase 5 POLICY |
| D16 | prompt-length dilution: long prompts drop dispatch mandates (0/3 vs 2/2) | FIXED + GATED (m3r2 p1 @ 97c6997) — short single-action directive, curated per god (registry-derived parent, zero defaults); dispatch-spine.test.mjs 27/27 incl. 10/10 per-god curation table | madruga-2b dilution curve; delta-1 shape preserved | done (p1) |
| D17 | subagent cost rows attribute to god "global" | FIXED this night (Phase 2 per-god attribution) | madruga-2b cost window | Phase 2 |
| D18 | dispatch_outcome never fires on one-shot exits | OPEN — tool-side registration now lands the open entry (97c6997); the exit-path finalize remains | 3 live dispatches, 0 outcomes | Phase 2 |
| D19 | stale model IDs in strategy map (dead nvidia/z-ai/glm-5.2) | FIXED + GATED (m3r2 p1 @ 83362e9) — glm-5.2 pin retired → nvidia/z-ai/glm-5.3 (live-verified Oct 4 2026); apply-time catalogue preflight (binary direct, no silent skips, --force escape); D19 error shape proven by fixture G3/G4. NOTE: the rev-1 preflight was a structural no-op (invoked the native binary via node + silently skipped every provider) — found + fixed this session | task error verbatim; fixture 22/22 | done (p1) |
| D20 | task-invoke follow-through probabilistic (n=2, hypothesis) | SUPERSEDED by Phase 2 hook (deterministic spawn); the directive half hardened in p1 (curated parent, schema-gated emission) | madruga-2b probes | Phase 2 |
| D21 | two env vars name the vault root — OLYMPUS_VAULT (dispatch.ts, dispatch-tracker.ts) vs OLYMPUS_VAULT_DIR (src/lib/vault-root.ts getVaultRoot) — consumers split; a lane setting only one silently writes the resonance registry to the other root | OPEN — found by the p1 fixture (hermeticity probe) | dispatch-spine.test.mjs had to set both | p2+ |
| D22 | rev-1's L2/L3 source never compiled: import.meta.url in a CJS-target overlay (TS1470) — the deployed dist never contained the "FIXED this night" register claims | FIXED (97c6997: __filename; overlay:compile green) — disclosure: rev-1 register rows D16/D19 claimed fixes that were never live | overlay:compile failure, pre-p1 | done (p1) |
| AUD-2 carry | page-gate ruler calibration (1780B vs 2000B) | OPEN | madruga-2 big-pickle | Phase 3 gate |
