#!/usr/bin/env node
/**
 * check-repo-privacy.mjs — v0.0.31 (hygiene guard).
 *
 * The maintainer's planning, research and audit notes are local-only. This
 * guard fails CI if any private path is tracked or if .gitignore stops
 * covering the three private roots. Secrets patterns are checked too.
 *
 * Run: node scripts/check-repo-privacy.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PRIVATE = [
  [/^docs\//, 'docs/'],
  [/^reports\//, 'reports/'],
  [/^research\//, 'research/'],
  [/(^|\/)\.env$/, '.env'],
  [/(^|\/)\.env\.(local|production|development)$/, '.env.local'],
  [/\.(pem|key)$/, 'private key'],
  [/(^|\/)api-configs\.json$/, 'api-configs.json'],
  [/(^|\/)\.olympus\//, '.olympus/'],
  // v0.0.31 golden rule: release notes live in the GitHub Release (tag), not
  // in the repository root. Keeping them here duplicated the release body.
  [/^release-notes-.*\.md$/, 'release notes belong to the tag release'],
];


const files = execFileSync('git', ['ls-files'], { encoding: 'utf-8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

const hits = [];
for (const f of files) {
  for (const [re, label] of PRIVATE) {
    if (re.test(f)) { hits.push(`${f} (${label})`); break; }
  }
}

const gitignore = readFileSync('.gitignore', 'utf-8');
const missing = ['docs/', 'reports/', 'research/'].filter((d) => {
  const re = new RegExp(`^${d.replace('/', '\\/')}`, 'm');
  return !re.test(gitignore);
});

if (hits.length) {
  console.error('repo-privacy: private paths are tracked — remove them with `git rm -r --cached <path>`:');
  for (const h of hits) console.error('  -', h);
  process.exit(1);
}
if (missing.length) {
  console.error(`repo-privacy: .gitignore is missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`repo-privacy: clean (${files.length} tracked files, private roots ignored)`);
