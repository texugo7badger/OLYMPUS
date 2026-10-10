#!/usr/bin/env npx tsx
/**
 * Lumina CRM hop-runtime driver — uses local walker.
 * Walks the dispatch-plan.json using the hop-runtime spine.
 * Usage: npx tsx run-hops.ts [--resume]
 */

import { walkPlan } from './walker-local.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = '/home/texugo/OLYMPUS-VAULT/02_Projects/lumina-crm';
const PLAN_PATH = join(PROJECT_ROOT, 'dispatch-plan.json');

async function main() {
  const resume = process.argv.includes('--resume');

  console.log('[driver] Loading dispatch plan...');
  const rawPlan = JSON.parse(readFileSync(PLAN_PATH, 'utf-8'));

  console.log('[driver] Plan loaded:', rawPlan.hops.length, 'hops');
  console.log('[driver] Concurrency:', 3);
  console.log('[driver] Resume mode:', resume);
  console.log('[driver] Lane root:', PROJECT_ROOT);
  console.log('[driver] Starting walk...\n');

  try {
    const result = await walkPlan({
      plan: rawPlan,
      resume,
      stateDir: PROJECT_ROOT,
    });

    console.log('\n[driver] Walk completed.');
    console.log('[driver] Completed hops:', result.completed.length);
    console.log('[driver] Parked:', result.parked ? `YES — ${result.parked.hopId} (${result.parked.reason})` : 'NO');

    if (result.parked) {
      console.log('\n[driver] Campaign parked. To resume:');
      console.log('  npx tsx run-hops.ts --resume');
      process.exit(1);
    }

    console.log('\n[driver] All hops completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('[driver] Walk failed:', err);
    process.exit(1);
  }
}

main();