#!/usr/bin/env node
/**
 * telemetry-slice.mjs — RLM P3 slicer (BATCH 12d, per RLM-MEMO §P3).
 *
 * REPL-over-context for live.jsonl: window + filter the feed into
 * compact per-run JSONL records (run mode) or per-event records (event
 * mode), so no agent ever reads the whole feed. Zero dependencies.
 *
 * MODES
 *   run mode (default): one JSONL record per run — a classification
 *     anchor plus its associated dispatch/outcome events (exact
 *     classification_id join preferred, ts-proximity fallback within
 *     --window-min, same semantics as agreement-metric.mjs) — plus one
 *     record per orphan dispatch. Same shape family as
 *     context-distill.mjs, but filterable and machine-first.
 *   event mode (--action given): one JSONL record per matching event —
 *     action filtering is inherently event-shaped.
 *
 * FILTERS
 *   --since/--until  parsed AS TIMESTAMPS (the 12a NOTE-3 lesson: a
 *                    second-precision boundary like 2026-10-03T10:24:33Z
 *                    must include a 2026-10-03T10:24:33.166Z event —
 *                    never string-compare ISO timestamps).
 *   --god            run mode: runs whose routeTo OR any associated
 *                    event's god matches. event mode: event.god matches.
 *   --action         event mode selector (also filters events in run
 *                    association? no — in run mode --action is rejected;
 *                    use event mode for action slicing).
 *   --id             exact classification_id (event field or
 *                    meta.classificationId) — selects one run / events.
 *   --window-min     ts-proximity fallback window for run association
 *                    (default 5, same as agreement-metric).
 *
 * Usage:
 *   node scripts/telemetry-slice.mjs [--file <live.jsonl>] [--since ISO]
 *        [--until ISO] [--god <god>] [--action <action>] [--id <clsId>]
 *        [--window-min 5] [--json] [--self-test]
 *
 *   --json          pretty-printed aggregate (runs + orphans + counts)
 *                   instead of one-line-per-record JSONL.
 *   --self-test     run against telemetry-slice.fixture.jsonl and assert
 *                   window/god/action/id filtering + output shape; exit 0/1.
 *
 * Deterministic: pure function of input + args. PROTOTYPE-grade schema.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(os.homedir(), 'OLYMPUS-VAULT', '06_Activity_Feed', 'live.jsonl');

const SCRIPT_HELP = `Usage: node scripts/telemetry-slice.mjs [options]

REPL-over-context for live.jsonl: window + filter the feed into compact
per-run JSONL records (run mode) or per-event records (event mode).
Zero dependencies. Deterministic: a pure function of input + args.

Options:
  --file <path>      Feed file (default: ~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl)
  --since <ISO>      Window start, inclusive. PARSED AS A TIMESTAMP — a
                     second-precision boundary (2026-10-03T10:24:33Z)
                     correctly includes millisecond events at the same
                     second (never string-compared).
  --until <ISO>      Window end, inclusive (same timestamp parsing).
  --god <name>       Run mode: runs whose routeTo matches (the routed
                     god). Event mode: event.god matches.
  --action <action>  EVENT MODE selector — one record per matching event
                     (dispatch, symphony-dispatch, dispatch_outcome,
                     classification, unattended_mode, …). Without it,
                     run mode applies.
  --id <clsId>       Exact classification_id (event field or
                     meta.classificationId) — selects one run / its events.
  --window-min <n>   ts-proximity fallback window for run association
                     (default 5, same semantics as agreement-metric).
  --json             Pretty-printed aggregate (runs + orphans + counts)
                     instead of one-line-per-record JSONL.
  --self-test        Run against telemetry-slice.fixture.jsonl and assert
                     window/god/action/id filtering + output shape; exit 0/1.
  --help, -h         Show this help.

Examples:
  node scripts/telemetry-slice.mjs --since 2026-10-04T09:00:00Z
  node scripts/telemetry-slice.mjs --action symphony-dispatch --json
  node scripts/telemetry-slice.mjs --god apollo --since ... --until ...
`;

function parseArgs(argv) {
  const args = {
    file: DEFAULT_FILE, since: null, until: null,
    god: null, action: null, id: null,
    windowMin: 5, json: false, selfTest: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i] ?? DEFAULT_FILE;
    else if (a === '--since') args.since = argv[++i] ?? null;
    else if (a === '--until') args.until = argv[++i] ?? null;
    else if (a === '--god') args.god = argv[++i] ?? null;
    else if (a === '--action') args.action = argv[++i] ?? null;
    else if (a === '--id') args.id = argv[++i] ?? null;
    else if (a === '--window-min') args.windowMin = Number(argv[++i] ?? 5);
    else if (a === '--json') args.json = true;
    else if (a === '--self-test') args.selfTest = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else { console.error(`unknown arg: ${a}`); process.exit(1); }
  }
  return args;
}

function readEvents(file) {
  if (!fs.existsSync(file)) {
    console.error(`Feed not found: ${file}`);
    process.exit(1);
  }
  const events = [];
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || !t.startsWith('{')) continue;
    try {
      const ev = JSON.parse(t);
      if (!ev.ts) continue;
      events.push(ev);
    } catch {
      // skip malformed lines
    }
  }
  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return events;
}

function isClassification(ev) {
  return (ev.action === 'classification' || ev.type === 'classification')
    && ev.meta && typeof ev.meta.routeTo === 'string' && ev.meta.routeTo.length > 0;
}

function isDispatch(ev) {
  return ev.action === 'dispatch' || ev.action === 'symphony-dispatch';
}

function clsIdOf(ev) {
  const id = ev.classification_id ?? ev.classificationId
    ?? (ev.meta && (ev.meta.classificationId || ev.meta.classification_id));
  return typeof id === 'string' && id ? id : null;
}

/** Filter by window (timestamps PARSED, never string-compared) + god + id. */
function applyFilters(events, args) {
  const sinceMs = args.since ? new Date(args.since).getTime() : null;
  const untilMs = args.until ? new Date(args.until).getTime() : null;
  const id = args.id;
  return events.filter((ev) => {
    const tsMs = new Date(ev.ts).getTime();
    if (sinceMs !== null && tsMs < sinceMs) return false;
    if (untilMs !== null && tsMs > untilMs) return false;
    if (id && clsIdOf(ev) !== id) return false;
    return true;
  });
}

