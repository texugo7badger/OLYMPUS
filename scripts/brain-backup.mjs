#!/usr/bin/env node
/**
 * brain-backup.mjs — MADRUGA-3 p4 (E5): the vault-brain instinct-store
 * backup/restore surface. Zero-dep. Usage:
 *   node scripts/brain-backup.mjs backup  <manifest.json>
 *   node scripts/brain-backup.mjs restore <manifest.json>
 *   node scripts/brain-backup.mjs verify  <manifest.json>
 * Restore is hash-verified per file: a tampered manifest (or a changed
 * source under restore) FAILS LOUD — never silently restores corruption.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.OLYMPUS_VAULT_ROOT || process.env.OLYMPUS_VAULT || join(homedir(), 'OLYMPUS-VAULT');
const STORE = join(VAULT_ROOT, '05_Auto_Learning', 'instincts');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const [cmd, manifestPath] = process.argv.slice(2);
if (!cmd || !manifestPath || !['backup', 'restore', 'verify'].includes(cmd)) {
  console.error('usage: node scripts/brain-backup.mjs backup|restore|verify <manifest.json>');
  process.exit(2);
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
if (cmd === 'backup') {
  const files = walk(STORE);
  const manifest = { created: new Date().toISOString(), store: STORE, files: [] };
  for (const f of files) {
    const b = readFileSync(f);
    manifest.files.push({ path: relative(STORE, f), sha256: sha(b), bytes: b.length });
    // content preserved in a sidecar dir next to the manifest
    const sidecar = join(dirname(manifestPath), 'brain-backup-content', relative(STORE, f));
    mkdirSync(dirname(sidecar), { recursive: true });
    copyFileSync(f, sidecar);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`BACKUP: ${files.length} file(s) -> ${manifestPath} (content sidecars alongside)`);
  process.exit(0);
}
// restore | verify
if (!existsSync(manifestPath)) { console.error(`FATAL: manifest not found: ${manifestPath}`); process.exit(1); }
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const contentDir = join(dirname(manifestPath), 'brain-backup-content');
const failures = [];
for (const entry of manifest.files) {
  const sidecar = join(contentDir, entry.path);
  if (!existsSync(sidecar)) { failures.push(`${entry.path}: sidecar missing`); continue; }
  const b = readFileSync(sidecar);
  const got = sha(b);
  if (got !== entry.sha256) { failures.push(`${entry.path}: manifest sha ${entry.sha256.slice(0, 8)} != sidecar sha ${got.slice(0, 8)} (TAMPERED BACKUP — refusing)`); continue; }
  if (cmd === 'restore') {
    const dst = join(manifest.store, entry.path);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, b);
  }
}
if (failures.length > 0) {
  console.error(`\nBRAIN RESTORE/VERIFY FAILED LOUD — ${failures.length} integrity failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${cmd.toUpperCase()}: ${manifest.files.length} file(s) ${cmd === 'restore' ? 'restored' : 'verified'} byte-exact (all sha256 match)`);
process.exit(0);
