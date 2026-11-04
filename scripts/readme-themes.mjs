#!/usr/bin/env node
/**
 * readme-themes.mjs — v0.0.72: the theme gallery, generated from real shots.
 *
 * `scripts/capture-themes.cjs` writes screenshots/themes/<id>.png plus a
 * manifest. This script renders the manifest into the README's gallery block
 * (between the THEMES:GALLERY markers) and into screenshots/THEMES.md. The
 * gallery can never drift from the captures: no manifest entry, no card.
 *
 * Usage: node scripts/readme-themes.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'screenshots', 'themes', 'manifest.json');
const START = '<!-- THEMES:GALLERY:START -->';
const END = '<!-- THEMES:GALLERY:END -->';

let manifest = [];
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')); } catch { /* no captures yet */ }
if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error('readme-themes: no manifest — run `npx electron scripts/capture-themes.cjs` first.');
  process.exit(1);
}

const cell = (t) => {
  const alt = `${t.name} theme — OLYMPUS with a clean terminal`;
  return `<a href="${t.file}"><img src="${t.file}" width="420" alt="${alt}" /></a><br><sub><b>${t.name}</b> · ${t.mode}</sub>`;
};

const rows = [];
for (let i = 0; i < manifest.length; i += 3) {
  rows.push(`| ${manifest.slice(i, i + 3).map(cell).join(' | ')} |`);
}
const gallery = `| | | |\n|---|---|---|\n${rows.join('\n')}`;

// 1) README block
const readmeFile = path.join(ROOT, 'README.md');
const readme = fs.readFileSync(readmeFile, 'utf-8');
const a = readme.indexOf(START);
const b = readme.indexOf(END);
if (a < 0 || b < 0 || b < a) {
  console.error('readme-themes: README markers missing');
  process.exit(1);
}
const nextReadme = readme.slice(0, a + START.length) + '\n' + gallery + '\n' + readme.slice(b);
fs.writeFileSync(readmeFile, nextReadme);

// 2) screenshots/THEMES.md
const themesFile = path.join(ROOT, 'screenshots', 'THEMES.md');
const md = `# OLYMPUS themes — real screenshots

> v0.0.72 · ${manifest.length} themes, each captured from the running app with a
> clean terminal (a fresh session). Generated from
> \`screenshots/themes/manifest.json\` by \`scripts/readme-themes.mjs\` — the
> gallery cannot drift from the captures.

${gallery}

The **palette lab** generates all 14 colors of a family from a hue + harmony,
with contrast floors (text ≥ 7:1, dim ≥ 4.5:1, accent ≥ 3:1). Apply it and
every surface follows — including the OS icon.
`;
fs.writeFileSync(themesFile, md);

console.log(`readme-themes: ${manifest.length} themes rendered into README.md + screenshots/THEMES.md`);
