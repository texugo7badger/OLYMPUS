#!/usr/bin/env node
/**
 * i18n-audit.test.mjs — v0.0.76: the seven languages stay complete.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'node_modules/.bin/tsx'), path.join(ROOT, 'scripts/i18n-audit.mjs')], { encoding: 'utf-8' });
  console.log('PASS  i18n: every language carries every key');
  if (!/i18n: COMPLETE/.test(out)) { console.log('FAIL  the audit did not report COMPLETE'); failures++; }
} catch (e) {
  console.log('FAIL  i18n: gaps — ' + String(e.stdout || e.message).slice(-400));
  failures++;
}
process.exit(failures === 0 ? 0 : 1);
