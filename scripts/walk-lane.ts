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

import os from 'node:os';
import path from 'node:path';
import { maybeWalkThePlan } from '../src/lib/hop-runtime/post-run';
import { readNextPlan, applyNextPlan } from '../src/lib/hop-runtime/plan-generation';
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
// v0.0.84 edit — the boot parked resume retries only the last parked hop.
const retryParkedHop = process.argv.includes('--retry-parked');
// v0.0.98 — the recovery names the quarantined dependencies to retry.
const retryHopIds = (arg('retry-hops') ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function log(msg: string) {
  console.log(`[walk-lane ${new Date().toISOString()}] ${msg}`);
}

async function main() {
  // v0.0.84 edit — a hop is background work: lower its CPU priority so the
  // Next UI and the phone APIs stay responsive while agents/eslint/builds run.
  try { os.setPriority(process.pid, 10); } catch { /* platform */ }
  log(`start slug=${slug} lane=${laneRoot} pid=${process.pid}`);
  try {
    const walkOpts = {
      slug: slug!,
      laneRoot,
      unattended: true,
      expectPlan: false,
      publishActivity: true,
      ...(keepQuarantine ? { keepQuarantine: true } : {}),
      ...(retryParkedHop ? { retryParkedHop: true } : {}),
      ...(retryHopIds.length ? { retryHopIds } : {}),
      send: (ev: any) => {
        if (ev?.msg) log(String(ev.msg));
      },
    };
    let result = await maybeWalkThePlan(walkOpts);
    // v0.1.0 — THE GENERATION CHAIN CONTINUES IN THE SAME DETACHED WALKER.
    // The old script called maybeWalkThePlan once and exited; a staged
    // dispatch-plan.next.json was left waiting for a human Apply. On a fully
    // DONE generation (not a park), apply the next staged generation and keep
    // walking. Bounded to 8 generations per process; the loop guard/park owns
    // a failed generation.
    let guard = 0;
    while (!result.parked && result.total > 0 && result.completed >= result.total && guard < 8 && result.reason !== 'already-walking') {
      const next = (() => { try { return readNextPlan(laneRoot); } catch { return null; } })();
      if (!next?.plan) break;
      const applied = (() => { try { return applyNextPlan(laneRoot); } catch { return { applied: false }; } })();
      if (!applied.applied) break;
      guard++;
      log(`generation boundary: gen ${applied.generation ?? next.plan.generation ?? '?'} applied — continuing (${guard}/8)`);
      result = await maybeWalkThePlan(walkOpts);
      log(`generation ${applied.generation ?? '?'} walked: ${result.summaryLine ?? result.reason ?? ''} (${result.completed}/${result.total})`);
    }
    const outcome = `${result.walked ? 'walked' : 'no-walk'}: ${result.summaryLine ?? result.reason ?? ''} (${result.completed}/${result.total})`;
    log(`done ${outcome}`);
    // v0.0.84 edit — a duplicate found the lane lock; it must NOT touch the
    // real supervisor state (the mobile resume clobbered it with failed).
    if (!result.walked && /already walking this lane/i.test(outcome)) {
      log('duplicate start ignored — the lane lock holder owns the campaign');
      process.exit(0);
    }
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
