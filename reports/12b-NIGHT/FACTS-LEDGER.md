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

## Phase 2 — #51 unattended-mode bypass

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| P2-1 | the hard-gate lives in the prompt layer (skill file) | `read .opencode/skills/superpowers/brainstorming/SKILL.md:12-14` | `<HARD-GATE> Do NOT invoke any implementation skill … until … the user has approved it` |
| P2-2 | probe A (attended) stalls at the gate, verbatim | one-shot session ses_efee90565ffedT0fjwkPnFPyK3 via serve /message query | "First clarifying question (one at a time, per the process): **Where should this testimonial section live?** … A) Standalone … B) React/TSX … C) HTML/CSS snippet", `finish: stop` |
| P2-3 | probe B5 (unattended) overrides the gate, verbatim | SSE capture /tmp/opencode/probe-2B5.sse | "The brainstorming skill's HARD-GATE (interview + user approval) is explicitly overridden by the unattended directive — I'll satisfy each gate myself and record the decisions" |
| P2-4 | unattended telemetry event fires with in-band source | `grep unattended_mode live.jsonl` | `{"ts":"2026-10-03T09:47:34.879Z",…,"action":"unattended_mode","msg":"…session ses_efed691bdffei7UVlP10DAqqvV…","meta":{"source":"in-band marker"}}` |
| P2-5 | session.created never fires for one-shot runs (env branch = dead in practice) | `grep -c session_start live.jsonl` → `1` (event dated 2026-07-31, different shape) + manual one-shot with OLYMPUS_UNATTENDED=1 wrote no event | `1` |
| P2-6 | probeServer 401 early-return made warm adoption impossible → fixed | `git show 240be87` | `fix(opencode-session): probeServer 401 early-return blocked warm-serve adoption (#57)` |
| P2-7 | after the fix the warm path round-trips | warmcheck2 POST SSE | `▶ dispatching to warm session 69zgBkrj (apollo)` → `text "ready"` → `action_done` (no 401, no one-shot) |
| P2-8 | opencode-go gateway hangs from spawned processes tonight; nvidia/z-ai/glm-5.3 works | direct serve message tests | opencode-go default → hang >300s; `nvidia/z-ai/glm-5.3` → `200, took 8s, text "pong", finish "stop"` |
| P2-9 | nvidia/z-ai/glm-5.3-flash and glm-5.2 are broken/stale tonight | direct serve message tests | flash → hangs >90s ×2; glm-5.2 → `ProviderModelNotFoundError: Model not found: nvidia/z-ai/glm-5.2. Did you mean: z-ai/glm-5.3, z-ai/glm-5.3-flash, baai/bge-m3?` |
| P2-10 | strategy context block shows free-openrouter while models run on nvidia (activeStrategyId reads llm-providers.json first) | `read src/lib/opencode-session.ts:95-105` | `for (const file of [PROVIDERS_FILE, …active-strategy.json])` — user's declared strategy wins over last-applied |
| P2-11 | #51 closed with A/B evidence | `gh issue close 51` | `✓ Closed issue texugo7badger/OLYMPUS#51` |
| P2-12 | issues #57 and #58 filed (pre-existing infra breakages found during probe work) | `gh issue create` ×2 | `…/issues/57`, `…/issues/58` |
| P2-13 | probe A5 one-shot completed in ~105s; B1/B2 one-shots died at exactly 120s (firstEventAt never wired on fallback path) | SSE captures probe-2A5/B/B2 + opencode.log | `ERROR: OpenCode produced no output within 120s` while the process was alive (unattended event at t+80s) |

## Phase 3 — #54 classification join key

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| P3-1 | classificationId minted + carried in env payload automatically | `git show c381801 --stat` | 9 files, +260/−23; `task-classifier.ts` interface + mint |
| P3-2 | fixture self-test green (25 assertions, exit 0) | `node scripts/agreement-metric.test.mjs` | `All fixture assertions passed` / `TEST EXIT: 0` |
| P3-3 | one-shot path: classification + dispatch share id; metric joins by id | metric `--since 2026-10-03T10:14:00Z --json` | `id_joined_pairs: 1`; PAIR `"join":"id","classification_id":"cls_mus8ixsyzo7e9q"` |
| P3-4 | warm path: classification + dispatch share id; metric joins by id | metric `--since 2026-10-03T10:24:33Z --json` | `id_joined_pairs: 1`; PAIR `"join":"id","classification_id":"cls_mus8w7tapy5xp0"` |
| P3-5 | live classification event carries meta.classificationId | grep feed | `2026-10-03T10:24:33.166Z \| classification \| system \| cls_mus8w7tapy5xp0` |
| P3-6 | live warm dispatch event carries classification_id | grep feed | `2026-10-03T10:24:37.050Z \| symphony-dispatch \| apollo \| cls_mus8w7tapy5xp0` |
| P3-7 | --since second-precision bug found live + fixed (1780c34) | metric before fix: `classifications: 0` vs after: `classifications: 1` | boundary at 10:24:33Z excluded the 10:24:33.166Z event on string compare |
| P3-8 | "apollo" keyword collides with graphql stack → real measurable mismatch | `npx tsx` classifyTask on probe text | `routeTo: hermes \| domain: integrations \| stacks=[graphql]` |
| P3-9 | #54 commented with evidence (not closed) | `gh issue comment 54` | `…issues/54#issuecomment-5968273124` |
| P3-10 | probe-harness stop never killed the real next-server (wrapper-vs-child) — the 05:35 dev server served ALL evening while newer starts landed on 3738 | `ss -tlnp \| grep 3737` after 4 harness stop/start cycles | `next-server (v1, pid=862427 … STARTED Sat Oct 3 05:35:02)` |
| P3-11 | after killing the real next-server and restarting once, warm session creation works (no 401, no one-shot) | adoptcheck2 SSE | `▶ dispatching to warm session vs39fnuQ (apollo)` → text `adopted2` → action_done |
| P3-12 | warm-path dispatch-forced probe runs clean (dispatch tool → DONE) | probe-54warm.sse | `tool.call/tool.response olympus-dispatch` → `TEXT: DONE` → `action_done` |
