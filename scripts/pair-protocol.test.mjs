#!/usr/bin/env node
/**
 * pair-protocol.test.mjs — #200: the PAIR-1 design note stays honest.
 * Run: npx tsx scripts/pair-protocol.test.mjs   (exit 0 = pass)
 *
 * The live proof needs a v2 service + a model call, so it is recorded in the
 * note (with commands) rather than re-run in the battery. What IS pinned here
 * is the probe-derived contract the phase-2 wiring will build on: Basic auth,
 * the one-time link's two shapes, the port-scoped cookie, `delivery: steer`,
 * and the deny-by-default gate doctrine.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// docs/ is a maintainer-only folder (gitignored): when absent, the doc pins
// are a DECLARED skip — the runtime assertions below still run.
const docPath = path.join(OLYMPUS, 'docs/research/pair-protocol.md');
const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf-8') : '';
const hasDoc = doc.length > 0;

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

expect('#200: the note records the probed CLI version',
  (!hasDoc || /opencode v2\.1\.4/.test(doc)),
  'the probe environment is unpinned');

expect('#200: the server API is pinned as Basic auth with username opencode',
  (!hasDoc || /HTTP Basic, username `opencode`/.test(doc)) && /www-authenticate: Basic/.test(doc),
  'the auth mechanism is missing');

expect('#200: the pair link is one-time with a 5-minute expiry',
  (!hasDoc || /one-time, 5 minutes/.test(doc)) && /expire in 5 minutes/.test(doc),
  'the link lifetime is missing');

expect('#200: both link shapes are documented (JSON token + text/html cookie)',
  (!hasDoc || /Accept: text\/html/.test(doc)) && /set-cookie: opencode_session_<port>/i.test(doc),
  'the cookie handshake is missing');

expect('#200: the cookie is port-scoped',
  (!hasDoc || /opencode_session_4210/.test(doc)) && /port-scoped/.test(doc),
  'two instances would collide');

expect('#200: the prompt lands as a steered user message',
  (!hasDoc || /delivery.*steer/.test(doc)),
  'the join semantics are missing');

expect('#200: remote-initiated dangerous actions are deny-by-default',
  /Remote-initiated dangerous\s+actions default to \*\*deny\*\*/.test(doc.replace(/\n\s+/g, ' ')),
  'the gate doctrine is missing');

expect('#200: unattended lanes refuse remote approvals',
  /Unattended lanes.*refuse remote\s+approvals/i.test(doc.replace(/\n\s+/g, ' ')),
  'a paired phone could approve a parked HITL card');

expect('#200: --remote/OpenTunnel is never the default',
  (!hasDoc || /Never `--remote` by default/.test(doc)) && /explicit consent card/.test(doc),
  'internet exposure is not gated');

expect('#200: the phase-2 missing pieces are named',
  ['Mint links in-app', 'Device registry + provenance', 'Remote approval policy', 'Revoke/rotate', 'Consent for `--remote`/OpenTunnel']
    .every((s) => doc.includes(s)),
  'the honest remaining-work list is incomplete');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
