# GAPS — living register (MADRUGA-3)

| id | gap | evidence | note |
|---|---|---|---|
| G1 | no learning loop has ever run in OLYMPUS (all intelligence static) | RLM verdict, MADRUGA-3 §C | Phase 5 seeds it |
| G2 | cross-conversation crash recovery for checkpoints (#65 follow-up) | batch-13 disclosure | 14b+ |
| G3 | #69 live.jsonl blind to one-shot session events (tool side works — leverage it) | D8 + delta-1 feat | p2 landed the tool-side exit finalize (D18 closed); the app-side session events remain Phase 2+ |
| G4 | page-gate ruler: is 2000B the right bar? (1780B real page failed it) | madruga-2 big-pickle | Phase 3 measures with declared ruler |
| G5 | browser automation path for Athena's click needs inventory (CDP? playwright?) | Phase 6 prep | Phase 6 |
| G6 | no docs/callimachus/ library structure exists yet | Phase 5 scaffold | Phase 5 |
| G7 | no fixture can drive the COMPILED dist tools standalone (the plugin SDK resolves only inside the opencode host; fixtures shim the host boundary at source level) | dispatch-spine.test.mjs shim | narrowed in p2: the postcompile artifact-sync keeps shipped src/lib artifacts compile-verified (the stale-artifact class is dead); a true host-mode probe remains future work |
| G8 | the sync-map read path is disk-truth (no cache) — fine at current scale, but a very large map would want an index; also no retention/compaction policy yet for sync-map.json | atlas-sync.ts loadState (p2) | measure first (Phase 4/5), then decide |
