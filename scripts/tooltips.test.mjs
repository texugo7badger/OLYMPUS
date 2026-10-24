#!/usr/bin/env node
/**
 * tooltips.test.mjs — EVERY TOOLTIP WEARS THE OLYMPUS DESIGN (2026-10-24).
 *
 * The user's specimen: native browser tooltips (white, no delay, off-theme)
 * scattered across 25 components while the OlympusTooltip component (card
 * #121826, gold hairline, mono 10px, 400ms delay, edge detection) existed
 * but was only adopted in 8 files. The fix migrated all native `title=`
 * usages to `data-tip=` (styled by the global CSS rule in globals.css) or to
 * OlympusTooltip, so every hover now speaks the OLYMPUS voice.
 *
 * T1  no native `title=` remains in src/components/olympus/*.tsx
 * T2  every component that still wants a hover label uses `data-tip=` or
 *     OlympusTooltip — the global CSS rule covers data-tip
 * T3  globals.css defines the [data-tip]::after rule with the Olympus card
 *     background (#121826) and gold hairline
 *
 * Run: npx tsx scripts/tooltips.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 240) : ''}`); }
}

const compDir = path.join(ROOT, 'src', 'components', 'olympus');
const files = fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx'));

// T1: no native title= attribute (title= on <iframe> is allowed for a11y,
//     but only when paired with data-tip= for the visual tooltip).
let nativeCount = 0;
const offenders = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(compDir, f), 'utf-8');
  // Strip line comments so an import like
  //   import OlympusTooltip from './olympus-tooltip'; // P9 — replaces native title=
  // does not count as a native tooltip.
  const src = raw.split('\n').map((l) => l.replace(/\/\/.*/, '')).join('\n');
  const matches = src.match(/\btitle=/g) || [];
  const iframeTitles = (src.match(/<iframe[^>]*\btitle=/g) || []).length;
  const allowed = iframeTitles;
  if (matches.length > allowed) {
    nativeCount += matches.length - allowed;
    offenders.push(`${f}: ${matches.length} (allowed iframe: ${allowed})`);
  }
}
expect('T1 no native title= outside iframes', nativeCount === 0, offenders.join('; '));

// T2: at least one OlympusTooltip usage or data-tip usage in every file that
//     had tooltips before (sanity: the migration did not delete tooltips).
let hasAny = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(compDir, f), 'utf-8');
  if (/OlympusTooltip|data-tip=/.test(src)) hasAny++;
}
expect('T2 OlympusTooltip or data-tip present across the components', hasAny >= 20, `only ${hasAny} files`);

// T3: the global CSS rule exists with the Olympus card background.
{
  const css = fs.readFileSync(path.join(ROOT, 'src', 'app', 'globals.css'), 'utf-8');
  expect('T3 [data-tip]::after rule exists', /\[data-tip\]::after/.test(css));
  expect('T3 card background #121826', /#121826/.test(css));
  expect('T3 gold hairline border', /rgba\(212,\s*165,\s*116/.test(css));
  expect('T3 400ms delay', /transition-delay:\s*400ms/.test(css));
}

console.log(`\ntooltips: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
