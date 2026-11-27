#!/usr/bin/env node
/**
 * instinct-quarantine.mjs — v0.1.4: move, never delete.
 *
 * Consumes the audit JSON and moves the rows it recommends for quarantine
 * into `instincts/<god>/_archive/<stamp>/`, with a manifest that records the
 * original path, sha256 and reason. The default is a dry run; `--apply` is
 * explicit. Restore is `npm run instincts:restore`.
 *
 * Usage:
 *   npm run instincts:quarantine                 # dry run
 *   npm run instincts:quarantine -- --apply      # move the recommended rows
 *   npm run instincts:quarantine -- --apply --limit 20
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Math.max(1, Number(args[limitArg + 1]) || 0) : 0;
const auditArg = args.indexOf('--audit');
const AUDIT = auditArg >= 0
  ? path.resolve(args[auditArg + 1])
  : path.join(process.cwd(), 'reports', 'instinct-audit-v014.json');
const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const ROOT = path.join(VAULT, '05_Auto_Learning', 'instincts');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

if (!fs.existsSync(AUDIT)) {
  console.error(`instinct-quarantine: audit not found: ${AUDIT}\nRun: npm run instincts:audit`);
  process.exit(1);
}
const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf-8'));
let selected = (audit.rows || []).filter((r) => r.recommended === 'quarantine' && r.path && fs.existsSync(r.path));
if (limit > 0) selected = selected.slice(0, limit);

if (selected.length === 0) {
  console.log('instinct-quarantine: nothing to quarantine — the vault is clean for this rule set.');
  process.exit(0);
}

const ts = stamp();
const manifestDir = path.join(ROOT, '_archive', 'manifests');
const manifestPath = path.join(manifestDir, `${ts}.json`);
const items = [];
let moved = 0;
let failed = 0;

for (const row of selected) {
  const targetDir = path.join(ROOT, row.god, '_archive', ts);
  const target = path.join(targetDir, row.file);
  if (!apply) {
    console.log(`DRY  ${row.god}/${row.file}  (${row.flags?.fixture ? 'fixture' : row.flags?.duplicateOf ? 'duplicate' : 'stale'})`);
    continue;
  }
  try {
    const hash = sha256(row.path);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(row.path, target);
    if (sha256(target) !== hash) throw new Error('copy hash mismatch');
    fs.rmSync(row.path, { force: true });
    items.push({
      god: row.god,
      file: row.file,
      from: row.path,
      to: target,
      sha256: hash,
      reason: row.flags?.fixture ? 'fixture' : row.flags?.duplicateOf ? `duplicate of ${row.flags.duplicateOf}` : 'stale',
    });
    moved++;
    console.log(`MOVE ${row.god}/${row.file} → _archive/${ts}/`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${row.god}/${row.file} — ${err?.message || err}`);
  }
}

if (apply && items.length > 0) {
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    vault: VAULT,
    rule: 'v0.1.4 quarantine: fixture | duplicate | stale',
    items,
  }, null, 2) + '\n', { mode: 0o600 });
  console.log(`\nmanifest: ${manifestPath}`);
}
console.log(JSON.stringify({ apply, selected: selected.length, moved, failed, manifest: apply && items.length ? manifestPath : null }, null, 2));
if (!apply) console.log('Dry run only. Re-run with --apply to move; restore with npm run instincts:restore.');
process.exit(failed === 0 ? 0 : 1);
