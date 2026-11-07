#!/usr/bin/env node
/**
 * note8-harness.mjs — v0.0.88: the 8h + 100-hop + external-campaign gate,
 * runnable and honest.
 *
 * The v0.0.87 page named the gate but had no runner. This harness runs:
 *   1. the deterministic 100-hop certification (0 tokens);
 *   2. a soak of N minutes (default 480 = 8h; --smoke = 2 min);
 *   3. the external-campaign leg: an explicit --external <slug> reads that
 *      lane's plan/state and reports it; it NEVER invents an external user.
 * The report lands in reports/note8-<ts>.json (gitignored) and the console
 * prints the claim status. A smoke run is labelled SMOKE, not note-8.
 *
 * Usage: node scripts/note8-harness.mjs [--smoke] [--minutes 480] [--external aime]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const mi = args.indexOf('--minutes');
const minutes = smoke ? 2 : (mi >= 0 ? Number(args[mi + 1]) || 480 : 480);
const ei = args.indexOf('--external');
const external = ei >= 0 ? String(args[ei + 1] || '') : '';

function run(cmd, argv, timeout = 1_800_000) {
  const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: 'utf-8', timeout });
  return { code: r.status, out: (r.stdout || '').slice(-4000), err: (r.stderr || '').slice(-2000) };
}

const report = { generatedAt: new Date().toISOString(), smoke, minutes, external: external || null, legs: {} };
console.log(`note8-harness — ${smoke ? 'SMOKE (not a note-8 claim)' : `${minutes} min`}`);
const cert = run('npx', ['tsx', 'scripts/certify-100hop.ts']);
report.legs.hundredHop = { pass: cert.code === 0, code: cert.code, tail: cert.out.slice(-600) };
console.log(`100-hop deterministic: ${cert.code === 0 ? 'PASS' : 'FAIL'}`);
if (!smoke || minutes > 0) {
  const soak = run('node', ['scripts/soak.mjs', '--minutes', String(minutes)], (minutes + 5) * 60_000);
  report.legs.soak = { pass: soak.code === 0, code: soak.code, minutes, tail: soak.out.slice(-600) };
  console.log(`soak ${minutes} min: ${soak.code === 0 ? 'PASS' : 'FAIL'}`);
}
if (external) {
  const vault = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
  const lane = path.join(vault, '02_Projects', external);
  let state = null;
  try { state = JSON.parse(fs.readFileSync(path.join(lane, '.olympus-hop-state.json'), 'utf-8')); } catch {}
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(lane, 'dispatch-plan.json'), 'utf-8')); } catch {}
  const total = plan?.hops?.length ?? 0;
  const completed = (state?.completed ?? []).filter((id) => (plan?.hops ?? []).some((h) => h.id === id)).length;
  report.legs.external = { slug: external, total, completed, parked: state?.parked?.hopId ?? null, pass: total > 0 && completed >= total, externalUser: false };
  console.log(`external '${external}': ${completed}/${total} — ${report.legs.external.pass ? 'PASS' : 'NOT COMPLETE'} (no external user claimed)`);
}
report.claim = {
  note8: !smoke && report.legs.hundredHop?.pass && report.legs.soak?.pass && report.legs.external?.pass && report.legs.external?.externalUser === true,
  reason: smoke ? 'smoke run — never a note-8 claim' : 'the external-campaign leg requires a real external user; this harness does not invent one',
};
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
const file = path.join(ROOT, 'reports', `note8-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
console.log(`claim: ${report.claim.note8 ? 'NOTE-8' : 'NOT CLAIMED'} — ${report.claim.reason}`);
console.log(`report: ${file}`);
process.exit(report.legs.hundredHop?.pass === false ? 1 : 0);
