#!/usr/bin/env node
/**
 * brain-live.test.mjs — v0.0.75.
 *
 * The dashboard must read the ACTIVE LANE, not only the activity feed:
 * hop dispatches publish `action: 'hop'`, so counting only `dispatch_outcome`
 * showed 0 dispatches for every god that ran hops. The live campaign must be
 * the lane's state + plan, not the last `campaign_start` in the feed.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const route = fs.readFileSync(path.join(ROOT, 'src/app/api/olympus/brain-stats/route.ts'), 'utf-8');
const dash = fs.readFileSync(path.join(ROOT, 'src/components/olympus/god-intelligence-dashboard.tsx'), 'utf-8');
const sheet = fs.readFileSync(path.join(ROOT, 'src/components/olympus/task-sheet-modal.tsx'), 'utf-8');
const timeline = fs.readFileSync(path.join(ROOT, 'src/components/olympus/activity-timeline.tsx'), 'utf-8');
let failures = 0;
const check = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + String(d).slice(0, 200)}`); if (!c) failures++; };

check('B-1: brain-stats reads the active lane telemetry', /readLaneTruth/.test(route) && /\.olympus-hop-telemetry\.jsonl/.test(route), 'lane telemetry not read');
check('B-2: per-god dispatches = turns + hops', /dispatchCount: godDispatches \+/.test(route) && /hops: laneTruth\?\.hopByGod/.test(route), 'hops not counted');
check('B-3: the live campaign comes from state + plan', /campaign: laneTruth \? \{/.test(route) && /total: \(laneTruth\.plan\?\.hops/.test(route), 'campaign still from the feed');
check('B-4: the dashboard prefers the lane campaign', /campaign\.completed\}\/\$\{campaign\.total/.test(dash), 'component ignores stats.campaign');
check('B-5: the hop sheet reads the event lane', /lane\?: string \| null/.test(sheet) && /tasks\$\{qs\}/.test(sheet) && /\?lane=\$\{encodeURIComponent/.test(sheet), 'sheet has no lane');
check('B-6: the hop sheet stays live while running', /setInterval\(\(\) => \{ if \(document\.visibilityState !== 'hidden'\) void load\(false\)/.test(sheet), 'sheet is a one-shot read');
check('B-7: the timeline passes the event lane', /setSheetLane\(\(ep as any\)\.lane/.test(timeline), 'timeline drops the lane');

console.log(`\nbrain-live: ${failures === 0 ? 'PASS' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
