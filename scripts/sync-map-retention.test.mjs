#!/usr/bin/env node
/**
 * sync-map-retention.test.mjs — W-D10 (#85 + #90 + #100, v0.0.6
 * MISSION-CONTROL-TRUE): the sync-map becomes a first-class surface.
 * Run: npx tsx scripts/sync-map-retention.test.mjs   (exit 0 = pass)
 *
 * #90: the ledger is append-heavy (every chat turn + dispatch); nothing
 * bounded it. The cure: past the env-tunable cap, the OLDEST entries archive
 * (sync-map.archive.json, chain order preserved) and the live chain
 * re-anchors to the last archived hash — archive + live stay ONE continuous
 * tamper-evident chain, nothing ever deleted.
 * #85: the ledger had NO reader — the route + panel ship.
 * #100: the Live Preview consumes the durable #86 manager (start/stop +
 * the probe-verified manager truth layer).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

async function main() {
  // ── #90: the compaction round-trip (fixture home, child process) ─────────
  const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-syncfx-'));
  const probe = path.join(fx, 'probe.mjs');
  fs.writeFileSync(probe, `
const OLYMPUS = process.env.PROBE_OLYMPUS;
const { atlasIngestProjectPrompt } = await import(OLYMPUS + '/.opencode/olympus/lib/atlas-sync.ts');
for (let i = 0; i < 40; i++) {
  atlasIngestProjectPrompt({ sessionID: 'ses-fx-' + i, text: 'fixture turn ' + i + ' — the compaction probe', agent: 'apollo' });
}
const fs = await import('fs');
const path = await import('path');
const live = JSON.parse(fs.readFileSync(path.join(process.env.OLYMPUS_HOME, 'sync-map.json'), 'utf-8'));
const archive = JSON.parse(fs.readFileSync(path.join(process.env.OLYMPUS_HOME, 'sync-map.archive.json'), 'utf-8'));
const crypto = await import('crypto');
// Chain re-verification across the boundary: anchor -> live entries.
const canonical = (e) => { const { chainHash, ...rest } = e; return JSON.stringify(rest); };
const liveSeq = Object.values(live.entries).sort((a,b) => a.seq - b.seq);
let prev = live.archiveAnchor;
let chainOk = true;
for (const e of liveSeq) {
  const expect = crypto.createHash('sha256').update(prev + '|' + e.id + '|' + canonical(e)).digest('hex');
  if (expect !== e.chainHash) { chainOk = false; break; }
  prev = e.chainHash;
}
const lastArchived = archive.entries[archive.entries.length - 1];
console.log(JSON.stringify({
  liveCount: Object.keys(live.entries).length,
  archivedCount: archive.entries.length,
  anchor: live.archiveAnchor,
  anchorMatchesArchive: live.archiveAnchor === lastArchived.chainHash,
  archivedThroughSeq: archive.archivedThroughSeq,
  maxLiveSeq: Math.max(...liveSeq.map(e => e.seq)),
  chainOk,
  chainHeadOk: live.chainHead === prev,
}));
`);
  const r = spawnSync('npx', ['tsx', '--tsconfig', path.join(OLYMPUS, 'tsconfig.json'), probe], {
    cwd: OLYMPUS, encoding: 'utf-8', timeout: 180_000,
    env: { ...process.env, PROBE_OLYMPUS: OLYMPUS, OLYMPUS_HOME: fx, OLYMPUS_SYNC_MAP_MAX_ENTRIES: '30', OLYMPUS_ROOT: OLYMPUS },
  });
  let out = {};
  try { out = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* probe crashed */ }
  expect('#90: past the cap, the live map truncates to the keep floor (the incremental math: compaction fires at 31 > cap 30, archives 16, keeps 15; the next 9 write un-compacted)',
    out.liveCount === 24, `liveCount=${out.liveCount} stdout=${(r.stdout || '').slice(-150)} stderr=${(r.stderr || '').slice(-200)}`);
  expect('#90: the archived entries land in sync-map.archive.json (nothing deleted)',
    out.archivedCount === 16, `archivedCount=${out.archivedCount}`);
  expect('#90: the live chain re-anchors at the archive boundary (ONE continuous chain)',
    out.anchorMatchesArchive === true && out.chainOk === true && out.chainHeadOk === true,
    `anchorMatch=${out.anchorMatchesArchive} chainOk=${out.chainOk} headOk=${out.chainHeadOk}`);
  expect('#90: the archive holds the OLDEST seqs, the live map the newest',
    out.archivedThroughSeq === 16 && out.maxLiveSeq === 40,
    `archivedThrough=${out.archivedThroughSeq} maxLiveSeq=${out.maxLiveSeq}`);
  fs.rmSync(fx, { recursive: true, force: true });

  // ── #90 source pins ───────────────────────────────────────────────────────
  const syncSrc = read('.opencode/olympus/lib/atlas-sync.ts');
  expect('#90: the cap is env-tunable (the R3 knob family)',
    syncSrc.includes('OLYMPUS_SYNC_MAP_MAX_ENTRIES'), 'the cap is hardcoded — no knob');

  // ── #85: the reader ships ─────────────────────────────────────────────────
  expect('#85: GET /api/olympus/sync-map exists (the ledger read surface)',
    fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/sync-map/route.ts')),
    'the sync-map shipped with zero readers — the who-is-doing-what panel has no data source');
  const pageSrc = read('src/app/page.tsx');
  const barSrc = read('src/components/olympus/activity-bar.tsx');
  expect('#85: the Sync Map panel is mounted + reachable (the activity bar button)',
    pageSrc.includes('SyncMapPanel') && barSrc.includes("'sync-map'"),
    'the panel exists but no pane/button reaches it');

  // ── #100: the durable host integration ────────────────────────────────────
  expect('#100: the dev-server start/stop routes ship (the manager controls)',
    fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/dev-server/start/route.ts'))
    && fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/dev-server/stop/route.ts')),
    'the panel cannot host/stop the durable server');
  const lpRoute = read('src/app/api/olympus/live-preview/route.ts');
  const lpPanel = read('src/components/olympus/live-preview.tsx');
  expect('#100: the live-preview route carries the MANAGER truth layer',
    lpRoute.includes('managerStatus') && lpRoute.includes('manager'),
    'the panel still sees only the ephemeral lane probe — the #86 manager stays invisible');
  expect('#100: the panel renders the durable host controls (start/stop honest)',
    lpPanel.includes('DevServerControls') && lpPanel.includes("dev-server/"),
    'no start/stop control on the panel');

  if (failures > 0) { console.error(`\nsync-map-retention: ${failures} FAIL`); process.exit(1); }
  console.log('\nsync-map-retention: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
