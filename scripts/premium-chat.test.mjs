#!/usr/bin/env node
/**
 * premium-chat.test.mjs — #203 premium chat surface regression suite.
 * Run: npx tsx scripts/premium-chat.test.mjs   (exit 0 = pass)
 *
 * Pins the four seams:
 *   1. Paragraph composer — a growing textarea (Enter sends, Shift+Enter
 *      inserts a newline, height capped so it never eats the transcript).
 *   2. Staged image attachments — the image button stages a chip instead of
 *      auto-sending a prompt; the image rides the next message (or queue).
 *   3. Persisted transcript — messages survive an app restart per
 *      conversation; object URLs are rebuilt from the on-disk path.
 *   4. Durable image serving — GET /api/olympus/image-upload?path=… serves
 *      only files under a reference-images/ directory.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}

async function main() {
  const termSrc = read('src/components/olympus/interactive-terminal.tsx');
  const routeSrc = read('src/app/api/olympus/image-upload/route.ts');

  // ── Source pins: composer ────────────────────────────────────────────────
  expect('#203: the composer is a growing textarea',
    /<textarea/.test(termSrc) && /rows=\{1\}/.test(termSrc)
    && /resize-none/.test(termSrc) && /max-h-48/.test(termSrc)
    && /scrollHeight, 192/.test(termSrc),
    'the composer is still a single-line input');
  expect('#203: Enter sends and Shift+Enter inserts a newline',
    /e\.key === 'Enter' && !e\.shiftKey/.test(termSrc)
    && /e\.preventDefault\(\)/.test(termSrc),
    'shift+enter semantics are missing');
  expect('#203: user text preserves paragraph breaks',
    /whitespace-pre-wrap/.test(termSrc),
    'multi-line user messages collapse into one line');

  // ── Source pins: staged image attachments ────────────────────────────────
  expect('#203: the image button stages instead of auto-submitting',
    /setPendingImage\(prev =>/.test(termSrc)
    && !/I uploaded a reference image at/.test(termSrc),
    'the upload still fires its own prompt');
  expect('#203: a staged-image chip is visible with a remove control',
    /attached — sends with your next message/.test(termSrc)
    && /removePendingImage/.test(termSrc),
    'no chip / remove path');
  expect('#203: the staged image rides the next prompt and the queue',
    /const attachedImage = image \?\? pendingImage \?\? undefined/.test(termSrc)
    && /image: attachedImage/.test(termSrc)
    && /submit\(next\.text, next\.context, next\.image\)/.test(termSrc),
    'the image never reaches the submitted message');
  expect('#203: the image prefix tells Apollo the on-disk path',
    /attachedImage\.filename/.test(termSrc) && /attachedImage\.savedPath/.test(termSrc),
    'Apollo never learns where the image lives');

  // ── Source pins: persisted transcript ────────────────────────────────────
  expect('#203: the transcript persists per conversation',
    /olympus-chat-messages:/.test(termSrc)
    && /function durableMessage/.test(termSrc)
    && /localStorage\.setItem\(messagesKeyFor/.test(termSrc),
    'a restart still wipes the transcript');
  expect('#203: hydration drops transient rows and rebuilds image URLs',
    /m\.type !== 'thinking' && m\.permissionState !== 'pending'/.test(termSrc)
    && /imagePath: m\.imageSavedPath \? imageUrlFor\(m\.imageSavedPath\)/.test(termSrc),
    'stale thinking/permission rows would be restored');
  expect('#203: a session reset drops the old transcript',
    /localStorage\.removeItem\(messagesKeyFor\(conversationIdRef\.current\)\)/.test(termSrc),
    'the old conversation leaks into the new one');

  // ── Functional: durable image serving ────────────────────────────────────
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-chat-img-'));
  const refDir = path.join(project, 'reference-images');
  fs.mkdirSync(refDir, { recursive: true });
  const imgPath = path.join(refDir, '2026-01-01T00-00-00-000Z-mock.png');
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  fs.writeFileSync(imgPath, bytes);
  const secretPath = path.join(project, 'secret.png');
  fs.writeFileSync(secretPath, Buffer.from('not-an-image'));

  const route = await import(pathToFileURL(path.join(OLYMPUS, 'src/app/api/olympus/image-upload/route.ts')).href + `?t=${Date.now()}`);

  const served = await route.GET({
    url: `http://localhost/api/olympus/image-upload?path=${encodeURIComponent(imgPath)}`,
  });
  const servedBuf = Buffer.from(await served.arrayBuffer());
  expect('#203: a saved reference image is served back with its MIME type',
    served.status === 200
    && served.headers.get('content-type') === 'image/png'
    && servedBuf.equals(bytes),
    `${served.status} ${served.headers.get('content-type')} ${servedBuf.length}B`);

  const blocked = await route.GET({
    url: `http://localhost/api/olympus/image-upload?path=${encodeURIComponent(secretPath)}`,
  });
  expect('#203: the route refuses files outside reference-images/',
    blocked.status === 404,
    `status ${blocked.status}`);

  const missing = await route.GET({
    url: `http://localhost/api/olympus/image-upload?path=${encodeURIComponent(path.join(refDir, 'gone.png'))}`,
  });
  expect('#203: a missing image is an honest 404',
    missing.status === 404,
    `status ${missing.status}`);

  const doc = await (await route.GET({ url: 'http://localhost/api/olympus/image-upload' })).json();
  expect('#203: GET without a path still documents the POST endpoint',
    doc.ok === true && doc.endpoint === 'POST /api/olympus/image-upload',
    JSON.stringify(doc).slice(0, 160));

  fs.rmSync(project, { recursive: true, force: true });

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
