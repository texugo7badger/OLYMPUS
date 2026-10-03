#!/usr/bin/env node
/**
 * agreement-metric.mjs — classification x dispatch agreement metric (Batch 12a).
 *
 * Measures whether the task classifier's INTENT (action=classification,
 * meta.routeTo) agrees with the EXECUTION record (a god/subagent dispatch).
 * Closes the P4 design finding: routeTo was classifier intent with no
 * measurable execution record — "NOT MEASURABLE via current telemetry".
 * This script makes it measurable from the live activity feed alone.
 *
 * JOIN KEY (see Batch 12a report section 1):
 *   Classification events and dispatch events share NO sessionID and NO
 *   conversationId today, so the only available join is ts proximity within
 *   one run: each dispatch is paired with the most recent classification
 *   that precedes it inside the --window-min window. A run boundary is
 *   therefore approximated, not recorded. When runs overlap or a dispatch
 *   fires late, pairs can be ambiguous — unjoined buckets below surface
 *   exactly that, first-class (not noise).
 *
 * EXECUTION RECORDS (two writers, both accepted):
 *   - action "symphony-dispatch" — written by the olympus-dispatch tool
 *     itself (.opencode/olympus/tools/dispatch.ts). This is the only
 *     dispatch-shaped event actually observed in live.jsonl so far.
 *   - action "dispatch" — written by the tool.execute.after hook
 *     (.opencode/olympus/olympus-hooks.ts). Accepted for completeness.
 *   A demigod's executed god is resolved from the repo's demigod prompt
 *   directory (.opencode/prompts/agents/demigods/<god>/<demigod_>.txt,
 *   hyphens normalized to underscores). Falls back to the event's `god`
 *   field when the demigod cannot be resolved.
 *
 * UNJOINED BUCKETS (first-class findings):
 *   - UNJOINED-CLASSIFICATION: a classification with no dispatch after it
 *     inside the window — intent with no execution record (e.g. the run
 *     never dispatched, failed, or was aborted).
 *   - UNJOINED-DISPATCH: a dispatch with no classification before it inside
 *     the window — execution with no intent record.
 *
 * Usage:
 *   node scripts/agreement-metric.mjs <live.jsonl> [--since ISO] [--until ISO]
 *        [--window-min 5] [--demigod-dir <dir>] [--json]
 *
 *   --since / --until   ISO timestamps bounding the window (inclusive).
 *   --window-min        Join window in minutes (default 5).
 *   --demigod-dir       Demigod prompt directory override. Defaults to
 *                       <repo-root>/.opencode/prompts/agents/demigods.
 *   --json              Machine-readable summary instead of the human table.
 *
 * Deterministic: pure function of the input file + args. Zero dependencies.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_DEMIGOD_DIR = path.join(REPO_ROOT, '.opencode', 'prompts', 'agents', 'demigods');

function parseArgs(argv) {
  const args = { positional: [], since: null, until: null, windowMin: 5, demigodDir: DEFAULT_DEMIGOD_DIR, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') args.since = argv[++i] ?? null;
    else if (a === '--until') args.until = argv[++i] ?? null;
    else if (a === '--window-min') args.windowMin = Number(argv[++i] ?? 5);
    else if (a === '--demigod-dir') args.demigodDir = argv[++i] ?? DEFAULT_DEMIGOD_DIR;
    else if (a === '--json') args.json = true;
    else args.positional.push(a);
  }
  if (!args.positional.length) {
    console.error('Usage: node scripts/agreement-metric.mjs <live.jsonl> [--since ISO] [--until ISO] [--window-min 5] [--demigod-dir <dir>] [--json]');
    process.exit(1);
  }
  return args;
}

function readEvents(feedPath) {
  if (!fs.existsSync(feedPath)) {
    console.error(`Feed not found: ${feedPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(feedPath, 'utf-8');
  const events = [];
  for (const line of content.split('\n')) {
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
  // Chronological order (the feed is append-only; sort anyway for safety).
  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return events;
}

/**
 * Map demigod name (hyphenated arg form, e.g. "tdd-guide") to its parent
 * god by scanning the demigod prompt directory
 * (.opencode/prompts/agents/demigods/<god>/<demigod_>.txt). Returns null
 * when unresolvable (directory missing, or name unknown).
 */
