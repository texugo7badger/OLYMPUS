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

## Phase 1 — #50 build verification

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| P1-1 | `npx next build` on the committed tree exits 0 with type check passing | `npx next build > /tmp/opencode/build-before.log` | `✓ Compiled successfully in 54s` / `Running TypeScript ...` / `Finished TypeScript in 7.3s` / `EXIT: 0` |
| P1-2 | build log contains zero motion references or errors | `grep -iE "error\|motion" /tmp/opencode/build-before.log` | (empty output) |
| P1-3 | motion files referenced by #50 do not exist in the tree | `find . -name "use-reduced-motion*" -o -name "motion-config*" -o -name "motion-tokens*"` (excl. node_modules) | (no results; `src/hooks/` has only `use-mobile.ts`, `use-toast.ts`) |
| P1-4 | motion files were NEVER committed on any branch | `git log --all --oneline -- '*use-reduced-motion*' '*motion-config*' '*motion-tokens*'` | (empty) |
| P1-5 | neither `motion` nor `framer-motion` is a dependency | `node -e` over package.json | `motion: ABSENT` / `framer-motion: ABSENT` |
| P1-6 | issue #50 filed at 2026-10-03T02:47:34Z (before tree-audit, against uncommitted WIP state) | `gh issue view 50 --json createdAt -q .createdAt` | `2026-10-03T02:47:34Z` |
| P1-7 | full code pipeline exits 0 | `npm run build:app` → /tmp/opencode/build-app-after.log | `✓ Compiled successfully in 43s` / `Finished TypeScript in 7.1s` / `[electron-postcompile] wrote ...` / `EXIT: 0` |
| P1-8 | electron tsconfig cannot produce the reported errors (includes only electron/**/*.ts) | `grep include electron/tsconfig.json` | `"include": ["./**/*.ts"]` under electron/ |
| P1-9 | #50 closed with the evidence comment | `gh issue close 50 --comment ...` | `✓ Closed issue texugo7badger/OLYMPUS#50` |
| P1-10 | first full `npm run build` attempt was killed by MY tool timeout mid-deb-packaging (not a failure) | tail of /tmp/opencode/build-after.log | `building target=deb ...` then shell timeout at 900000ms; `grep -cE "error\|Error"` → `0` |
