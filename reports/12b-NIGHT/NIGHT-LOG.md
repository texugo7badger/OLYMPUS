# NIGHT-LOG — BATCH 12b-NIGHT (crash-recovery state)

Format: `phase | status | commit | next`. Append after every phase.

## 2026-10-03T07:3xZ — Phase 0 (in progress)

- phase 0 | IN PROGRESS | (none yet) | registry fix commit + reports commit pending
- git verified: `main@2bab1b3`, origin/main..main = 0, tree clean after restoring pre-existing `opencode.json` damage (architect entry removed by prior session tooling — entry restored to committed state).
- Registry audit result: 118 registry names, 118 on-disk, 117 committed; `artemis/secrets_scanner.txt` swallowed by `.gitignore:26 *secrets*`. Phantom doc names: verifier-code, sast-scanner, mlops-engineer.
- 12a NOTE-2 reconciled: `demigod resolution: 118 names` (on-disk) vs 117 committed — gitignore is root cause.
- Branch `night/12b-overnight` created from `2bab1b3`.
- Orphan probe server (PID 795152, started by prior session's harness) adopted into `/tmp/olympus-probe-server.pid` for end-of-run stop.
