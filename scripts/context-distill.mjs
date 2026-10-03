#!/usr/bin/env node
/**
 * context-distill.mjs — PROTOTYPE (BATCH 12b-NIGHT, Phase 4b).
 *
 * Reduces a live.jsonl window to ONE compressed summary line per run
 * (RLM-MEMO §2.6 / §3.5: Map-Reduce over long logs — this is a reduce
 * step; agreement-metric.mjs is the map/join seed). A "run" is a
 * classification event plus every dispatch/outcome event attributable to
 * it — by exact classification_id (Batch 12b join key, preferred) or by
 * ts-proximity (fallback, same window semantics as agreement-metric).
 *
 * Output lines (one per run + one per orphan dispatch):
 *   RUN <classification ts> routeTo=<verbatim> demigods=[a,b] outcomes=[success] tokens=<n>
 *   ORPHAN-DISPATCH <ts> demigod=<name> god=<god> (no classification in window)
 *
 * Tokens: sum of tokens_used from dispatch_outcome events attributed to
 * the run (null-safe: runs with no outcome events print tokens=0).
 *
 * Usage:
 *   node scripts/context-distill.mjs <live.jsonl> [--since ISO] [--until ISO]
 *        [--window-min 5] [--json] [--self-test]
 *
 *   --self-test  runs the reducer against agreement-metric.fixture.jsonl
 *                and asserts the expected lines; exits 0/1. Zero deps.
 *
 * Deterministic: pure function of the input file + args. PROTOTYPE —
 * schema may change without a deprecation cycle.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { positional: [], since: null, until: null, windowMin: 5, json: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') args.since = argv[++i] ?? null;
    else if (a === '--until') args.until = argv[++i] ?? null;
    else if (a === '--window-min') args.windowMin = Number(argv[++i] ?? 5);
    else if (a === '--json') args.json = true;
    else if (a === '--self-test') args.selfTest = true;
    else args.positional.push(a);
  }
  return args;
}

function readEvents(feedPath) {
  if (!fs.existsSync(feedPath)) {
    console.error(`Feed not found: ${feedPath}`);
    process.exit(1);
  }
  const events = [];
  for (const line of fs.readFileSync(feedPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const ev = JSON.parse(trimmed);
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

function isOutcome(ev) {
  return ev.action === 'dispatch_outcome';
}

function clsIdOf(ev, field) {
  const id = field === 'meta'
    ? (ev.meta && (ev.meta.classificationId || ev.meta.classification_id))
    : (ev.classification_id ?? ev.classificationId);
  return typeof id === 'string' && id ? id : null;
}

/**
 * Distill one feed into run records + orphan dispatch records.
 * Pure function — exported for the self-test.
 */
export function distill(events, windowMin) {
  const windowMs = windowMin * 60_000;

  const classifications = events.filter(isClassification);
  const dispatches = events.filter(isDispatch);
  const outcomes = events.filter(isOutcome);

  const byId = new Map();
  for (const c of classifications) {
    const id = clsIdOf(c, 'meta');
    if (id && !byId.has(id)) byId.set(id, c);
  }

  // Attach dispatches to runs (exact id first, ts-proximity fallback).
  const runs = classifications.map((c) => ({
    classification: c,
    demigods: [],
    outcomes: [],
    tokens: 0,
  }));
  const runById = new Map();
  classifications.forEach((c, i) => {
    const id = clsIdOf(c, 'meta');
    if (id && !runById.has(id)) runById.set(id, runs[i]);
  });

  const orphans = [];
  for (const d of dispatches) {
    const dTs = new Date(d.ts).getTime();
    const dId = clsIdOf(d, 'event');
    let run = dId ? runById.get(dId) ?? null : null;
    if (!run) {
      let best = null;
      let bestIdx = -1;
      classifications.forEach((c, i) => {
        const cTs = new Date(c.ts).getTime();
        if (cTs <= dTs && dTs - cTs <= windowMs && (!best || cTs > new Date(best.ts).getTime())) {
          best = c;
          bestIdx = i;
        }
      });
      if (best) run = runs[bestIdx];
    }
    if (run) run.demigods.push(typeof d.demigod === 'string' ? d.demigod : '(unknown)');
    else orphans.push(d);
  }

  // Attach outcomes to runs: exact id first, else ts-proximity to the run
  // classification; tokens accumulate.
  for (const o of outcomes) {
    const oId = clsIdOf(o, 'event');
    let run = oId ? runById.get(oId) ?? null : null;
    if (!run) {
      const oTs = new Date(o.ts).getTime();
      let best = null;
      for (const r of runs) {
        const cTs = new Date(r.classification.ts).getTime();
        if (cTs <= oTs && oTs - cTs <= windowMs && (!best || cTs > new Date(best.classification.ts).getTime())) {
          best = r;
        }
      }
      run = best;
    }
    if (run) {
      run.outcomes.push(typeof o.outcome === 'string' ? o.outcome : '(unknown)');
      const t = o.tokens_used;
      if (t && typeof t === 'object') run.tokens += Number(t.input || 0) + Number(t.output || 0);
      else if (typeof t === 'number') run.tokens += t;
    }
  }

  return { runs, orphans };
}

