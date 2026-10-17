# OLYMPUS Roadmap

**v0.0.3 is the current release** (shipped 2026-10-17 — "the fix-OLYMPUS-itself release"). 10 gods, 118 demigods, Symphony dispatch, the hop runtime, VaultBrain, the 8-check exit gate, DESIGN-INTELLIGENCE self-correction, and 9 built-in LLM strategies (3 GO, 3 Zen, 3 free: OpenRouter / Big Pickle / Nvidia Build, plus custom). See [CHANGELOG.md](CHANGELOG.md) for the full arc — two campaigns + five UAT rounds + the Design Intelligence evolution + the late arc (anchor rotation, strategy redesign, PLANNER-1/WALK-1/PANTHEON-RAIL/SELFTEST-1, the #81 cost stamp, the #96 gate check-8) + the CI cure.

---

## SHIPPED — v0.0.3 (2026-10-17)

- The UAT gate passed (the Lumina CRM acceptance: 14/14 hops, gate 7/7 + check 8, HTTP 200).
- **#81 closed** — the deterministic-spawn cost stamp (`OLYMPUS_LANE_GOD`): agent-less one-shot cost rows resolve the real god, never 'global'.
- **#96 closed** — the exit gate's check 8: duplicated JSX props (the silent-override class) fail the gate with element + props named; the bench corpus is optional.
- The CI chain cured (V003-CI): overlay compile, the VERSION straggler, the dead free-list fallback, the L4 skip knob. Release + Eval Harness green at the tag.
- 20 of 23 filed issues closed with evidence; the machine aligned (battery 31 suites green, sync 9/9).

## The near arc (v0.0.4)

1. **STRATEGY-REFRESH-2026-10-17** — sync `MODEL-STRATEGIES.md` + the canonical maps with the 2026-10-17 GO catalog (done for the docs in v0.0.3; the lane economics re-check owed) + a BenchLM-anchored quality-per-dollar table; validate candidate lane swaps (Claude Haiku 5.5 / GPT 6 Luna / MiMo-V2.6-Flash class) with live probes before they become defaults.
2. **#129 — the NVIDIA anchor rotation** (the user's call, user-pinned): step-5-preview is dead from the catalogue; gemma stalled in the probe window; survivors gpt-oss-20b / muse-glimmer / glm-5.3. Re-probe off-peak, then rotate the pin.
3. **BENCH-2 — the ambitious benchmark** (the ORBITAL concept: a real-time satellite ground-station mission-control — SQLite via Prisma, SSE live telemetry, ≥8 tables, role-gated auth, award-tier dark UI) + the variation matrix: free-nvidia-build / go-balanced / free-big-pickle / go-max-quality / go-balanced+low — same prompt, per-strategy reports under `reports/bench-2/` (hops, gate, design-score, wall-time, tokens, $, UAT).
4. **PANELS-TRIO** — the live-UX arc: #85 (the who-is-doing-what panel on the sync-map), #90 (sync-map retention/compaction), #100 (the in-app dev-server preview pane).
5. **VAULT-RAG-2** — semantic RAG over the vault (embeddings, local/free) upgrading the TF-IDF skill-vec index + the #84 instinct RAG.
6. **REA-MCP (optional, low)** — wire [morluto/rea](https://github.com/morluto/rea) as an optional Artemis MCP (binary/Electron/APK reverse-engineering) + a reference-analyzer lane for benchmarks.
7. **N10 cert night** — the planted-defect certification (needs the user's quota top-up decision).

## The future arc (v0.0.4 → v0.1, the P2/P3 ladder)

The still-open issues are the ladder (the v0.0.3 close retired most of the original 23 — #81 and #96 among them):

1. **Telemetry truth** — [#81](https://github.com/texugo7badger/OLYMPUS/issues/81) (session→god cost linkage) + [#82](https://github.com/texugo7badger/OLYMPUS/issues/82) (whitespace-only text channel): the observability layer tells the whole truth before anything builds on it.
2. **The drift detector + guard surface** — [#78](https://github.com/texugo7badger/OLYMPUS/issues/78) (the case-INSENSITIVE catalogue detector: the D19/AN10-AN12 class dies structurally) + [#80](https://github.com/texugo7badger/OLYMPUS/issues/80) (the guard declares live-vs-tracked): the config can no longer lie silently.
3. **The sizing matrix** — [#83](https://github.com/texugo7badger/OLYMPUS/issues/83): firstToken under contention + recovery re-read cost, measured — lane-max and pool sizing become data.
4. **The live learning loop** — [#79](https://github.com/texugo7badger/OLYMPUS/issues/79): instincts promoted from real sessions (G1, the metabolism's first live cycle).
5. **Instinct RAG** — [#84](https://github.com/texugo7badger/OLYMPUS/issues/84): proven instincts ride new dispatches as short prior-context blocks.
6. **Crash recovery** — [#86](https://github.com/texugo7badger/OLYMPUS/issues/86): dispatch journal replay (the R14 incident is the case study).

Where the rest earns its keep:

- **UX** — [#85](https://github.com/texugo7badger/OLYMPUS/issues/85) (the who-is-doing-what panel) rides the sync-map that already exists; [#95](https://github.com/texugo7badger/OLYMPUS/issues/95) (ROOT-LANE-ADOPT) wires the #77 lane into the app terminal.
- **Harness rigor** — [#87](https://github.com/texugo7badger/OLYMPUS/issues/87) (page-gate ruler), [#91](https://github.com/texugo7badger/OLYMPUS/issues/91) (one-shot retry coverage), [#89](https://github.com/texugo7badger/OLYMPUS/issues/89) (host-mode probe), [#94](https://github.com/texugo7badger/OLYMPUS/issues/94) (the battery contract).
- **State + certification** — [#90](https://github.com/texugo7badger/OLYMPUS/issues/90) (sync-map retention), [#92](https://github.com/texugo7badger/OLYMPUS/issues/92) (the CERT-CALLIMACHUS re-try), [#93](https://github.com/texugo7badger/OLYMPUS/issues/93) (the GO/Zen mirror divergence), [#88](https://github.com/texugo7badger/OLYMPUS/issues/88) (the browser-automation inventory).

**License:** AGPL-3.0-or-later. See [LICENSE](LICENSE).
