#!/usr/bin/env node
/**
 * theme-gallery.mjs — v0.0.33: one SVG card per theme preset (GitHub gallery).
 * Run: npx tsx scripts/theme-gallery.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { THEME_PRESETS, resolvePalette } from '../src/lib/theme.ts';

const OUT = path.join(process.cwd(), 'screenshots', 'themes');
mkdirSync(OUT, { recursive: true });

const card = (id, name, mode, p) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360" role="img" aria-label="OLYMPUS ${name} theme">
  <rect width="640" height="360" rx="18" fill="${p.bg}"/>
  <rect x="18" y="18" width="604" height="30" rx="8" fill="${p.panel}"/>
  <circle cx="34" cy="33" r="5" fill="${p.gold}"/>
  <text x="48" y="37" font-family="ui-monospace,monospace" font-size="12" fill="${p.text}">OLYMPUS · ${name}</text>
  <text x="560" y="37" font-family="ui-monospace,monospace" font-size="10" fill="${p.textDim}">${mode}</text>
  <rect x="18" y="60" width="180" height="282" rx="10" fill="${p.panel}"/>
  <rect x="210" y="60" width="412" height="160" rx="10" fill="${p.card}"/>
  <rect x="210" y="232" width="200" height="110" rx="10" fill="${p.card}"/>
  <rect x="422" y="232" width="200" height="110" rx="10" fill="${p.card}"/>
  <path d="M300 176 L326 112 L352 176 L338 176 L326 146 L314 176 Z" fill="${p.gold}"/>
  <circle cx="326" cy="96" r="4" fill="${p.purple}"/>
  <rect x="230" y="196" width="120" height="8" rx="4" fill="${p.gold}" opacity=".9"/>
  <rect x="230" y="210" width="70" height="5" rx="2.5" fill="${p.textDim}" opacity=".6"/>
  <rect x="228" y="248" width="80" height="7" rx="3" fill="${p.gold}"/>
  <rect x="228" y="262" width="120" height="5" rx="2.5" fill="${p.textDim}" opacity=".5"/>
  <rect x="440" y="248" width="80" height="7" rx="3" fill="${p.cyan}"/>
  <rect x="440" y="262" width="120" height="5" rx="2.5" fill="${p.textDim}" opacity=".5"/>
  <g>${['gold','amber','blue','green','purple','teal','red','cyan'].map((k, i) => `<rect x="${28 + (i % 4) * 42}" y="${90 + Math.floor(i / 4) * 26}" width="34" height="18" rx="4" fill="${p[k]}"/>`).join('')}</g>
  <text x="28" y="330" font-family="ui-monospace,monospace" font-size="9" fill="${p.textDim}">${id} · text ${p.text} · dim ${p.textDim}</text>
</svg>
`;

for (const preset of THEME_PRESETS) {
  const p = resolvePalette({ presetId: preset.id, mode: preset.mode, accent: null, iconId: 'classic', motion: 'full' });
  writeFileSync(path.join(OUT, `${preset.id}.svg`), card(preset.id, preset.name, preset.mode, p));
}
console.log(`theme-gallery: ${THEME_PRESETS.length} cards in screenshots/themes/`);
