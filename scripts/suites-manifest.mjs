#!/usr/bin/env node
/**
 * suites-manifest.mjs — v0.0.88 (#330): the public/local split, declared.
 *
 * `.gitignore` keeps most battery suites on the maintainer's machine because
 * they read the real vault, lanes, credentials, browsers or the local OpenCode
 * DB. A fresh clone could not reproduce the battery claim without a map. This
 * script writes that map: every `scripts/*.test.mjs` is either PUBLIC (tracked
 * and run by `.github/workflows/core.yml`) or LOCAL with a named prerequisite.
 *
 * Usage:
 *   node scripts/suites-manifest.mjs           # verify the manifest is current
 *   node scripts/suites-manifest.mjs --write   # regenerate it
 *
 * Exit 0 = the manifest covers every suite on disk; exit 1 = drift.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'scripts', 'local-suites.manifest.json');
const CI = path.join(ROOT, '.github', 'workflows', 'core.yml');

const tracked = new Set(
  (() => {
    try {
      return execFileSync('git', ['ls-files', 'scripts/*.test.mjs'], { cwd: ROOT, encoding: 'utf-8' })
        .trim().split('\n').filter(Boolean).map((f) => path.basename(f));
    } catch { return []; }
  })(),
);
const ciSrc = (() => { try { return fs.readFileSync(CI, 'utf-8'); } catch { return ''; } })();
const ciSuites = new Set((ciSrc.match(/for t in ([^;]+); do/) || ['', ''])[1].split(/\s+/).filter(Boolean));

function reasonFor(file) {
  let src = '';
  try { src = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf-8'); } catch { return 'unreadable suite'; }
  if (/OLYMPUS-VAULT|02_Projects|05_Auto_Learning|vault/i.test(src)) return 'reads the maintainer vault/lanes (OLYMPUS-VAULT)';
  if (/better-sqlite3|opencode\.db/i.test(src)) return 'reads the local OpenCode SQLite DB';
  if (/playwright|chromium|CDP|puppeteer/i.test(src)) return 'needs a real browser/CDP runtime';
  if (/ollama|lmstudio|vllm|llama\.cpp|127\.0\.0\.1:\d+/i.test(src)) return 'needs a live local service (LLM/probe host)';
  if (/session-token|auth|credential|API_KEY|OPENROUTER/i.test(src)) return 'reads local credentials/auth state';
  if (/\bHOME\b|homedir|\.olympus/i.test(src)) return 'reads the local app home (~/.olympus)';
  return 'development-only suite; hermetic core does not include it';
}

const files = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.test.mjs')).sort();
const publicSuites = files.filter((f) => tracked.has(f) && ciSuites.has(f.replace(/\.test\.mjs$/, '')));
const trackedLocal = files.filter((f) => tracked.has(f) && !ciSuites.has(f.replace(/\.test\.mjs$/, '')))
  .map((f) => ({ suite: f, reason: 'tracked, but needs the local OpenCode run state/overlay (or a live lane); core CI runs only the hermetic set' }));
const localSuites = files.filter((f) => !tracked.has(f)).map((f) => ({ suite: f, reason: reasonFor(f) }));
const missingCi = publicSuites.filter((f) => !ciSuites.has(f.replace(/\.test\.mjs$/, '')));
const strayCi = [...ciSuites].filter((t) => !tracked.has(`${t}.test.mjs`));
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  note: 'PUBLIC suites are tracked and run by .github/workflows/core.yml; TRACKED_LOCAL suites are in the repo but need the local OpenCode run state/overlay; LOCAL suites stay on the maintainer machine and declare why. A fresh clone reproduces the public core; the full battery numbers ride public/stable.json.',
  public: publicSuites,
  trackedLocal,
  local: localSuites,
  count: { total: files.length, public: publicSuites.length, trackedLocal: trackedLocal.length, local: localSuites.length },
};
const body = JSON.stringify(manifest, null, 2) + '\n';

if (process.argv.includes('--write')) {
  fs.writeFileSync(MANIFEST, body);
  console.log(`suites:manifest — wrote ${files.length} suites (${publicSuites.length} public, ${trackedLocal.length} tracked-local, ${localSuites.length} local)`);
  process.exit(0);
}

let failures = 0;
const fail = (msg) => { console.error(`FAIL  ${msg}`); failures++; };
if (missingCi.length) fail(`public suites missing from core.yml: ${missingCi.join(', ')}`);
if (strayCi.length) fail(`core.yml names untracked suites: ${strayCi.join(', ')}`);
let prev = null;
try { prev = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')); } catch { fail('no manifest — run with --write'); }
if (prev) {
  const prevAll = new Set([
    ...(prev.public ?? []),
    ...(prev.trackedLocal ?? []).map((l) => l.suite),
    ...(prev.local ?? []).map((l) => l.suite),
  ]);
  const nowAll = new Set(files);
  for (const f of files) if (!prevAll.has(f)) fail(`new suite not in the manifest: ${f}`);
  for (const f of prevAll) if (!nowAll.has(f)) fail(`manifest names a missing suite: ${f}`);
  if (JSON.stringify(prev.count) !== JSON.stringify(manifest.count)) fail(`count drift: manifest ${JSON.stringify(prev.count)} vs disk ${JSON.stringify(manifest.count)}`);
}
if (failures === 0) console.log(`suites:manifest — ${files.length} suites (${publicSuites.length} public, ${trackedLocal.length} tracked-local, ${localSuites.length} local), manifest current`);
process.exit(failures === 0 ? 0 : 1);
