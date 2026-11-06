#!/usr/bin/env tsx
/**
 * walk-lane.ts — v0.0.73: the detached walker (one process per campaign).
 *
 * Started by `src/lib/hop-runtime/supervisor.ts`, never by the user directly:
 *
 *   tsx scripts/walk-lane.ts --lane <path> --slug <slug>
 *
 * It walks the lane's `dispatch-plan.json` to the end, publishes every hop to
 * the shared event stream (the UI reads that, not this process), and writes
 * the final verdict into the supervisor state. Because it is detached, the
 * app can restart, crash or close — the walk keeps going.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import path from 'node:path';
import { maybeWalkThePlan } from '../src/lib/hop-runtime/post-run';
import { markSupervisor } from '../src/lib/hop-runtime/supervisor';

const args = process.argv.slice(2);
const arg = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const laneRoot = arg('lane');
const slug = arg('slug') || (laneRoot ? path.basename(laneRoot) : null);
if (!laneRoot || !slug) {
  console.error('walk-lane: --lane <path> --slug <slug> are required');
  process.exit(2);
}
// v0.0.85 — a BOOT AUTO-RESUME keeps the quarantine: the hops that parked
// before the crash must not be re-run from scratch. A human's start (the
// supervisor POST) never passes this flag, so their explicit resume retries.
const keepQuarantine = process.argv.includes('--keep-quarantine');

function log(msg: string) {
  console.log(`[walk-lane ${new Date().toISOString()}] ${msg}`);
}

async function main() {
  log(`start slug=${slug} lane=${laneRoot} pid=${process.pid}`);
  markSupervisor(slug!, { status: 'running', outcome: 'walking' });
  try {
    const result = await maybeWalkThePlan({
      slug: slug!,
      laneRoot,
      unattended: true,
      expectPlan: false,
      publishActivity: true,
      ...(keepQuarantine ? { keepQuarantine: true } : {}),
      send: (ev: any) => {
        if (ev?.msg) log(String(ev.msg));
      },
    });
    const outcome = `${result.walked ? 'walked' : 'no-walk'}: ${result.summaryLine ?? result.reason ?? ''} (${result.completed}/${result.total})`;
    log(`done ${outcome}`);
    markSupervisor(slug!, {
      status: result.walked ? 'finished' : 'failed',
      finishedAt: new Date().toISOString(),
      outcome,
    });
    process.exit(0);
  } catch (e: any) {
    const msg = e?.message || String(e);
    log(`failed: ${msg}`);
    markSupervisor(slug!, { status: 'failed', finishedAt: new Date().toISOString(), outcome: msg.slice(0, 500) });
    process.exit(1);
  }
}

main();
