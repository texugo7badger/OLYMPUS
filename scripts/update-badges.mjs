#!/usr/bin/env node
/**
 * update-badges.mjs — refresh the README SVGs from REAL GitHub data.
 *
 * v0.0.23. The badge bar and the header carry live numbers; this script is
 * the single writer. It fetches the repository + releases from the GitHub
 * API, then rewrites the values in:
 *   - public/badge-bar.svg  (version, license, downloads, forks, stars,
 *                            lastCommit, size, contributors)
 *   - public/header.svg     (the version token in the stats line + aria-label)
 *
 * HONESTY RULES:
 *   - "downloads" counts INSTALLER assets only (AppImage, .deb, .tar.gz).
 *     `latest-linux.yml` is the auto-updater metadata — a machine check, not
 *     a human download — and is excluded.
 *   - on any API failure the file is left UNCHANGED (never zeroed, never
 *     guessed); the exit code is non-zero so CI can report it.
 *
 * Usage:
 *   node scripts/update-badges.mjs            # update in place
 *   node scripts/update-badges.mjs --dry-run  # print the values, write nothing
 *
 * Auth: GITHUB_TOKEN (CI) or the `gh` CLI session (local).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BADGE = path.join(ROOT, 'public', 'badge-bar.svg');
const HEADER = path.join(ROOT, 'public', 'header.svg');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const REPO = process.env.OLYMPUS_REPO || 'texugo7badger/OLYMPUS';
const DRY = process.argv.includes('--dry-run');

function api(endpoint) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    const res = execFileSync('curl', [
      '-sS', '-H', `Authorization: Bearer ${token}`,
      '-H', 'Accept: application/vnd.github+json',
      `https://api.github.com/${endpoint}`,
    ], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(res);
  }
  const out = execFileSync('gh', ['api', endpoint, '--paginate'], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  // A single object (repo/commits) parses whole; a paginated LIST arrives as
  // concatenated arrays — merge those.
  try { return JSON.parse(out); } catch { /* fall through to the merge */ }
  const chunks = [];
  let depth = 0, start = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '[') { if (depth === 0) start = i; depth++; }
    else if (out[i] === ']') { depth--; if (depth === 0) chunks.push(JSON.parse(out.slice(start, i + 1))); }
  }
  return chunks.flat();
}

function fmtSize(kb) {
  const mb = kb / 1024;
  return mb >= 10 ? `~${Math.round(mb)} MB` : `~${mb.toFixed(1)} MB`;
}

function setField(svg, field, value) {
  const re = new RegExp(`(<[^>]*data-field="${field}"[^>]*>)([^<]*)(<)`);
  if (!re.test(svg)) return { svg, changed: false };
  return { svg: svg.replace(re, `$1${value}$3`), changed: true };
}

function main() {
  const repo = api(`repos/${REPO}`);
  const releases = api(`repos/${REPO}/releases`);
  const contributors = api(`repos/${REPO}/contributors?per_page=100`);
  const commits = api(`repos/${REPO}/commits?per_page=1`);

  const installers = releases
    .flatMap((r) => r.assets || [])
    .filter((a) => !/\.(yml|yaml)$/i.test(a.name));
  const downloads = installers.reduce((sum, a) => sum + (a.download_count || 0), 0);

  const latestTag = releases.find((r) => !r.draft && !r.prerelease)?.tag_name || `v${PKG.version}`;
  const version = String(PKG.version || latestTag.replace(/^v/, ''));
  const lastCommit = (commits?.[0]?.commit?.committer?.date || new Date().toISOString()).slice(0, 10);

  const values = {
    version,
    license: (repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : 'AGPL-3.0'),
    downloads: String(downloads),
    forks: String(repo.forks_count ?? 0),
    stars: String(repo.stargazers_count ?? 0),
    lastCommit,
    size: fmtSize(repo.size ?? 0),
    contributors: String(Array.isArray(contributors) ? contributors.length : 0),
  };

  console.log('badge values:', JSON.stringify(values));

  let badge = fs.readFileSync(BADGE, 'utf-8');
  let missing = [];
  for (const [field, value] of Object.entries(values)) {
    const r = setField(badge, field, value);
    if (!r.changed) missing.push(field);
    badge = r.svg;
  }
  // aria-label carries the human summary.
  badge = badge.replace(/aria-label="[^"]*"/,
    `aria-label="OLYMPUS v${version} — ${values.license} — ${values.downloads} downloads — ${values.forks} forks — ${values.stars} stars — last commit ${lastCommit} — ${values.size} — ${values.contributors} contributors"`);

  let header = fs.readFileSync(HEADER, 'utf-8');
  const hv = setField(header, 'version', `v${version}`);
  header = hv.svg;
  if (!hv.changed) missing.push('header.version');
  header = header.replace(/aria-label="OLYMPUS v[0-9.]+/, `aria-label="OLYMPUS v${version}`);

  if (missing.length) {
    console.error(`WARNING: fields not found in the SVGs: ${missing.join(', ')}`);
  }

  if (DRY) {
    console.log('dry-run: no files written');
    return;
  }
  fs.writeFileSync(BADGE, badge, 'utf-8');
  fs.writeFileSync(HEADER, header, 'utf-8');
  console.log(`updated ${path.relative(ROOT, BADGE)} and ${path.relative(ROOT, HEADER)}`);
}

try {
  main();
} catch (e) {
  console.error(`update-badges: API unavailable (${e.message}) — files left unchanged`);
  process.exit(1);
}
