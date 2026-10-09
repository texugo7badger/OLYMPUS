# MADRUGA-PREVIEW-2 — Entry gates (all green BEFORE work; verbatim, 2026-10-09, ~07:38Z)

| Gate | Verdict |
|---|---|
| E1 | `git fetch` clean; `main == origin/main == 960c9fc` (`960c9fc419373b57e178fd08612935de966b9eae`, the SMOKE-1 close paper); no IN PROGRESS QUEUE row from another session; nothing races. The SMOKE-1 frontier sha-fill (`960c9fc`) rides THIS session's Stage 0 (the house pattern). Working tree carries ONLY the never-staged pair (`opencode.json` R4 + the user's `reports/uat-r1/SPAWN-INVOCATION.sh` UAT edit) — foreign, untouched. |
| E2 | budget-guard BOTH surfaces exit 0 against the live R4 bytes (LIVE 10 lanes ≥ 8192 + GENERATOR 16/16); `grep -c 'glm-5\.2' opencode.json` = **0**; `node scripts/check-strategy-sync.js` = **9/9** exit 0. |
| E3 | open set re-derived via `gh issue list --state open`: exactly **24** — {76, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 100, 101, 111, 112} — the SMOKE-1 22 + #111 + #112, enumerated match, no drift. Next free number **#113**. |
| E4 | battery green on this session's OWN run, in the foreground on `main` @ `960c9fc` (the SMOKE-1 lesson applied — no backgrounded battery): **30/30 suites + tsc 0**, 31 lines `exit=0`, zero non-zero exits. Log: `/tmp/opencode/preview-2-battery/entry.log`. |
| E5 | R4 live config sha256 `4e6b35ac7611fb583cc453edef743d470f68443394fb52aa48020357e6929619` (33568 bytes) — byte-identical to the FREE-1 baseline; snapshotted to `/tmp/opencode/preview-2/opencode.json.r4-snapshot`; NEVER staged, NEVER committed. |
| E6 | Foreign processes: the user's Zed editor + its opencode ACP runtime (PIDs 21055 / 21077 / 21963) — foreign, untouched. stremio not observed at entry (disclosed). **No listener on :3777 / :3015 / :3737 / :3740** (`ss -ltn` re-derived). |
| E7 | Worktree evaluated, **not needed — the principal tree used directly** (the FLUENCY-1/SMOKE-1 pattern, disclosed): budget-guard's LIVE surface reads the working-tree config, and the R4 bytes exist ONLY in the principal tree (R4 is never committed). Explicit `git add` paths only, never `-A`. |
| E8 | **The live lane probe — ALL 5 anchors + 3 OpenRouter free lanes, WITH RESPONSE-HEADER CAPTURE** (the SMOKE-1 recipe), 2026-10-09T07:44Z (inside the off-peak window):

```
z-ai/glm-5.3                         HTTP 200 / 1.38s   (the SMOKE-1 smoke lane, serving fast)
z-ai/glm-5.3-flash                   HTTP 200 / 37.8s   (glacial — standing disclosure, volume-only under load)
moonshotai/kimi-k3                   HTTP 200 / 0.95s   (the steadiest lane, again)
meta/muse-glimmer-30b                HTTP 200 / 5.5s
deepseek-ai/deepseek-v4.1-flash      HTTP 000 / 70s     — DEAD the FOURTH consecutive night; zero god assignments in R4, disclosed
OR google/gemma-4-31b-it:free        HTTP 200 / 1.8s    (RECOVERED from last night's upstream 429 — the windows move, as advertised)
OR openai/gpt-oss-20b:free           HTTP 404           (still gone from the free pool — #78's drift class, disclosed)
OR inclusionai/ling-3.0-flash:free   HTTP 404           (same, disclosed)
```

Full verbatim transcript (headers included): `s0/e8-probe-t074445Z.txt`. **Verdict: the window is GREEN.** The deterministic work (Batch A/C) needs no window and proceeds first per plan; the optional live-hop garnish may ride this window (probe-first, never forced). |

## The seam under repair tonight (Batch A, #112) — restated from the SMOKE-1 live evidence

`devServerManager.start(slug)` derives `workspaceLaneDir()/slug` ONLY; #110's intake registers
projects at `~/OLYMPUS-VAULT/02_Projects/<slug>` (the user's pinned directive). The chosen cure
(**Option A, realized through `reconcileProjectPath`**): the manager resolves the project dir via
the #103 lane-aware truth (note alive outside the repo → the note path; lane copy → the lane;
pointing into the repo → the lane, NEVER the repo), with the legacy `workspaceLaneDir()/slug`
derivation as the fallback for note-less slugs AND a "never the bare lane root" guard (reconcile's
inside-repo/no-lane-copy answer is the lane ROOT — a spawn there would be wrong, so that answer
degrades to the legacy refusal). The never-the-repo guard stays as defense-in-depth; the refusals
for non-lane paths are preserved, pinned. The frozen pair (live-preview.tsx + its route) stays
zero-diff — the status route + claim route already exist.
