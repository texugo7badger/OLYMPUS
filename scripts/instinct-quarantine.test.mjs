#!/usr/bin/env node
/**
 * instinct-quarantine.test.mjs — v0.1.4: the cleanup is reversible.
 *
 * Builds a temp vault with a fixture, a duplicate, an AIME global and a real
 * project instinct; runs the audit, quarantines with --apply, then restores
 * and proves the bytes are identical. Nothing in the real vault is touched.
 *
 * Run: npx tsx scripts/instinct-quarantine.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-instinct-vault-'));
const REPORT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-instinct-report-'));
const INST = path.join(VAULT, '05_Auto_Learning', 'instincts');
fs.mkdirSync(path.join(INST, 'athena', 'empirical'), { recursive: true });
fs.mkdirSync(path.join(INST, 'hermes', 'empirical'), { recursive: true });
process.on('exit', () => {
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(REPORT, { recursive: true, force: true }); } catch {}
});

let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 320)}`}`);
  if (!ok) failures++;
};
const note = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n# fixture\n`;
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const fixture = path.join(INST, 'athena', 'empirical', 'fixture.md');
const dup1 = path.join(INST, 'athena', 'empirical', 'dup-one.md');
const dup2 = path.join(INST, 'athena', 'empirical', 'dup-two.md');
const aime = path.join(INST, 'athena', 'empirical', 'aime-global.md');
const keep = path.join(INST, 'hermes', 'empirical', 'aime-project.md');
fs.writeFileSync(fixture, note({ god: 'athena', scope: 'global', samples: 1, trigger: 'fixture deterministic script', action: 'run it', projects: '[]' }));
fs.writeFileSync(dup1, note({ god: 'athena', scope: 'global', samples: 5, successes: 5, trigger: 'fix the login form validation', action: 'validate', projects: '[]' }));
fs.writeFileSync(dup2, note({ god: 'athena', scope: 'global', samples: 2, successes: 2, trigger: 'fix the login form validation', action: 'validate', projects: '[]' }));
fs.writeFileSync(aime, note({ god: 'athena', scope: 'global', samples: 10, successes: 10, trigger: 'render the aime deck', action: 'render', projects: '["aime"]' }));
fs.writeFileSync(keep, note({ god: 'hermes', scope: 'project', samples: 10, successes: 10, trigger: 'render the aime deck', action: 'render', projects: '["aime"]' }));
const hashes = { fixture: hash(fixture), dup2: hash(dup2) };

function run(script, args, env = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    encoding: 'utf-8',
    env: { ...process.env, OLYMPUS_VAULT: VAULT, OLYMPUS_REPORT_DIR: REPORT, ...env },
  });
}

const audit = run('instinct-audit.mjs', ['--vault', VAULT]);
expect('Q1: the audit exits clean', audit.status === 0, audit.stderr);
const jsonPath = path.join(REPORT, 'instinct-audit-v014.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
expect('Q2: the audit finds the fixture and duplicate', data.summary.fixtures === 1 && data.summary.duplicates === 1, JSON.stringify(data.summary));
expect('Q3: the audit flags the AIME global for rescope', data.summary.aimeGlobal === 1 && data.summary.recommendedRescope === 1, JSON.stringify(data.summary));
expect('Q4: the project-scoped AIME instinct is kept', data.rows.find((r) => r.file === 'aime-project.md')?.recommended === 'keep', JSON.stringify(data.rows.find((r) => r.file === 'aime-project.md')));

const dry = run('instinct-quarantine.mjs', ['--audit', jsonPath]);
expect('Q5: quarantine is a dry run by default', dry.status === 0 && fs.existsSync(fixture) && fs.existsSync(dup2), dry.stdout + dry.stderr);

const applied = run('instinct-quarantine.mjs', ['--audit', jsonPath, '--apply']);
expect('Q6: --apply moves the fixture and the duplicate', applied.status === 0 && !fs.existsSync(fixture) && !fs.existsSync(dup2), applied.stdout + applied.stderr);
expect('Q7: the real project instinct is untouched', fs.existsSync(keep), 'the project instinct moved');
const manifestDir = path.join(INST, '_archive', 'manifests');
const manifests = fs.existsSync(manifestDir) ? fs.readdirSync(manifestDir).filter((f) => f.endsWith('.json')) : [];
expect('Q8: a manifest records the move', manifests.length === 1, JSON.stringify(manifests));
const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, manifests[0]), 'utf-8'));
expect('Q9: the manifest carries the original hashes', manifest.items.some((i) => i.sha256 === hashes.fixture), JSON.stringify(manifest.items));

const restored = run('instinct-restore.mjs', ['--latest']);
expect('Q10: restore exits clean', restored.status === 0, restored.stdout + restored.stderr);
expect('Q11: the fixture is back byte-for-byte', fs.existsSync(fixture) && hash(fixture) === hashes.fixture, 'fixture hash changed');
expect('Q12: the duplicate is back byte-for-byte', fs.existsSync(dup2) && hash(dup2) === hashes.dup2, 'duplicate hash changed');

console.log(`\ninstinct-quarantine: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
process.exit(failures === 0 ? 0 : 1);
