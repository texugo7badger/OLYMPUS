#!/usr/bin/env node
/**
 * hop-live.test.mjs — LIVE HOP FLOW (#226, #227, #231) — v0.0.24.
 *
 *   L1  campaign grouping: one group per campaign, chain order, legacy bucket
 *   L2  the episodes API paginates (limit/before/since/page)
 *   L3  the hop event log appends + replays with a since cursor
 *   L4  run-state exposes the in-flight list + campaign id
 *   L5  the dashboard consumes the single live hook
 *   L6  the activity feed renders campaign groups + Load older
 *   L7  the state file carries the rich in-flight fields
 *
 * Run: npx tsx scripts/hop-live.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupEpisodesByCampaign, campaignLabel, campaignDuration } from '../src/lib/campaign-groups.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// L1 — grouping.
{
  const rows = [
    { id: 'a1', ts: '2026-10-30T10:00:00.000Z', god: 'apollo', action: 'hop', summary: "Hop 'h1' started", campaignId: 'cmp_a', project: 'demo', hop: 'h1' },
    { id: 'a1d', ts: '2026-10-30T10:00:30.000Z', god: 'apollo', action: 'hop', summary: "Hop 'h1' GREEN", campaignId: 'cmp_a', project: 'demo', hop: 'h1' },
    { id: 'a2', ts: '2026-10-30T10:01:00.000Z', god: 'athena', action: 'hop', summary: "Hop 'h2' started", campaignId: 'cmp_a', project: 'demo', hop: 'h2' },
    { id: 'a3', ts: '2026-10-30T10:02:00.000Z', god: 'athena', action: 'hop', summary: "Hop 'h2' GREEN", campaignId: 'cmp_a', project: 'demo', hop: 'h2' },
    { id: 'b1', ts: '2026-10-30T09:00:00.000Z', god: 'hephaestus', action: 'hop', summary: "Hop 'h0' PARKED (verify-failed)", campaignId: 'cmp_b', project: 'demo', hop: 'h0' },
    { id: 'c1', ts: '2026-10-29T09:00:00.000Z', god: 'hermes', action: 'dispatch', summary: 'old dispatch' },
  ];
  const groups = groupEpisodesByCampaign(rows, { nowMs: new Date('2026-10-30T10:03:00.000Z').getTime() });
  expect('L1 two campaigns + legacy bucket', groups.length === 3, String(groups.length));
  const a = groups.find((g) => g.campaignId === 'cmp_a');
  expect('L1 cmp_a has 2 hops', a.hopCount === 2, String(a.hopCount));
  expect('L1 cmp_a is done (both hops GREEN)', a.status === 'done', a.status);
  expect('L1 the chain is oldest-first', a.rows[0].id === 'a1' && a.rows[a.rows.length - 1].id === 'a3', a.rows.map((r) => r.id).join(','));
  const b = groups.find((g) => g.campaignId === 'cmp_b');
  expect('L1 cmp_b is parked', b.status === 'parked', b.status);
  expect('L1 legacy rows are grouped', groups.some((g) => g.status === 'legacy' && g.campaignId === null));
  expect('L1 campaignLabel handles null', campaignLabel(null) === 'Earlier activity');
  expect('L1 campaignDuration is human', /m|s/.test(campaignDuration(a)), campaignDuration(a));
}

// L2 — episodes pagination.
{
  const src = read('src/app/api/olympus/episodes/route.ts');
  expect('L2 episodes accepts limit', /searchParams\.get\('limit'\)/.test(src));
  expect('L2 episodes accepts before', /searchParams\.get\('before'\)/.test(src));
  expect('L2 episodes accepts since', /searchParams\.get\('since'\)/.test(src));
  expect('L2 episodes returns a page cursor', /nextCursor/.test(src) && /hasMore/.test(src));
  expect('L2 episodes carries campaignId', /campaignId:/.test(src));
}

// L3 — the hop event log.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-hop-events-'));
  const prev = process.env.OLYMPUS_HOME;
  process.env.OLYMPUS_HOME = tmp;
  const { publishHopEvent, readHopEvents } = await import('../src/lib/hop-runtime/hop-events.ts');
  publishHopEvent({ type: 'campaign_start', campaignId: 'cmp_x', project: 'demo', total: 2 });
  publishHopEvent({ type: 'hop_start', campaignId: 'cmp_x', project: 'demo', hop: 'h1', god: 'apollo', artifacts: ['a.ts'], transport: 'warm' });
  const all = readHopEvents({});
  expect('L3 two events appended', all.events.length === 2, String(all.events.length));
  const since = all.events[0].ts;
  const delta = readHopEvents({ since });
  expect('L3 since cursor returns only newer events', delta.events.length === 1 && delta.events[0].type === 'hop_start', JSON.stringify(delta));
  expect('L3 the log is JSONL and bounded', fs.existsSync(path.join(tmp, 'hop-events.jsonl')));
  if (prev === undefined) delete process.env.OLYMPUS_HOME; else process.env.OLYMPUS_HOME = prev;
  fs.rmSync(tmp, { recursive: true, force: true });
}

// L4 — run-state.
{
  const src = read('src/app/api/olympus/run-state/route.ts');
  expect('L4 run-state exposes inFlightList', /inFlightList/.test(src));
  expect('L4 run-state exposes campaignId', /campaignId: hopState\?\.campaignId/.test(src));
}

// L5 — the dashboard.
{
  const src = read('src/components/olympus/god-intelligence-dashboard.tsx');
  expect('L5 dashboard uses the live hook', /useHopLive/.test(src));
  expect('L5 dashboard renders LIVE CAMPAIGN', /Live campaign/.test(src));
  expect('L5 dashboard shows artifacts + elapsed', /h\.artifacts/.test(src) && /elapsed/.test(src));
  const hook = read('src/hooks/use-hop-live.ts');
  expect('L5 hook uses EventSource', /new EventSource\(/.test(hook));
  expect('L5 hook falls back to the snapshot', /\/api\/olympus\/hops\?limit=/.test(hook));
  expect('L5 hook pauses when hidden', /useDocVisible/.test(hook));
}

// L6 — the activity feed.
{
  const src = read('src/components/olympus/activity-timeline.tsx');
  expect('L6 timeline groups by campaign', /groupEpisodesByCampaign/.test(src));
  expect('L6 timeline has Load older', /Load older/.test(src));
  expect('L6 timeline shows the campaign header', /campaignLabel\(g\.campaignId\)/.test(src));
}

// L7 — the state file.
{
  const src = read('src/lib/hop-runtime/hop-state.ts');
  expect('L7 in-flight carries god', /god\?: string/.test(src));
  expect('L7 in-flight carries artifacts', /artifacts\?: string\[\]/.test(src));
  expect('L7 in-flight carries status/transport', /status\?:/.test(src) && /transport\?:/.test(src));
  expect('L7 state carries campaignId', /campaignId\?: string/.test(src));
}

console.log(`\nhop-live: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
