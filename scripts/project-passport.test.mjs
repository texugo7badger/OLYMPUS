#!/usr/bin/env node
/**
 * project-passport.test.mjs — v0.0.48 (R48-01).
 *
 * A passport must travel without leaking the machine: identity + stacks +
 * summary + brief + docs + design memory, no absolute paths, no code tree.
 * Validation is pure and refuses malformed/unsafe slugs.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const mod = await import(OLYMPUS + '/src/lib/project-passport.ts');
const passport = {
  kind: 'olympus-project-passport', version: 1,
  exportedAt: '2026-11-02T00:00:00.000Z',
  project: {
    slug: 'AIME', name: 'AIME', stacks: ['nextjs', 'react', 'typescript'],
    description: 'Anime discovery game', brief: { status: 'parked', completed: 2, total: 17, parked: 2 },
    docs: [{ name: 'README.md', title: 'AIME' }],
  },
  designMemory: [{ id: 'black-hole', name: 'Black Hole', library: 'originkit', category: 'interactive', demoUrl: 'https://example.com', note: 'hero' }],
};

const ok = mod.validatePassport(passport);
expect('PP1: a valid passport is accepted and the slug is lowercased',
  ok.ok === true && ok.passport.project.slug === 'aime' && ok.passport.project.name === 'aime',
  JSON.stringify(ok));
expect('PP2: stacks, docs and design memory survive validation',
  ok.ok && ok.passport.project.stacks.length === 3 && ok.passport.project.docs.length === 1 && ok.passport.designMemory.length === 1,
  JSON.stringify(ok));
expect('PP3: a wrong kind/version is refused',
  mod.validatePassport({ kind: 'other', version: 1 }).ok === false && mod.validatePassport({ kind: 'olympus-project-passport', version: 2 }).ok === false,
  'a foreign file can enter the vault');
expect('PP4: an unsafe slug is refused',
  mod.validatePassport({ ...passport, project: { ...passport.project, slug: '../etc' } }).ok === false
    && mod.validatePassport({ ...passport, project: { ...passport.project, slug: '' } }).ok === false,
  'traversal or empty slug accepted');
const huge = mod.validatePassport({ ...passport, designMemory: Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, name: `R${i}` })) });
expect('PP5: design memory is capped at 200',
  huge.ok && huge.passport.designMemory.length === 200, 'unbounded memory');

const lib = fs.readFileSync(OLYMPUS + '/src/lib/project-passport.ts', 'utf-8');
const serialized = JSON.stringify(ok.ok ? ok.passport : {});
expect('PP6: the passport carries no absolute path',
  !serialized.includes('/home/') && !serialized.includes('\\Users\\') && !('path' in (ok.ok ? ok.passport.project : {})),
  'the home path leaks into the shared file');
const card = fs.readFileSync(OLYMPUS + '/src/components/olympus/project-profile-card.tsx', 'utf-8');
const switcher = fs.readFileSync(OLYMPUS + '/src/components/olympus/project-switcher.tsx', 'utf-8');
expect('PP7: the profile can share/export, the switcher can import',
  /projects\/export/.test(card) && /sharePassport/.test(card) && /download=/.test(card)
    && /projects\/import/.test(switcher) && /importPassport/.test(switcher),
  'the UI has no travel path');
expect('PP8: the import route refuses to overwrite an existing project',
  /already exists/.test(lib) && /getProject\(slug\)/.test(lib),
  'import can clobber a live project');

console.log(failures === 0 ? '\nproject-passport: all green.' : `\nproject-passport: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
