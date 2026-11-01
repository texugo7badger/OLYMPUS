# AIME manual bench — runbook (v0.0.30 / v0.0.31)

This is the handoff for the next manual AIME test. It separates the
**v0.0.30 truth smoke** (can run now) from the **v0.0.31 final bench**
(the smooth run with per-god chats, streamed progress, visual/login gates and
the preview magic wand).

The measured baseline and the full backlog are in
[`reports/audit-2026-10-31/REPORT.md`](reports/audit-2026-10-31/REPORT.md)
and [`docs/plans/v0.0.30-truth-first.md`](docs/plans/v0.0.30-truth-first.md).

## Current state (2026-11-01, after the v0.0.30 release)

| Surface | State |
|---|---|
| OLYMPUS | **v0.0.30** (tag/release published) |
| AIME lane | `/home/texugo/OLYMPUS-VAULT/02_Projects/aime` |
| Plan | 42 hops, acyclic refs, artifacts declared |
| Hop state | **9/42 completed**, 2 stale inFlight (`d3-media`, `g2-profile`) from the dead 23:12 walk, no parked |
| Next hop | **`d5-data-restore`** |
| DB | **works 12 · users 4 · library 12 · relations 2** (the deterministic `db:seed`; the d5 hop must reach **120+ works**) |
| Dev server :3038 | **not running** — start it from the OLYMPUS preview manager |
| `scripts/catalog-sync.sh` | defaults to **:3038** (fixed; was :3000) |
| DB backups | none yet; v0.0.30 creates `.olympus-backups/<ts>/` before a destructive hop |
| MCP default | 6 curated / 44 tools; a campaign manifest filters the lane to the plan's 4 + baseline |

## Preflight (before every bench)

```bash
cd /home/texugo/Projects/olympus
node scripts/bench-preflight.mjs
# machine-readable:
node scripts/bench-preflight.mjs --json
```

Expected now: **GO with warnings** — app and :3038 are not running, the DB is
12 works (seed), and the two stale inFlight records will be marked **LOST** and
pruned on resume. No red means the lane is structurally ready.

## Phase A — v0.0.30 truth smoke (run now, ~30–60 min)

Purpose: prove the v0.0.30 fixes on the real AIME lane **without** walking all
42 hops. This is the regression bench for the truth layer.

1. **Install/launch v0.0.30** (release asset
   `OLYMPUS-0.0.30-linux-x86_64.AppImage`) or run the repo app. Do not use the
   old 0.0.29 process.
2. **Open the AIME project** in the Project Switcher. Start the live preview
   from the panel's **Start** (the manager owns **:3038**; never start a second
   `npm run dev`).
3. **UI truth checks** (screenshots welcome):
   - `ctx` shows a real percentage or **—**, never a fixed 0%.
   - Cost shows **step cost** and **list value** separately; no “$12/5h”
     aggregate burn.
   - MCP panel default: 6 enabled / 44 tools; no enabled-but-dead row.
   - Campaign: **9/42**, next hop `d5-data-restore`; the two old inFlight
     records show **LOST**, not “running”; no negative ETA.
4. **Login checks** (the seed is restored):
   | Account | Password | Expected |
   |---|---|---|
   | `admin@aime.local` | `aime-admin-2026` | `/admin` works |
   | `user@aime.local` | `aime-demo-2026` | library/deck works |
   | `novo@aime.local` | `aime-demo-2026` | onboarding pending |
5. **Data restore**: send the resume prompt in the Apollo chat:
   > continue da onde parou — execute o d5-data-restore e pare no próximo hop.
   The d5 hop runs the bounded catalog batches against **:3038**, then
   `npm run db:seed`. Acceptance:
   - `works >= 120`, `users = 3 demo + the stray`, `library_entries > 0`,
     `work_relations > 0`;
   - `docs/data-restore.md` exists with the batch bodies and final counts;
   - `docs/catalog-report.json` and `docs/media-report.json` are refreshed.
   If the hop parks, capture the park reason and the last 40 lines of the hop
   output; do **not** run `db:reset` or `prisma db push`.
6. **Backup proof**: before any later hop whose prompt mentions a destructive
   Prisma command, the runner must create `.olympus-backups/<ts>/` with the
   SQLite copy + `manifest.json`. Check the directory after `g2-profile`.
7. **Stop** after d5 (or after the next 1–2 small hops). Send:
   > pare a campanha e escreva o relatório do bench.

### Phase A acceptance

- [ ] App v0.0.30, AIME preview on :3038, login works for all three accounts.
- [ ] `ctx`, cost, MCP and campaign truth match the checks above.
- [ ] `d5-data-restore` reaches 120+ works and writes its report.
- [ ] A destructive hop produces a DB backup (or parks with a typed denial).
- [ ] No false “running”, no negative ETA, no 0% ctx.

Expected rough edges in v0.0.30: if the app restarts mid-walk, the campaign is
orphaned (H1); hop output is not streamed live (H7); the visual/login gate is
not automatic (H10); there are no per-god chats or magic wand (F1/E1/E2).
Those are **v0.0.31**.

## Phase B — v0.0.31 final AIME bench (after the next release)

Wait for the v0.0.31 items: **H1** detached supervisor/auto-resume, **H7**
streamed hop output, **H10** visual/login gate, **H11** build gate, **H12**
one server per lane, **H15** mounted/used check, **F1** per-god chats,
**E1/E2** webview + element picker. Then:

1. Preflight green.
2. Resume the campaign (31 pending hops; the completed 9 are kept).
3. Use the per-god chats to watch Athena/Hephaestus/Persephone; click a hop in
   Recent Activity to see the real recipe (skill, MCP, demigod, model, verify,
   build, tokens, cost).
4. Use the preview magic wand: click a component, type the change, see it in
   Athena's chat/queue; navigate back/forward; reload.
5. The visual gate must fail a hop that ships `opacity:0` or a dead login.
6. Capture the same evidence set; we run the post-bench audit.

### Evidence to send for the audit

- `node scripts/bench-preflight.mjs --json`
- screenshots of: cost, ctx, MCP panel, campaign/Parthenon, hop detail,
  Athena chat, magic-wand prompt, login success.
- `~/.olympus/hop-events.jsonl`
- `~/OLYMPUS-VAULT/02_Projects/aime/.olympus-hop-telemetry.jsonl`
- `~/OLYMPUS-VAULT/02_Projects/aime/.olympus-hop-state.json`
- `~/.olympus/metrics/cost.jsonl` (the window)
- `~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl`
- the zipped `.olympus-backups/` listing (not the DBs, unless requested).

## Safety rules

- **Never** run `prisma migrate reset`, `npm run db:reset`, `prisma db push`,
  `rm prisma/dev.db`, `DROP TABLE`, `truncate`, or a DELETE/UPDATE without
  WHERE. The v0.0.30 destructive guard denies these in unattended hops and
  backs up before a destructive prompt, but the human rule still stands.
- Only one dev server on :3038; the manager owns it. A second server on :3000
  is the port-mismatch specimen.
- The DB seed (`npm run db:seed`) is safe and idempotent; it never deletes
  users and only bootstraps the catalog when it is empty.
- The 453 cover files under `media/covers/` survived the wipe; a re-ingest
  with `limitCovers: 0` should match them again.
