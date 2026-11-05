#!/usr/bin/env node
/**
 * mark-stable.mjs — v0.0.81: the stable plug.
 *
 * A release becomes stable ONLY when its battery is green. This script reads
 * the battery log, refuses on any FAIL (or a non-green summary), and writes
 * `public/stable.json` + `public/versions.json` for the Settings version card.
 * The release gate runs it after the battery, before `next build`, so the
 * stable manifest ships inside the AppImage/standalone.
 *
 * Usage:
 *   node scripts/mark-stable.mjs --version 0.0.81 --tag v0.0.81 --battery /tmp/battery.log
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const version = String(arg('version', '')).replace(/^v/, '');
const tag = String(arg('tag', version ? `v${version}` : ''));
const battery = String(arg('battery', ''));
const root = process.cwd();

if (!version || !battery) {
  console.error('usage: node scripts/mark-stable.mjs --version X.Y.Z --battery <log>');
  process.exit(2);
}
if (!fs.existsSync(battery)) {
  console.error(`battery log not found: ${battery}`);
  process.exit(2);
}

const log = fs.readFileSync(battery, 'utf-8');
const summary = log.match(/battery: (\d+) PASS \/ (\d+) FAIL \/ (\d+) SKIP \(declared\) of (\d+)/);
const failLines = log.split('\n').filter((l) => l.startsWith('FAIL '));
const pass = summary ? Number(summary[1]) : 0;
const fail = summary ? Number(summary[2]) : failLines.length;
const skip = summary ? Number(summary[3]) : 0;
const suites = summary ? Number(summary[4]) : 0;

if (!summary || fail !== 0 || failLines.length > 0) {
  console.error(`REFUSED: the battery is not green (${pass} PASS / ${fail} FAIL / ${skip} SKIP of ${suites}).`);
  if (failLines.length) console.error(failLines.slice(0, 8).join('\n'));
  process.exit(1);
}

let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim(); } catch { /* no git */ }
let tags = [];
try {
  tags = execFileSync('git', ['tag', '--sort=-v:refname'], { cwd: root, encoding: 'utf-8' }).trim().split('\n').filter(Boolean).slice(0, 30);
} catch { /* no tags */ }

const stable = {
  version,
  tag,
  stable: true,
  tests: { pass, fail, skip, suites },
  releasedAt: new Date().toISOString(),
  commit,
  note: 'Stable means: the full battery ran with 0 FAIL and the declared skips are explicit. The console/GO limits are unrelated and may change.',
};
const versions = {
  stable,
  versions: tags.map((t) => ({ version: t.replace(/^v/, ''), tag: t, stable: t === tag })),
};

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'stable.json'), JSON.stringify(stable, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'public', 'versions.json'), JSON.stringify(versions, null, 2) + '\n');
console.log(`stable: v${version} · ${pass} PASS / ${fail} FAIL / ${skip} SKIP of ${suites}`);
