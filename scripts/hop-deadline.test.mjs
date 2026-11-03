#!/usr/bin/env node
/**
 * hop-deadline.test.mjs — v0.0.52.
 *
 * The 68-minute k1-source-audit specimen: the campaign budget stopped new
 * launches but a live hop extended to the transport's 2× hard cap. The hop
 * hard cap is now 30 min and the campaign deadline clips it; no retry starts
 * after the deadline, and the log no longer prints epoch as a duration.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const progress = await import(OLYMPUS + '/src/lib/hop-runtime/progress.ts');
const walkerMod = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
const walker = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/walker.ts', 'utf-8');
const transport = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/transport.ts', 'utf-8');
const warm = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/warm-server.ts', 'utf-8');

expect('D-1: the hard cap is bounded at 30 min',
  progress.hardCeilingMs(25 * 60_000) === 30 * 60_000 && progress.hardCeilingMs(60 * 60_000) === 30 * 60_000,
  `${progress.hardCeilingMs(25 * 60_000)} / ${progress.hardCeilingMs(60 * 60_000)}`);
expect('D-2: a short base still gets 2× (not over the cap)',
  progress.hardCeilingMs(10 * 60_000) === 20 * 60_000 && progress.hardCeilingMs(20 * 60_000) === 30 * 60_000,
  'the short-hop cap changed');
expect('D-3: the walker passes hardTimeoutMs to the transport',
  /hardTimeoutMs: ctx\.deadlineAt/.test(walker) && /hardCeilingMs\(resolveHopTimeoutMs\(\)\)/.test(walker),
  'the transport can still extend past the campaign');
expect('D-4: no retry starts after the campaign deadline',
  /campaign-deadline/.test(walker) && /Date\.now\(\) >= ctx\.deadlineAt/.test(walker),
  'a retry can start after 60 min');
expect('D-5: both transports honor hardTimeoutMs',
  /req\.hardTimeoutMs \?\? hardCeilingMs/.test(transport) && /opts\.hardTimeoutMs \?\? hardCeilingMs/.test(warm),
  'one transport ignores the clipped cap');
expect('D-6: the ceiling log prints remaining seconds, not epoch',
  !/hard cap \$\{Math\.round\(hardDeadline \/ 1000\)\}s/.test(transport + warm)
    && /hardDeadline - Date\.now\(\)/.test(transport + warm),
  'the 1793673850s message can return');
expect('D-8: the exploration budget defaults to 14 and is bounded', walkerMod.DEFAULT_HOP_TOOL_BUDGET === 14 && walkerMod.resolveHopToolBudget({ OLYMPUS_HOP_TOOL_BUDGET: '99' }) === 40 && walkerMod.resolveHopToolBudget({}) === 14, 'tool budget drifted');
expect('D-9: the warm transport counts distinct tool parts and aborts once', /seenToolParts/.test(warm) && /seenToolParts\.size > toolBudget/.test(warm) && /tool-budget-exceeded/.test(warm), 'the exploration loop is unbounded');
expect('D-10: the walker passes the tool budget to the transport', /toolBudget: resolveHopToolBudget\(\)/.test(walker), 'the budget never reaches the lane');
expect('D-7: the campaign budget is still 60 min',
  /DEFAULT_CAMPAIGN_BUDGET_MS = 60 \* 60_000/.test(walker),
  'the project budget changed silently');

console.log(failures === 0 ? '\nhop-deadline: all green.' : `\nhop-deadline: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