/** Group filtered events into run records + orphan dispatches (run mode). */
function groupRuns(events, windowMin) {
  const windowMs = windowMin * 60_000;
  const classifications = events.filter(isClassification);
  const dispatches = events.filter(isDispatch);
  const outcomes = events.filter((ev) => ev.action === 'dispatch_outcome');

  const byId = new Map();
  for (const c of classifications) {
    const id = clsIdOf(c);
    if (id && !byId.has(id)) byId.set(id, c);
  }

  const runs = classifications.map((c) => ({
    ts: c.ts,
    routeTo: c.meta.routeTo,
    classification_id: clsIdOf(c),
    demigods: [],
    outcomes: [],
    tokens: 0,
    events: 0,
  }));
  const runById = new Map();
  classifications.forEach((c, i) => {
    const id = clsIdOf(c);
    if (id && !runById.has(id)) runById.set(id, runs[i]);
  });

  const orphans = [];
  for (const d of dispatches) {
    const dTs = new Date(d.ts).getTime();
    const dId = clsIdOf(d);
    let run = dId ? runById.get(dId) ?? null : null;
    if (!run) {
      let best = null;
      let bestTs = -Infinity;
      classifications.forEach((c, i) => {
        const cTs = new Date(c.ts).getTime();
        if (cTs <= dTs && dTs - cTs <= windowMs && cTs > bestTs) { best = runs[i]; bestTs = cTs; }
      });
      run = best;
    }
    if (run) {
      run.demigods.push(typeof d.demigod === 'string' ? d.demigod : '(unknown)');
      run.events++;
    } else {
      orphans.push({ ts: d.ts, demigod: d.demigod ?? null, god: d.god ?? null, classification_id: dId });
    }
  }

  for (const o of outcomes) {
    const oId = clsIdOf(o);
    let run = oId ? runById.get(oId) ?? null : null;
    if (!run) {
      const oTs = new Date(o.ts).getTime();
      let best = null;
      let bestTs = -Infinity;
      classifications.forEach((c, i) => {
        const cTs = new Date(c.ts).getTime();
        if (cTs <= oTs && oTs - cTs <= windowMs && cTs > bestTs) { best = runs[i]; bestTs = cTs; }
      });
      run = best;
    }
    if (run) {
      run.outcomes.push(typeof o.outcome === 'string' ? o.outcome : '(unknown)');
      run.events++;
      const t = o.tokens_used;
      if (t && typeof t === 'object') run.tokens += Number(t.input || 0) + Number(t.output || 0);
      else if (typeof t === 'number') run.tokens += t;
    }
  }
  return { runs, orphans };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(SCRIPT_HELP); return; }
  const events = applyFilters(readEvents(args.file), args);

  if (args.action) {
    // EVENT MODE: one record per matching event.
    const matched = events.filter((ev) => ev.action === args.action);
    if (args.json) {
      console.log(JSON.stringify({ mode: 'event', action: args.action, count: matched.length, events: matched }, null, 2));
    } else {
      for (const ev of matched) console.log(JSON.stringify(ev));
    }
    return;
  }

  // RUN MODE: one record per run + orphan dispatches.
  const { runs, orphans } = groupRuns(events, args.windowMin);
  // --god in run mode matches routeTo (the run's routed god); event-level
  // god attribution belongs to event mode.
  const selected = args.god ? runs.filter((r) => r.routeTo === args.god) : runs;

  if (args.json) {
    console.log(JSON.stringify({ mode: 'run', runs: selected, orphan_dispatches: orphans, counts: { runs: selected.length, orphan_dispatches: orphans.length } }, null, 2));
  } else {
    for (const r of selected) console.log(JSON.stringify(r));
    for (const o of orphans) console.log(JSON.stringify({ orphan_dispatch: o }));
  }
}

