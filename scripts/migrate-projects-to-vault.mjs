#!/usr/bin/env node
/**
 * migrate-projects-to-vault.mjs — move every legacy lane project into
 * ~/OLYMPUS-VAULT/02_Projects (v0.0.24).
 *
 * Default is a DRY RUN. `--apply` performs the move:
 *   - if the vault home does not exist: rename() (same filesystem — instant)
 *     or copy (cross-device) with a skip list for build dirs;
 *   - if the vault home already exists: the vault copy is canonical; the
 *     legacy copy is archived under ~/.local/share/olympus/workspace/_migrated/;
 *   - every project.md `path:` line is repointed to the vault home;
 *   - a manifest is written to ~/.olympus/project-migration-<ts>.json.
 *
 * Nothing is deleted: the archive preserves the legacy copy.
 *
 * Usage:
 *   node scripts/migrate-projects-to-vault.mjs
 *   node scripts/migrate-projects-to-vault.mjs --apply
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const VAULT = process.env.OLYMPUS_VAULT || path.join(HOME, 'OLYMPUS-VAULT');
const PROJECTS = path.join(VAULT, '02_Projects');
const LEGACY = process.env.OLYMPUS_WORKSPACE || path.join(HOME, '.local', 'share', 'olympus', 'workspace');
const ARCHIVE = path.join(LEGACY, '_migrated');

const apply = process.argv.includes('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const SKIP = new Set(['node_modules', '.next', 'dist', 'dist-electron', 'dist-electron-tsc', '.turbo', '.cache', 'coverage']);

function copyTree(from, to) {
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    if (SKIP.has(path.basename(from))) return;
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from)) copyTree(path.join(from, e), path.join(to, e));
  } else if (st.isFile()) {
    fs.copyFileSync(from, to);
  }
}

function repointNote(dir) {
  const note = path.join(dir, 'project.md');
  if (!fs.existsSync(note)) return false;
  const raw = fs.readFileSync(note, 'utf-8');
  if (!/^path:/m.test(raw)) return false;
  const next = raw.replace(/^path:\s*.*$/m, `path: ${dir}`);
  if (next !== raw) fs.writeFileSync(note, next, 'utf-8');
  return next !== raw;
}

function main() {
  if (!fs.existsSync(LEGACY)) {
    console.log(`migrate-projects: no legacy lane at ${LEGACY} — nothing to do.`);
    return;
  }
  fs.mkdirSync(PROJECTS, { recursive: true });

  const entries = fs.readdirSync(LEGACY, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && e.name !== '.git')
    .map((e) => e.name);

  if (entries.length === 0) {
    console.log(`migrate-projects: ${LEGACY} has no project directories — nothing to do.`);
    return;
  }

  const manifest = {
    ts: new Date().toISOString(),
    legacy: LEGACY,
    vault: PROJECTS,
    applied: apply,
    projects: [],
  };

  for (const slug of entries) {
    const src = path.join(LEGACY, slug);
    const dst = path.join(PROJECTS, slug);
    const exists = fs.existsSync(dst);
    const hasProjectNote = fs.existsSync(path.join(dst, 'project.md'));
    let action = 'skip';
    let noteUpdated = false;

    if (!exists) {
      action = 'move';
      if (apply) {
        try {
          fs.renameSync(src, dst);
        } catch {
          // Cross-device: copy (skip build dirs), leave the source as an
          // archive rather than deleting it.
          copyTree(src, dst);
          const archived = path.join(ARCHIVE, `${slug}-${stamp}`);
          fs.mkdirSync(ARCHIVE, { recursive: true });
          fs.renameSync(src, archived);
          action = 'copy+archive';
        }
      }
    } else if (!hasProjectNote) {
      action = 'merge-into-home';
      if (apply) {
        copyTree(src, dst);
        const archived = path.join(ARCHIVE, `${slug}-${stamp}`);
        fs.mkdirSync(ARCHIVE, { recursive: true });
        fs.renameSync(src, archived);
      }
    } else {
      action = 'archive-legacy';
      if (apply) {
        const archived = path.join(ARCHIVE, `${slug}-${stamp}`);
        fs.mkdirSync(ARCHIVE, { recursive: true });
        fs.renameSync(src, archived);
      }
    }

    if (apply && fs.existsSync(dst)) noteUpdated = repointNote(dst);
    manifest.projects.push({ slug, from: src, to: dst, action, noteUpdated });
    console.log(`${apply ? 'APPLY' : 'DRY  '}  ${slug.padEnd(28)} ${action}${noteUpdated ? ' · note repointed' : ''}`);
  }

  if (apply) {
    const manifestPath = path.join(HOME, '.olympus', `project-migration-${stamp}.json`);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`\nmanifest: ${manifestPath}`);
  } else {
    console.log('\ndry run — re-run with --apply to move the projects. Nothing was written.');
  }
}

main();
