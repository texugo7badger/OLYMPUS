#!/usr/bin/env node
/**
 * live-preview-url.test.mjs — #202 editable Live Preview URL bar.
 * Run: npx tsx scripts/live-preview-url.test.mjs   (exit 0 = pass)
 *
 * Pins:
 *   1. normalizePreviewUrl — http(s) accepted, everything else refused with
 *      an honest error (empty, garbage, ftp, javascript, file).
 *   2. The pane renders an editable URL bar (Enter navigates, Escape resets),
 *      follows a pinned URL over the probe, persists it per project lane,
 *      and refuses invalid input inline instead of silently falling back.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
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
  const mod = await import(pathToFileURL(path.join(OLYMPUS, 'src/lib/live-preview-url.ts')).href + `?t=${Date.now()}`);
  const { normalizePreviewUrl } = mod;

  const http = normalizePreviewUrl('http://127.0.0.1:3001');
  expect('#202: a plain http origin is accepted and normalized',
    http.ok === true && http.url === 'http://127.0.0.1:3001/',
    JSON.stringify(http));

  const pathUrl = normalizePreviewUrl('  https://localhost:4000/dashboard?tab=2  ');
  expect('#202: https + path + query survive (trimmed)',
    pathUrl.ok === true && pathUrl.url === 'https://localhost:4000/dashboard?tab=2',
    JSON.stringify(pathUrl));

  const empty = normalizePreviewUrl('   ');
  expect('#202: an empty URL is refused honestly',
    empty.ok === false && /Enter a URL/.test(empty.error),
    JSON.stringify(empty));

  const garbage = normalizePreviewUrl('not a url');
  expect('#202: garbage is refused with the offending text',
    garbage.ok === false && /Not a valid URL/.test(garbage.error),
    JSON.stringify(garbage));

  for (const scheme of ['ftp://example.com', 'javascript:alert(1)', 'file:///etc/passwd']) {
    const bad = normalizePreviewUrl(scheme);
    expect(`#202: ${scheme.split(':')[0]}:// is refused`,
      bad.ok === false && /Only http:\/\/ and https:\/\//.test(bad.error),
      JSON.stringify(bad));
  }

  // ── Source pins: the pane's URL bar ──────────────────────────────────────
  const src = read('src/components/olympus/live-preview.tsx');
  expect('#202: the pane renders an editable URL bar',
    /aria-label="Preview URL"/.test(src)
    && /value=\{urlDraft\}/.test(src)
    && /onChange=\{\(e\) => \{ setUrlDraft/.test(src),
    'no editable URL input');
  expect('#202: Enter commits and Escape resets',
    /e\.key === 'Enter'.*commitUrl\(\)/.test(src)
    && /e\.key === 'Escape'.*resetUrl\(\)/.test(src),
    'keyboard contract missing');
  expect('#202: invalid input is refused inline, not silently navigated',
    /normalizePreviewUrl\(urlDraft\)/.test(src)
    && /setUrlError\(result\.error\)/.test(src)
    && /urlError && <div/.test(src),
    'errors never reach the user');
  expect('#202: the pinned URL wins over the probe and drives the frame',
    /const frameUrl = customUrl \?\? effectiveUrl/.test(src)
    && /src=\{frameUrl\}/.test(src)
    && /href=\{frameUrl\}/.test(src),
    'the frame ignores the bar');
  expect('#202: the choice persists per project lane and hydrates on mount',
    /olympus-live-preview-url:\$\{projectSlug \|\| 'default'\}/.test(src)
    && /localStorage\.getItem\(urlStorageKey\)/.test(src)
    && /localStorage\.setItem\(urlStorageKey, result\.url\)/.test(src),
    'a restart forgets the URL');
  expect('#202: reset returns to the probed origin and clears the pin',
    /localStorage\.removeItem\(urlStorageKey\)/.test(src)
    && /setCustomUrl\(null\)/.test(src),
    'no way back to the live probe');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
