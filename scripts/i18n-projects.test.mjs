#!/usr/bin/env node
/**
 * i18n-projects.test.mjs — v0.0.49 (R49-03).
 *
 * The project surface must be complete in all seven languages, and the global
 * accessibility contract (reduced motion + visible focus) must exist.
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

const dicts = await import(OLYMPUS + '/src/lib/i18n-projects.ts');
const i18n = await import(OLYMPUS + '/src/lib/i18n.ts');
const langs = ['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh'];
const required = [
  'projects.stack', 'projects.brief', 'projects.pathMissing', 'projects.scope',
  'projects.instincts', 'projects.knowledge', 'projects.skills', 'projects.parkedAt',
  'projects.hops', 'projects.dirty', 'projects.clean', 'projects.statusRunning',
  'projects.statusParked', 'projects.statusDone', 'projects.statusIdle', 'references.critique',
];

for (const lang of langs) {
  const dict = dicts.PROJECT_DICTS[lang];
  const missing = required.filter((k) => !dict || typeof dict[k] !== 'string' || !dict[k].trim());
  expect(`I18N-${lang}: all ${required.length} project keys are present`, missing.length === 0, missing.join(', '));
}

expect('I18N-JA: the brief is Japanese, not an English fallback',
  i18n.t('projects.brief', 'ja') === 'プロジェクト概要', i18n.t('projects.brief', 'ja'));
expect('I18N-DE: the status is German',
  i18n.t('projects.statusParked', 'de') === 'angehalten', i18n.t('projects.statusParked', 'de'));
expect('I18N-ZH: critique is Chinese',
  i18n.t('references.critique', 'zh') === '点评', i18n.t('references.critique', 'zh'));
expect('I18N-ES: scope is Spanish',
  i18n.t('projects.scope', 'es') === 'alcance', i18n.t('projects.scope', 'es'));

const card = fs.readFileSync(OLYMPUS + '/src/components/olympus/project-profile-card.tsx', 'utf-8');
expect('I18N-UI: the profile labels all go through t()',
  /t\('projects\.brief'/.test(card) && /t\('projects\.scope'/.test(card) && /t\('projects\.statusRunning'/.test(card),
  'a hardcoded English label remains');

const css = fs.readFileSync(OLYMPUS + '/src/app/globals.css', 'utf-8');
expect('A11Y-1: prefers-reduced-motion disables decorative motion',
  /prefers-reduced-motion: reduce/.test(css) && /animation-duration: 0\.001ms/.test(css),
  'the host preference is ignored');
expect('A11Y-2: every interactive surface has a visible focus ring',
  /:focus-visible/.test(css) && /outline: 2px solid/.test(css),
  'keyboard focus can be invisible');

console.log(failures === 0 ? '\ni18n-projects: all green.' : `\ni18n-projects: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
