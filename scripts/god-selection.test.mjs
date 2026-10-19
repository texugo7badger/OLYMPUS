#!/usr/bin/env node
/**
 * god-selection.test.mjs — W-D1 MISSION-CONTROL-TRUE: the god the user CLICKS
 * stays marked. Run: npx tsx scripts/god-selection.test.mjs (exit 0 = pass)
 *
 * The user's specimen (the v0.0.6 premium pass): clicking a god in the LEFT
 * panel should mark the SELECTED god — but the row is always stuck on Apollo.
 * Root cause (the audit): the ActivityBar gods row highlights ONLY the
 * store's activeGod (live SSE telemetry that every chat submit hard-resets
 * to 'apollo'); the click does a drill-down but writes no selection state
 * (no selectedGod exists anywhere).
 *
 * The cure: a selectedGod store slice; the click WRITES it (toggle per the
 * Parthenon's own god-panel.tsx precedent); the highlight SPLITS — the gold
 * ring marks the user's SELECTION (persistent), the pulsing dot marks the
 * LIVE god; an empty-pane guard builds the god node when the graph hasn't
 * loaded; aria-pressed + title for a11y; the StatusBar fallback reads the
 * SELECTION (its comment always claimed it did).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

function main() {
  const storeSrc = read('src/lib/olympus-store.ts');
  const barSrc = read('src/components/olympus/activity-bar.tsx');
  const statusSrc = read('src/components/olympus/status-bar.tsx');

  // ── The store slice ──────────────────────────────────────────────────────
  expect('D1: the store carries a selectedGod slice (the user selection, distinct from activeGod)',
    /selectedGod: string \| null/.test(storeSrc) && /setSelectedGod: \(g: string \| null\) => void/.test(storeSrc),
    'no selectedGod state exists — the click has nothing to persist');
  expect('D1: the slice impl follows the house one-liner pattern',
    /setSelectedGod: \(g\) => set\(\{ selectedGod: g \}\)/.test(storeSrc),
    'the impl must mirror setActiveGod exactly');

  // ── The click WRITES the selection (toggle) ─────────────────────────────
  expect('D1: the god click writes the selection (setSelectedGod on click)',
    barSrc.includes('setSelectedGod('),
    'the click still only drills down — nothing marks the selected god');
  expect('D1: the selection toggles (second click clears — the Parthenon precedent)',
    /setSelectedGod\(isSelected \? null : id\)/.test(barSrc),
    'the click must toggle, never a one-way latch');

  // ── The highlight SPLITS: selection ring vs live pulse ────────────────────
  expect('D1: the highlight splits — isSelected (persistent ring) vs isActive (live pulse)',
    /const isSelected = selectedGod === id;/.test(barSrc) && /const isActive = activeGod === id;/.test(barSrc),
    'the row still reads ONLY activeGod — the Apollo-stuck root cause');
  expect('D1: the persistent ring keys on the SELECTION',
    /isSelected\s*\?\s*'bg-olympus-gold\/15 ring-1 ring-olympus-gold\/50'/.test(barSrc),
    'the gold ring must belong to the user selection');

  // ── The empty-pane guard ──────────────────────────────────────────────────
  expect('D1: the empty-pane guard — the click builds the god node when the graph is not loaded',
    /\?\? \{ id: `god:\$\{id\}`/.test(barSrc) || /\?\s*\{[^}]*god: id/.test(barSrc),
    'a click before graphData loads opens an empty god-detail pane (silent no-find)');

  // ── A11y: aria-pressed + the name rides the title ────────────────────────
  expect('D1: the god buttons carry aria-pressed (the selection state is announced)',
    /aria-pressed=\{isSelected\}/.test(barSrc),
    'the Parthenon cards have aria-pressed; the ActivityBar gods do not');

  // ── The StatusBar conflation cures ────────────────────────────────────────
  expect('D1: the StatusBar fallback reads the SELECTED god (its own comment, made true)',
    statusSrc.includes('selectedGod'),
    'status-bar.tsx claims "falls back to the selected god" but reads activeGod');

  if (failures > 0) { console.error(`\ngod-selection: ${failures} FAIL`); process.exit(1); }
  console.log('\ngod-selection: all green.');
}

main();
