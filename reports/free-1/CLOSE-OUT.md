# MADRUGA-FREE-1 — CLOSE-OUT (the distributed pantheon night)

> The durable close-out packet, WRITTEN TO DISK BEFORE the chat summary (**#101**'s rule: the chat
> message is a pointer, never the payload). The night rides at most **5 ff-only merges**
> (paper + Batch A + Batch B + Batch C conditional + close-paper), all pushed on origin/main.
> SKELETON at Stage 0 — the sections fill as the batches land.

## 0. Why this night exists

The user's UAT attempt (2026-10-08) died on `Service temporarily overloaded` — the harness
behaved correctly (#98: retry, context preserved, honest exhaustion card, zero files written),
but the STRATEGY'S SHAPE is the defect: `free-nvidia-build` pins apollo+atlas (the entry lane,
the most-loaded) on the most-contended pool (`nemotron-3-ultra-550b-a55b`), 7 other gods on a
single `z-ai/glm-5.3` pool, and callimachus+vaultLlm on a banned nemotron nano. The user's
directive: fix the free tier — the maximum of the NVIDIA free catalog with DIFFERENT model
lanes per god, sharing context through Symphony. **NO Nemotron (the user's ban: low effective
context).** Filed as **#106**. Full filing: `reports/free-1/FILING-LOG.md`.

## 1. Entry gates (all green BEFORE work — verbatim evidence)

| Gate | Verdict |
|---|---|
| E1 | `main == origin/main == 101d5c7` — the RESOLVE-1 night never landed (no IN PROGRESS row, nothing to race, no RESOLVE-1 payload); the SERVE-1 working-tree sha-fill (QUEUE row fifth sha `101d5c7` + the close-out's trail fill) is THIS session's Stage 0 payload |
| E2 | budget-guard BOTH surfaces exit 0 (LIVE 9 lanes ≥ 8192; GENERATOR table all ≥ 8192); `grep -c 'glm-5.2' opencode.json` = **0**; check-strategy-sync **9/9** exit 0 |
| E3 | open set exactly **#76 + #78–#96 + #100 + #101 = 22** (gh re-derived before any mutation); next free number **#106** — filed at Stage 0 |
| E4 | **battery-28 green on this session's OWN run**: 25 suites via npx tsx all exit 0 + context-distill 4/4 + telemetry-slice 10/10 + tsc 0. Logs: `/tmp/opencode/free-1-battery/entry/` |
| E5 | R4 live config sha256 `5534ceab9cfe160da3c5efa4a13c1e8dc8c3df6c2be0d3f0c5b65decabbd3d52` (31863 bytes) — byte-identical to the SERVE-1 baseline (the live config UNCHANGED since UAT-FIX-1: the user's failed UAT ran against exactly these bytes); snapshotted to `/tmp/opencode/free-1/opencode.json.r4-snapshot`; NEVER staged, NEVER committed |
| E6 | Only foreign processes at entry (the Zed external-agents opencode ACP PID 9193 — the user's editor runtime; stremio) — nothing touched, nothing killed; no listener on :3777 / :3015 / :3737 / :3740 |
| E7 | The worktree heal (SERVE-1's recorded finding): `/home/texugo/Projects/olympus-free-1` from `101d5c7`, node_modules hardlinked, gitignored runtime artifacts copied (`.opencode/package.json` tsx CJS mode + package-lock + both dist dirs) — the full battery green in the worktree on the first run |
| E8 | **The live probe gate GREEN with one exclusion** — `reports/free-1/s0/E8-LIVE-MODEL-VERIFICATION.md`: 80 models live TODAY; all 5 anchors PRESENT; pings: glm-5.3 200/834ms, glm-5.3-flash 200 (one slow ping 32,367ms — recorded), kimi-k3 200/1,181ms ("OK"), muse-glimmer-30b 200/1,963ms; **deepseek-v4.1-flash DEAD ×3 (60s/90,335ms/90,364ms timeouts) — EXCLUDED, disclosed**; honest context windows per live model card (kimi-k3 1,048,576; muse-glimmer-30b 131,072 — NOT inflated) |

## 2. The distribution (the final anchor table — adjustments disclosed)

SEE BATCH A — this section fills at the Batch A merge with the FINAL table, every adjustment
from the directive's default disclosed with role-fit reasoning (the deepseek exclusion forces
apollo + hermes reassignments; the three heavy paths stay on three distinct pools; the flash
lane stays the volume lane; ≤3 gods per anchor; zero nemotron anywhere).

## 3. The work — the merge trail

- [ ] Stage 0 paper — the filing (#106) + tonight's IN PROGRESS QUEUE row + the SERVE-1
      rolling sha-fill + `reports/free-1/` (FILING-LOG + this skeleton + the E8 record)
- [ ] Batch A — `feat(strategies): the distributed free pantheon — per-god model lanes, no
      single pool, no nemotron…` (RED-first doctrine suite → the cure in model-strategies.ts +
      apply-strategy.js → the sanctioned apply → the new R4 baseline → the live proofs)
- [ ] Batch B — `fix(scripts): the refresh anchor-pin — the free-model scorer serves the
      distribution, never overrides it…`
- [ ] Batch C — conditional docs (MODEL-STRATEGIES.md / TOKEN-ECONOMY.md / AGENTS.md)
- [ ] Stage E — this close-out complete + the QUEUE DONE row + #106 closed with sha evidence

## 4. STATE AT END

(fills at close)

## 5. Taxonomy check

- `#106 feat(free-tier): … [enhancement, free-tier, harness]` — on-pattern at filing; the
  close comment carries the merge sha + the suite evidence.
