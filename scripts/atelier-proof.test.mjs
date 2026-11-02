#!/usr/bin/env node
/**
 * atelier-proof.test.mjs — v0.0.44 (R44-01).
 *
 * "Agents can reach the media" must be a proof, not a claim: the route opens
 * the newest asset, reports read/write honestly, names the MCPs that see the
 * vault and never fakes a green when the vault is empty.
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

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/atelier/proof/route.ts', 'utf-8');
const panel = fs.readFileSync(OLYMPUS + '/src/components/olympus/atelier-panel.tsx', 'utf-8');

expect('A1: the proof opens a real byte from the newest asset',
  /openSync\(newest\.path, 'r'\)/.test(route) && /readSync/.test(route),
  'the route never reads the asset');
expect('A2: ok requires readable AND a readable newest asset',
  /const ok = readable && newestReadable/.test(route),
  'ok can be true without proof');
expect('A3: read/write are checked separately and honestly',
  /fs\.constants\.R_OK/.test(route) && /fs\.constants\.W_OK/.test(route),
  'the access flags are guesses');
expect('A4: the response names the MCP lanes that see the vault',
  /'filesystem'/.test(route) && /'olympus-craft'/.test(route),
  'agent access does not name the lane');
expect('A5: the lanes carry the honest price posture',
  /pollinations[\s\S]{0,120}\$0/.test(route) && /BYOK/.test(route),
  'pricing is missing from the proof');
expect('A6: the Atelier renders the proof and can re-prove',
  /agent access/.test(panel) && /prove\(\)/.test(panel) && /atelier\/proof/.test(panel),
  'the proof is invisible');

console.log(failures === 0 ? '\natelier-proof: all green.' : `\natelier-proof: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