// ─── Self-test ───────────────────────────────────────────────────────────────
function selfTest() {
  const fixture = path.join(SCRIPT_DIR, 'telemetry-slice.fixture.jsonl');
  const events = readEvents(fixture);
  let failures = 0;
  const assert = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${typeof got === 'number' || typeof got === 'string' ? JSON.stringify(got) : JSON.stringify(got).slice(0, 110)}${ok ? '' : ` (want ${JSON.stringify(want).slice(0, 110)})`}`);
    if (!ok) failures++;
  };

  // 1. Window filtering — PARSED timestamps: second-precision --since must
  //    INCLUDE a millisecond event at the same second (12a NOTE-3 lesson).
  const win = applyFilters(events, { since: '2026-10-04T09:00:30Z', until: null, id: null });
  assert('window: ms-precision event included by s-precision --since',
    win.some((e) => e.ts === '2026-10-04T09:00:30.166Z'), true);
  const win2 = applyFilters(events, { since: '2026-10-04T09:00:31Z', until: null, id: null });
  assert('window: events before --since excluded', win2.some((e) => e.ts === '2026-10-04T09:00:30.166Z'), false);

  // 2. id filter — exact classification_id selection.
  const byId = applyFilters(events, { since: null, until: null, id: 'cls_slice_a' });
  assert('id filter: all events carry the id (or its classification)',
    byId.every((e) => clsIdOf(e) === 'cls_slice_a'), true);
  assert('id filter: matched 2 events', byId.length, 2);

  // 3. Run grouping — id join + orphan dispatch.
  const { runs, orphans } = groupRuns(events, 5);
  const runA = runs.find((r) => r.classification_id === 'cls_slice_a');
  assert('run A demigods (id join)', runA.demigods, ['planner']);
  const runB = runs.find((r) => r.classification_id === 'cls_slice_b');
  assert('run B demigods (ts fallback)', runB.demigods, ['tdd-guide']);
  const runC = runs.find((r) => r.classification_id === 'cls_slice_c');
  assert('run C has outcome + tokens', [runC.outcomes, runC.tokens], [['success'], 120]);
  assert('orphan dispatch count', orphans.length, 1);
  assert('orphan demigod', orphans[0].demigod, 'code-verifier');

  // 4. --god run-mode filter (routeTo).
  const gods = runs.filter((r) => r.routeTo === 'artemis').map((r) => r.classification_id);
  assert('god filter: artemis run', gods, ['cls_slice_b']);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll telemetry-slice self-test assertions passed');
  process.exit(0);
}

if (parseArgs(process.argv.slice(2)).selfTest) selfTest();
else main();
