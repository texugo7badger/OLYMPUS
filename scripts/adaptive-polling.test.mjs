#!/usr/bin/env node
/**
 * adaptive-polling.test.mjs — #231 ADAPTIVE POLLING + PAGINATED FEED (v0.0.24).
 *
 *   P1  the episodes API paginates (limit/before/since/page cursor)
 *   P2  the feed loads older pages and polls only deltas
 *   P3  the always-mounted panels pause when the window is hidden
 *   P4  the left panes receive an `active` gate
 *   P5  no full-feed parse on every poll (the tail is incremental)
 *
 * Run: npx tsx scripts/adaptive-polling.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// P1 — episodes pagination.
{
  const src = read('src/app/api/olympus/episodes/route.ts');
  expect('P1 limit parsed', /searchParams\.get\('limit'\)/.test(src));
  expect('P1 limit capped at 200', /Math\.min\(limitRaw, 200\)/.test(src));
  expect('P1 before cursor parsed', /searchParams\.get\('before'\)/.test(src));
  expect('P1 since delta parsed', /searchParams\.get\('since'\)/.test(src));
  expect('P1 response page has hasMore/nextCursor', /hasMore/.test(src) && /nextCursor/.test(src));
  expect('P1 legacy total preserved', /total:\s*all\.length/.test(src));
}

// P2 — the feed client.
{
  const src = read('src/components/olympus/activity-timeline.tsx');
  expect('P2 initial page is 60', /limit=60/.test(src));
  expect('P2 delta uses since', /episodes\?since=/.test(src));
  expect('P2 older uses before', /episodes\?before=/.test(src));
  expect('P2 dedupes by id', /new Set\(prev\.map\(\(e\) => e\.id\)\)/.test(src));
  expect('P2 has a Load older control', /Load older/.test(src));
  expect('P2 pauses when hidden', /useDocVisible/.test(src) && /if \(!docVisible\) return/.test(src));
}

// P3 — always-mounted panels.
{
  for (const rel of [
    'src/components/olympus/status-bar.tsx',
    'src/components/olympus/god-panel.tsx',
    'src/components/olympus/context-indicator.tsx',
    'src/components/olympus/hitl-gate-toast.tsx',
    'src/components/olympus/god-detail.tsx',
    'src/components/olympus/live-preview.tsx',
  ]) {
    const src = read(rel);
    expect(`P3 ${path.basename(rel)} uses useDocVisible`, /useDocVisible/.test(src), rel);
    expect(`P3 ${path.basename(rel)} guards its poll`, /if \(!docVisible\)/.test(src), rel);
  }
}

// P4 — the left/right panes are gated by `active`/tab.
{
  const page = read('src/app/page.tsx');
  expect('P4 the right panes pass active', /active=\{docVisible && rightTab ===/.test(page));
  expect('P4 the left panes mount only when selected', /leftPane === 'brain'/.test(page));
  const vault = read('src/components/olympus/vault-summary.tsx');
  expect('P4 vault summary honors active', /if \(!active\) return/.test(vault));
}

// P5 — the feed tail is incremental.
{
  const src = read('src/app/api/olympus/episodes/route.ts');
  expect('P5 the feed uses the byte-offset tail', /ingestTail/.test(src) && /feedTail/.test(src));
  expect('P5 the live event cap remains bounded', /LIVE_MAX_EVENTS/.test(src));
}

console.log(`\nadaptive-polling: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
