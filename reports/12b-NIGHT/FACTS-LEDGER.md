# FACTS LEDGER — BATCH 12b-NIGHT

Every claim intended for the final report needs a line here: `claim | proving command | one-line output`.
Raw values quoted verbatim. No ledger entry → no claim.

## Phase 0 — bootstrap + registry audit

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| P0-1 | base is main@2bab1b3, in sync with origin | `git log --oneline -1` + `git rev-list --count origin/main..main` | `2bab1b3 feat(telemetry): classification x dispatch agreement metric` / `0` |
| P0-2 | working tree had one pre-existing mod: opencode.json with architect entry removed | `git diff opencode.json` (pre-restore) | `-"architect": { "mode": "subagent", ... architect.txt }` (removal hunk, 5 lines) |
| P0-3 | architect prompt file exists → removal was tooling damage, restore justified | `ls .opencode/prompts/agents/demigods/apollo/` | `architect.txt` present |
| P0-4 | registry declares 118 demigods | `node -e` over `opencode.demigods.json` | `"_meta": {"total":118, "gods":{"apollo":8,...}}`, `registry entries: 118` |
| P0-5 | committed prompt files = 117 | `git ls-files .opencode/prompts/agents/demigods \| wc -l` | `117` |
| P0-6 | on-disk prompt files = 118 | `find .opencode/prompts/agents/demigods -name '*.txt' \| wc -l` | `118` |
| P0-7 | the only on-disk-but-uncommitted file is artemis/secrets_scanner.txt | `diff <(git ls-files ...) <(find ...)` | `15a16 > .opencode/prompts/agents/demigods/artemis/secrets_scanner.txt` |
| P0-8 | it is uncommitted because gitignore line 26 matches it | `git check-ignore -v .opencode/prompts/agents/demigods/artemis/secrets_scanner.txt` | `.gitignore:26:*secrets* .opencode/.../secrets_scanner.txt` |
| P0-9 | 12a "118 names resolve" reproduced on-disk | `node scripts/agreement-metric.mjs ~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl` | `# demigod resolution: 118 names from ...demigods` |
| P0-10 | phantom doc names not in registry: verifier-code, sast-scanner, mlops-engineer | `grep -n "verifier-code\|sast-scanner\|mlops-engineer" .opencode/olympus/tools/*.ts` | matches in dispatch.ts:47,295,302,361; shortcircuit.ts:17,42; sub-agent-instinct-query.ts:129,133 |
| P0-11 | branch created from 2bab1b3 | `git checkout -b night/12b-overnight` | `Switched to a new branch 'night/12b-overnight'` |
| P0-12 | orphan probe server adopted (PID 795152, prior session's harness) | `ps -o pid,lstart,cmd -p 795152` + log check | `Sat Oct 3 02:15:10 2026 node .../next dev -p 3737`; log file = `/tmp/olympus-probe-server.log` |
