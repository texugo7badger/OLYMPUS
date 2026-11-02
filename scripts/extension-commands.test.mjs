#!/usr/bin/env node
/**
 * extension-commands.test.mjs — v0.0.46 (R46).
 *
 * The editor extension must carry the two new commands the roadmap asked for:
 * send-to-god (with real file/line/selection context, pasted by the user) and
 * live hop context (read-only). The VSIX must be buildable and include them.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(OLYMPUS, 'extensions/vscode-olympus');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const pkg = JSON.parse(fs.readFileSync(path.join(EXT, 'package.json'), 'utf-8'));
const src = fs.readFileSync(path.join(EXT, 'src/extension.ts'), 'utf-8');
const out = fs.readFileSync(path.join(EXT, 'out/extension.js'), 'utf-8');
const commands = (pkg.contributes?.commands ?? []).map((c) => c.command);

expect('E1: package.json contributes send-to-god and hop context',
  commands.includes('olympus.sendToGod') && commands.includes('olympus.showHopContext'),
  commands.join(', '));
expect('E2: send-to-god is in the editor context menu',
  (pkg.contributes?.menus?.['editor/context'] ?? []).some((m) => m.command === 'olympus.sendToGod'),
  'no right-click entry');
expect('E3: the context carries file, line and the selection',
  /asRelativePath\(doc\.uri\)/.test(src) && /sel\.start\.line \+ 1/.test(src) && /doc\.getText\(sel\)/.test(src),
  'the context is vague');
expect('E4: sending is NOT silent — clipboard + focus, the user pastes',
  /env\.clipboard\.writeText/.test(src) && /focus-olympus/.test(src) && /paste it in the OLYMPUS terminal/.test(src),
  'the extension sends without the user');
expect('E5: hop context reads the real run-state',
  /api\/olympus\/run-state/.test(src) && /inFlightList/.test(src) && /verdict/.test(src),
  'the hop context is decorative');
expect('E6: the compiled extension contains both commands',
  /olympus\.sendToGod/.test(out) && /olympus\.showHopContext/.test(out),
  'out/ is stale — run tsc');
expect('E7: the packaged VSIX exists at the current extension version',
  fs.existsSync(path.join(EXT, `olympus-bridge-${pkg.version}.vsix`)),
  `missing olympus-bridge-${pkg.version}.vsix`);

console.log(failures === 0 ? '\nextension-commands: all green.' : `\nextension-commands: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
