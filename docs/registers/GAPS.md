# GAPS — living register (MADRUGA-3)

| id | gap | evidence | note |
|---|---|---|---|
| G1 | no learning loop has ever run in OLYMPUS (all intelligence static) | RLM verdict, MADRUGA-3 §C | FILED → **#79** (https://github.com/texugo7badger/OLYMPUS/issues/79) |
| G2 | cross-conversation crash recovery for checkpoints (#65 follow-up) | batch-13 disclosure | FILED → **#86** (…/issues/86) |
| G3 | #69 live.jsonl blind to one-shot session events (tool side works — leverage it) | D8 + delta-1 feat | p2 landed the tool-side exit finalize (D18 closed); the app-side session events remained. **DIED with #69's fix (GAP-1-S2R @ db47ad5, 2026-10-07): the activityAgent fallback feeds one-shot tool/dispatch events into live.jsonl, attributed via the #25 sources; red-first proven (rowsTotal: 0 → rows present); #69 closed post-merge.** |
| G4 | page-gate ruler: is 2000B the right bar? (1780B real page failed it) | madruga-2 big-pickle | FILED → **#87** (…/issues/87 — pairs the ISSUES.md AUD-2 row) |
| G5 | browser automation path for Athena's click needs inventory (CDP? playwright?) | Phase 6 prep | FILED → **#88** (…/issues/88) |
| G6 | no docs/callimachus/ library structure exists yet | Phase 5 scaffold | GAP-1-S1 annotation: the empty placeholder dir was disposed (A2, the user's full-hygiene call; zero files, recreatable the day Callimachus ships). The library ITSELF remains future work (Callimachus scope) — candidate for the S4 discoveries lane |
| G7 | no fixture can drive the COMPILED dist tools standalone (the plugin SDK resolves only inside the opencode host; fixtures shim the host boundary at source level) | dispatch-spine.test.mjs shim | narrowed in p2: the postcompile artifact-sync keeps shipped src/lib artifacts compile-verified (the stale-artifact class is dead); a true host-mode probe remains future work → FILED **#89** (https://github.com/texugo7badger/OLYMPUS/issues/89) |
| G8 | the sync-map read path is disk-truth (no cache) — fine at current scale, but a very large map would want an index; also no retention/compaction policy yet for sync-map.json | atlas-sync.ts loadState (p2) | FILED → **#90** (…/issues/90) |
