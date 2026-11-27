#!/usr/bin/env node
/**
 * instinct-restore.mjs — v0.1.4: bring a quarantined instinct back, byte-for-byte.
 *
 * Reads a quarantine manifest and restores every item to its original path.
 * Refuses to overwrite a different file unless `--force` is explicit. Verifies
 * the sha256 before and after the move.
 *
 * Usage:
 *   npm run instincts:restore -- --latest
 *   npm run instincts:restore -- --manifest <path>
 *   npm run instincts:restore -- --latest --force
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const force = args.includes('--force');
const manifestArg = args.indexOf('--manifest');
const latest = args.includes('--latest');
const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const MANIFEST_DIR = path.join(VAULT, '05_Auto_Learning', 'instincts', '_archive', 'manifests');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

let manifestPath = manifestArg >= 0 ? path.resolve(args[manifestArg + 1]) : null;
if (!manifestPath && latest) {
  const files = fs.existsSync(MANIFEST_DIR)
    ? fs.readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json')).sort()
    : [];
  manifestPath = files.length ? path.join(MANIFEST_DIR, files[files.length - 1]) : null;
}
if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error('instinct-restore: no manifest found. Use --latest or --manifest <path>.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
let restored = 0;
let skipped = 0;
let failed = 0;

for (const item of manifest.items || []) {
  try {
    if (!fs.existsSync(item.to)) {
      // Already restored or the archive was moved by hand.
      if (fs.existsSync(item.from)) { skipped++; continue; }
      throw new Error(`archive file missing: ${item.to}`);
    }
    if (fs.existsSync(item.from)) {
      const existing = sha256(item.from);
      if (existing === item.sha256) { skipped++; continue; }
      if (!force) throw new Error(`target exists with different content: ${item.from} (use --force)`);
    }
    const hash = sha256(item.to);
    if (hash !== item.sha256) throw new Error('archive hash does not match the manifest');
    fs.mkdirSync(path.dirname(item.from), { recursive: true });
    fs.copyFileSync(item.to, item.from);
    if (sha256(item.from) !== item.sha256) throw new Error('restored hash mismatch');
    fs.rmSync(item.to, { force: true });
    restored++;
    console.log(`RESTORE ${item.god}/${item.file}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${item.god}/${item.file} — ${err?.message || err}`);
  }
}

console.log(JSON.stringify({ manifest: manifestPath, restored, skipped, failed }, null, 2));
process.exit(failed === 0 ? 0 : 1);
