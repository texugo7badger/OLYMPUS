# AIME manual bench — runbook and latest measured run

> v0.0.59 · 2026-11-03. AIME is the real project that stress-tests the walk:
> a Next.js 16 app with Prisma/SQLite, 41 planned hops across 10 gods.
> This page is the bench record; it never claims a hop that did not verify.

## Latest measured state (2026-11-03, 10:00Z)

| Surface | State |
|---|---|
| OLYMPUS | **v0.0.58** (v0.0.59 in flight at writing) |
| AIME lane | `/home/texugo/OLYMPUS-VAULT/02_Projects/aime` |
| Plan | 41 hops, acyclic refs, artifacts declared |
| Campaign | `cmp_mw0o2vm7cqf5mi` |
| Hop state | **31/41 completed**, 1 in flight (`bg3-ambient-mount`), 0 parked |
| DB (read-only) | **227 works · 193 relations · 3 users · 23 library entries · 25 metrics** |
| Deck contract | `swipe-deck.tsx` contains `data-direction`; `aime-card.tsx` contains `onPointerDown`; `flip-card.tsx` contains `aria-expanded` |
| Dev server | the lane's own; the walk never claims a server it did not probe |
| Backups | every destructive hop copies `prisma/dev.db` to `.olympus-backups/<ts>/` |

### The resume that produced this state

- The 60-minute budget stopped the first pass at 29/41. The walk launched
  `k2-hd-covers` and `ft2-featured-rail` 11 seconds before the deadline; both
  were ceiling-killed. **v0.0.59 adds a 150-second launch floor** so that
  cannot repeat.
- The resume started a fresh campaign at 12:31Z. It completed `ft2`, `k2`,
  `f2`, `deepl-2` and continued; the two hops that parked in the first pass
  came back green on the second.
- Measured hop durations (new wave): `ft1` 4.8 min · `deepl` 9.7 min ·
  `ft3` ~19 min · `c1` 24.6 min · `m3` 27.9 min · `p6` 29.4 min (under the
  30-minute cap). The UI-heavy hops remain the long pole.

## Preflight

```bash
cd /home/texugo/Projects/olympus
node scripts/bench-preflight.mjs          # human summary
node scripts/bench-preflight.mjs --json   # machine-readable
```

Expected: **GO with warnings** when the app or the lane's preview server is
not running; no red means the lane is structurally ready. A stale `inFlight`
record is pruned on resume, never silently completed.

## Resume the campaign

```bash
# from the app: send a prompt on the aime project, or use the runner
npx tsx scripts/walk-aime.ts   # local runner (not committed)
```

Or with hibernation (the night contract):

```bash
curl -X POST http://127.0.0.1:3737/api/olympus/power/hibernate-plan \
  -H 'Content-Type: application/json' \
  -d '{"hours":8,"autoResume":true}'
```

The walker honors the plan's window (up to 24h), clips every hop, and
auto-resumes parks within the remaining time (hard-capped at 120 attempts).

## Evidence, per hop

`npm run campaign:report -- --slug aime` writes
`~/Documents/OLYMPUS-plan/campaign-report-aime.md`:

- per-hop duration, input/output tokens, output tok/s, tool calls, joined cost;
- per-god median/p90 and the slowest hops;
- parks with their named cause.

The default view is **this campaign**; `--all` keeps every historical plan
that shared the telemetry file.

## The verification contract that matters

A hop is green only when its deterministic verify passes (`file-exists`,
`file-contains`, `file-omits`, `build`, `lint`, `design-score`). A hop that
wrote the right file but never imported it is **not** proven mounted; that
class is tracked as issue #308 and is not claimed here.

## Honest limits

- The 8-hour / 100-hop certification has not run. This bench covers 41 hops
  across two budget windows, not 100.
- Token rows can be null when the transport did not capture them; null is
  shown as `—`, never as zero.
- Cost joins are best-effort; the provider invoice is unknown on the GO plan.
- The AIME project has no git remote, so the mobile git card reads "no remote
  yet" — that is the truth, not a bug.