function formatRuns({ runs, orphans }) {
  const lines = [];
  for (const r of runs) {
    lines.push(
      `RUN ${r.classification.ts} routeTo=${r.classification.meta.routeTo} ` +
      `demigods=[${r.demigods.join(',')}] outcomes=[${r.outcomes.join(',')}] tokens=${r.tokens}`,
    );
  }
  for (const d of orphans) {
    lines.push(`ORPHAN-DISPATCH ${d.ts} demigod=${d.demigod ?? '(unknown)'} god=${d.god ?? '?'} (no classification in window)`);
  }
  return lines;
}

function selfTest() {
  const fixture = path.join(SCRIPT_DIR, 'agreement-metric.fixture.jsonl');
  const events = readEvents(fixture);
  const lines = formatRuns(distill(events, 5));
  const expected = [
    'RUN 2026-10-03T10:00:00.000Z routeTo=apollo demigods=[planner] outcomes=[] tokens=0',
    'RUN 2026-10-03T10:05:00.000Z routeTo=artemis demigods=[tdd-guide] outcomes=[] tokens=0',
    'RUN 2026-10-03T10:10:00.000Z routeTo=hephaestus demigods=[] outcomes=[] tokens=0',
    'ORPHAN-DISPATCH 2026-10-03T10:20:00.000Z demigod=code-verifier god=apollo (no classification in window)',
  ];
  let failures = 0;
  expected.forEach((want, i) => {
    const got = lines[i] ?? '(missing)';
    const ok = got === want;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${i}] ${got}${ok ? '' : ` (want: ${want})`}`);
    if (!ok) failures++;
  });
  if (lines.length !== expected.length) {
    console.log(`FAIL  line count: ${lines.length} (want ${expected.length})`);
    failures++;
  }
  if (failures > 0) {
    console.error(`${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('All context-distill self-test assertions passed');
  process.exit(0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) selfTest();

  if (!args.positional.length) {
    console.error('Usage: node scripts/context-distill.mjs <live.jsonl> [--since ISO] [--until ISO] [--window-min 5] [--json] [--self-test]');
    process.exit(1);
  }
  const all = readEvents(path.resolve(args.positional[0]));

  const sinceMs = args.since ? new Date(args.since).getTime() : null;
  const untilMs = args.until ? new Date(args.until).getTime() : null;
  const events = all.filter((ev) => {
    const tsMs = new Date(ev.ts).getTime();
    if (sinceMs !== null && tsMs < sinceMs) return false;
    if (untilMs !== null && tsMs > untilMs) return false;
    return true;
  });

  const result = distill(events, args.windowMin);
  if (args.json) {
    console.log(JSON.stringify({
      runs: result.runs.map((r) => ({
        ts: r.classification.ts,
        routeTo: r.classification.meta.routeTo,
        demigods: r.demigods,
        outcomes: r.outcomes,
        tokens: r.tokens,
      })),
      orphan_dispatches: result.orphans.map((d) => ({ ts: d.ts, demigod: d.demigod ?? null, god: d.god ?? null })),
    }, null, 2));
    return;
  }
  for (const line of formatRuns(result)) console.log(line);
}

main();
