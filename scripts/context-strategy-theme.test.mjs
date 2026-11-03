#!/usr/bin/env node
/**
 * context-strategy-theme.test.mjs — v0.0.54.
 * Pins the three user-visible fixes: ctx 0% on a model-null session, the
 * active strategy marking, and the light-theme brain contrast.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const O = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let f = 0; const ok = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + String(d).slice(0, 200)}`); if (!c) f++; };
const ctx = fs.readFileSync(O + '/src/app/api/olympus/context-usage/route.ts', 'utf-8');
ok('CTX-1: the message model is read when the session model is null', /d\?\.model/.test(ctx) && /if \(!model && d\?\.model\)/.test(ctx), 'model stays null');
ok('CTX-2: an unresolved window falls back to the active strategy terminal model', /llm-providers\.json/.test(ctx) && /terminalModel/.test(ctx) && /fallbackModel/.test(ctx), 'no fallback');
ok('CTX-3: no await inside the sync db reader', !/await import/.test(ctx), 'sync reader cannot await');
const settings = fs.readFileSync(O + '/src/components/olympus/settings-dialog.tsx', 'utf-8');
ok('STRAT-1: active strategy is visibly marked', /active: \{strategy\}/.test(settings) && /aria-pressed=\{isActive\}/.test(settings), 'the card can look wrong');
const palette = fs.readFileSync(O + '/src/lib/brain-atlas-palette.ts', 'utf-8');
ok('THEME-1: light palettes deepen semantic colors toward ink', /isLightHex/.test(palette) && /mixHex\(hex, fg, 0\.44\)/.test(palette), 'pastel-on-white can return');
ok('THEME-2: working-god signal colors use the same light-safe ramp', /themedGodSignalColors/.test(palette), 'signals stay pastel');
const brain = fs.readFileSync(O + '/src/components/olympus/brain-atlas-3d.tsx', 'utf-8');
ok('THEME-3: the brain uses the themed signal colors', /themedGodSignalColors\(\)/.test(brain), 'hardcoded signal palette');
console.log(f === 0 ? '\ncontext-strategy-theme: all green.' : `\ncontext-strategy-theme: ${f} failed.`); process.exit(f ? 1 : 0);