function buildDemigodGodMap(demigodDir) {
  const map = new Map();
  let godDirs;
  try {
    godDirs = fs.readdirSync(demigodDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return map; // directory unavailable — resolution disabled, join falls back to ev.god
  }
  for (const dirent of godDirs) {
    const god = dirent.name;
    try {
      for (const f of fs.readdirSync(path.join(demigodDir, god))) {
        if (f.endsWith('.txt')) {
          // File convention: snake_case (tdd_guide.txt) for the hyphenated
          // demigod arg (tdd-guide).
          map.set(f.slice(0, -4).replace(/_/g, '-'), god);
        }
      }
    } catch {
      // unreadable god dir — skip
    }
  }
  return map;
}

function isClassification(ev) {
  return (ev.action === 'classification' || ev.type === 'classification')
    && ev.meta && typeof ev.meta.routeTo === 'string' && ev.meta.routeTo.length > 0;
}

function isDispatch(ev) {
  return ev.action === 'dispatch' || ev.action === 'symphony-dispatch';
}

/**
 * Executed god for a dispatch event: the demigod's parent god when the
 * demigod resolves, else the event's `god` field (the dispatching god).
 */
function executedGod(ev, demigodGodMap) {
  const demigod = typeof ev.demigod === 'string' && ev.demigod ? ev.demigod : null;
  if (demigod && demigodGodMap.has(demigod)) return demigodGodMap.get(demigod);
  return ev.god || null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const feedPath = path.resolve(args.positional[0]);
  const all = readEvents(feedPath);

  const inWindow = all.filter((ev) => {
    if (args.since && ev.ts < args.since) return false;
    if (args.until && ev.ts > args.until) return false;
    return true;
  });

  const demigodGodMap = buildDemigodGodMap(args.demigodDir);
  const classifications = inWindow.filter(isClassification);
  const dispatches = inWindow.filter(isDispatch);

  const windowMs = args.windowMin * 60_000;

  // Join: each dispatch pairs with the most recent classification before it
  // inside the window. Classifications may serve multiple dispatches (one
  // intent, N demigod dispatches per run); a classification with no dispatch
  // after it inside the window lands in UNJOINED-CLASSIFICATION.
  const pairs = [];
  const joinedClassificationIdx = new Set();
  const unjoinedDispatches = [];

  for (const d of dispatches) {
    const dTs = new Date(d.ts).getTime();
    let best = null;
    for (let i = 0; i < classifications.length; i++) {
      const c = classifications[i];
      const cTs = new Date(c.ts).getTime();
      if (cTs <= dTs && dTs - cTs <= windowMs && (!best || cTs > new Date(best.ts).getTime())) {
        best = c;
      }
    }
    if (best) {
      joinedClassificationIdx.add(classifications.indexOf(best));
      const intent = best.meta.routeTo;
      const executed = executedGod(d, demigodGodMap);
      pairs.push({
        ts: best.ts,
        intent,
        executed,
        demigod: typeof d.demigod === 'string' ? d.demigod : null,
        match: intent === executed,
        dispatch_ts: d.ts,
      });
    } else {
      unjoinedDispatches.push(d);
    }
  }

  const unjoinedClassifications = classifications.filter((_, i) => !joinedClassificationIdx.has(i));

  const matches = pairs.filter((p) => p.match).length;
  const agreementRate = pairs.length ? matches / pairs.length : null;

  const summary = {
    feed: feedPath,
    since: args.since,
    until: args.until,
    window_min: args.windowMin,
    total_events: all.length,
    events_in_window: inWindow.length,
    classifications: classifications.length,
    dispatches: dispatches.length,
    joined_pairs: pairs.length,
    matches,
    mismatches: pairs.length - matches,
    agreement_rate: agreementRate === null ? null : Math.round(agreementRate * 1000) / 1000,
    unjoined_classification: unjoinedClassifications.length,
    unjoined_dispatch: unjoinedDispatches.length,
    unjoined_classification_ts: unjoinedClassifications.map((c) => c.ts),
    unjoined_dispatch_ts: unjoinedDispatches.map((d) => d.ts),
  };

  if (args.json) {
    console.log(JSON.stringify({ summary, pairs }, null, 2));
    return;
  }

  console.log(`# classification x dispatch agreement — ${feedPath}`);
  console.log(`# window: since=${args.since ?? '(start)'} until=${args.until ?? '(end)'} join-window=${args.windowMin}min`);
  console.log(`# demigod resolution: ${demigodGodMap.size} names from ${args.demigodDir}`);
  console.log('');
  for (const p of pairs) {
    console.log(JSON.stringify({ ts: p.ts, intent: p.intent, executed: p.executed, match: p.match }));
  }
  console.log('');
  console.log(`classifications: ${summary.classifications}  dispatches: ${summary.dispatches}`);
  console.log(`joined pairs: ${summary.joined_pairs}  matches: ${summary.matches}  mismatches: ${summary.mismatches}`);
  console.log(`agreement rate: ${summary.agreement_rate === null ? 'N/A (no joined pairs)' : summary.agreement_rate}`);
  console.log(`UNJOINED-CLASSIFICATION (intent, no execution record): ${summary.unjoined_classification}`);
  for (const ts of summary.unjoined_classification_ts) console.log(`  ${ts}`);
  console.log(`UNJOINED-DISPATCH (execution, no intent record): ${summary.unjoined_dispatch}`);
  for (const ts of summary.unjoined_dispatch_ts) console.log(`  ${ts}`);
}

main();
