# MADRUGA-SMOKE-1 — Entry gates (all green BEFORE work; verbatim, 2026-10-09)

Session window: entered 04:51Z (01:51 BRT — US-evening peak TAIL). The timing doctrine (section 1
of the brief): probe FIRST; green → smoke immediately; red → forensics + matrix + riders FIRST,
re-probe on a cadence, smoke when the window (≈06:00–11:00Z) opens. The E8 probe at 04:55Z read
RED on the apollo anchor (glm-5.3 429) → **doctrine path B invoked** (paperwork first, smoke when
the window opens; park/wait/resume — never force, never GO; the GO valve is the user's call alone).

| Gate | Verdict |
|---|---|
| E1 | `git fetch` clean; `main == origin/main == f78fcbc` (`f78fcbc47661fa73946d408e436fc7e1cbfcadac`, the FLUENCY-1 close paper); no other session IN PROGRESS in QUEUE.md; nothing races. The FLUENCY-1 frontier sha-fill (`f78fcbc`) rides THIS session's Stage 0 (the house pattern). |
| E2 | budget-guard BOTH surfaces exit 0 against the live R4 bytes — LIVE 10 lanes ≥ 8192 (the suite's tail: `All 10 generation lanes sized >= 8192`) + GENERATOR 16/16; `grep -c 'glm-5\.2' opencode.json` = **0**; `node scripts/check-strategy-sync.js` = **9/9** exit 0 (free-big-pickle, free-nvidia-build, free-openrouter, go-balanced, go-budget, go-max-quality, zen-balanced, zen-budget, zen-max-quality). |
| E3 | open set re-derived via `gh issue list --state open`: exactly **#76 + #78–#96 + #100 + #101 = 22 rows** — the enumerated set matches the expected set precisely, no drift. #107–#110 were filed AND closed within FLUENCY-1 (verified: highest issue #110). Next free number **#111** (held — filed only if the forensics verdict is (a); section 3 of the brief). |
| E4 | battery green on this session's OWN run: **30/30 suites via `npx tsx` + tsc 0 errors** (`npx tsc --noEmit`), plain house invocation (no wrappers), in the principal tree against the live bytes. Log: `/tmp/opencode/smoke-1-battery/entry/battery.log` — 31 lines `exit=0` (30 suites + tsc), zero non-zero exits. The honest count: 30 suites (+ sync 9/9 + guard both surfaces as their own gates) = the frontier's 30, all green. |
| E5 | R4 live config sha256 `4e6b35ac7611fb583cc453edef743d470f68443394fb52aa48020357e6929619` (33568 bytes) — byte-identical to the FREE-1 baseline; snapshotted to `/tmp/opencode/smoke-1/opencode.json.r4-snapshot` (re-hashed after copy, match); NEVER staged, NEVER committed. |
| E6 | Foreign processes: the user's Zed editor + its opencode ACP runtime (PIDs 21055 / 21077 / 21963) — foreign, untouched, nothing killed. stremio NOT observed at this session's entry (it ran during FLUENCY-1's window; recorded honestly). **No listener on :3777 / :3015 / :3737 / :3740** (`ss -ltn` re-derived). The user's working-tree edit to `reports/uat-r1/SPAWN-INVOCATION.sh` — foreign, untouched, never staged (verified at close too). |
| E7 | Worktree evaluated, **not needed — the principal tree used directly** (the FLUENCY-1 pattern, disclosed): budget-guard's LIVE surface reads the working-tree config, and the R4 bytes exist ONLY in the principal tree (R4 is never committed). Per-batch branches in-tree are safe: no batch touches `opencode.json`; `git add` takes explicit paths only, never `-A`. |
| E8 | **The live lane probe — ALL 5 anchors + 3 OpenRouter free lanes, WITH RESPONSE-HEADER CAPTURE** (the Batch-B forensics requirement):

```
2026-10-09T04:55:06Z — z-ai/glm-5.3              HTTP 429 / 0.64s   {"status":429,...} — NO Retry-After, content-type: application/problem+json (burst/quota indistinguishable per headers — the forensics specimen)
2026-10-09T04:55:51Z — z-ai/glm-5.3-flash        HTTP 200 / 44.8s    (glacial but serving — the FLUENCY-1 finding-5 shape)
2026-10-09T04:55:53Z — moonshotai/kimi-k3        HTTP 200 / 1.6s     (real content: "Pong!")
2026-10-09T04:55:57Z — meta/muse-glimmer-30b     HTTP 200 / 4.0s
2026-10-09T04:56:07Z — deepseek-ai/deepseek-v4.1-flash  HTTP 000 / 70s — DEAD, the THIRD consecutive night; zero god assignments in R4, disclosed
2026-10-09T04:57:08Z — OR google/gemma-4-31b-it:free     HTTP 429 / 1.2s — RICH body: "limit_source":"upstream_provider_shared_pool" + remedy_hint (distinguishable in the BODY, still no Retry-After header)
2026-10-09T04:57:08Z — OR openai/gpt-oss-20b:free        HTTP 404 — "This model is unavailable for free" (LEFT THE FREE POOL — the #78 drift-detector shape, disclosed; free-openrouter lanes drifted, not tonight's smoke path)
2026-10-09T04:57:08Z — OR inclusionai/ling-3.0-flash:free HTTP 404 — same shape, disclosed
```

Full verbatim transcript (headers included): `s0/e8-probe-t045506Z.txt`. **Verdict: apollo's anchor lane (glm-5.3) is 429 at session start → doctrine path B: forensics + matrix + riders FIRST, re-probe on a cadence (~20 min), smoke when the window opens (expected ≈06:00Z+).** kimi-k3 (hephaestus's lane) is the strongest free lane tonight (1.6s). |

## The R1 specimen — byte-level verdict (auditor rider, disposition recorded at entry)

The auditor quoted `stacks: tml, css, javascript]` (the leading `[` eaten). Byte-level check of the
FLUENCY-1 intake-proof transcript (`reports/fluency-1/s5/intake-proof-transcript.txt:25`) and the
live note (`~/OLYMPUS-VAULT/02_Projects/fluency-smoke/project.md:6`): BOTH carry
`stacks: [html, css, javascript]` — byte-perfect, `[` and `h` intact. The writer
(`project-context.ts:314,466` — `stacks: [${stacks.join(', ')}]`) cannot produce the eaten shape;
the parser's flow-sequence branch round-trips it identically. **The specimen matches the #101
chat-tail degeneration class (free-lane tokenizer salad — chars eaten mid-stream), NOT a durable
serialization defect.** R1 lands regardless as the auditor asked: a write→read→identical
round-trip pin + the corrupted-shape loud-surface pin (the read side must not degrade a
bracket-eaten line SILENTLY). Rider R2 (card arithmetic) + R3 (hop-timeout env knob — confirmed
NOT env-tunable at entry: `walker.ts` spawns with a hard-coded `15 * 60_000`) filed as RED tests
with R1 in the same Stage-0 commit.
