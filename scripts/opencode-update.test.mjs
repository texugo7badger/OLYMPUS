#!/usr/bin/env node
/**
 * opencode-update.test.mjs — #212 regression suite (the OLYMPUS-controlled
 * OpenCode v2 update lane).
 * Run: npx tsx scripts/opencode-update.test.mjs   (exit 0 = pass)
 *
 * Pins:
 *   - the manifest ships the LATEST v2 CLI (>= 2.1.4) and every spawn pins
 *     OPENCODE_DISABLE_AUTOUPDATE=1 (the CLI never replaces itself);
 *   - version comparison + installed/latest resolution are honest;
 *   - an unreachable registry reports `ok:false` (never "up to date");
 *   - the boot check route + the terminal badge exist and the badge renders
 *     only when an update is real;
 *   - the postinstall repairs the @opencode/cli stub (fresh installs work
 *     even when dependency scripts are disabled).
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
  // ── Source pins ───────────────────────────────────────────────────────────
  const manifest = JSON.parse(read('package.json'));
  const pinned = manifest.dependencies?.['@opencode/cli'] ?? '';
  expect('#212: the manifest pins the latest v2 CLI (>= 2.1.4)',
    /^\^?2\.(?:[1-9]|[1-9]\d)\.\d+/.test(pinned.replace(/^~/, '^')),
    pinned);
  expect('#212: @opencode/plugin rides the same lane',
    /^\^?2\.(?:[1-9]|[1-9]\d)\.\d+/.test(String(manifest.dependencies?.['@opencode/plugin'] ?? '').replace(/^~/, '^')),
    manifest.dependencies?.['@opencode/plugin']);

  const spawnSrc = read('src/lib/opencode-spawn.ts');
  expect('#212: EVERY spawned CLI carries OPENCODE_DISABLE_AUTOUPDATE=1',
    /env\.OPENCODE_DISABLE_AUTOUPDATE = '1'/.test(spawnSrc),
    'the one-shot lane could auto-update mid-run');
  expect('#212: the warm lane still pins the same switch',
    /OPENCODE_DISABLE_AUTOUPDATE: '1'/.test(read('src/lib/opencode-session.ts')),
    'the warm serve could replace itself');

  expect('#212: the update lib + route + badge exist',
    fs.existsSync(path.join(OLYMPUS, 'src/lib/opencode-update.ts'))
    && fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/opencode-update/route.ts'))
    && fs.existsSync(path.join(OLYMPUS, 'src/components/olympus/opencode-update-badge.tsx')),
    'missing update-lane files');
  const routeSrc = read('src/app/api/olympus/opencode-update/route.ts');
  expect('#212: the apply path is one command + repairs the stub',
    /@opencode\/cli@latest/.test(routeSrc) && /postinstall\.mjs/.test(routeSrc)
    && /OLYMPUS_DISABLE_SELF_UPDATE/.test(routeSrc),
    'the apply path is incomplete');
  expect('#212: the badge is wired into the terminal and renders only on a real update',
    /OpencodeUpdateBadge/.test(read('src/components/olympus/interactive-terminal.tsx'))
    && /if \(!status\?\.updateAvailable\) return null;/.test(read('src/components/olympus/opencode-update-badge.tsx')),
    'the update is never surfaced');
  expect('#212: the postinstall repairs the @opencode/cli stub',
    /postinstall did not run/.test(read('scripts/postinstall.js'))
    && /@opencode', 'cli', 'postinstall\.mjs/.test(read('scripts/postinstall.js')),
    'a scripts-disabled install leaves the 229-byte stub');

  // ── Functional: version math + installed resolution ──────────────────────
  const upd = await import(pathToFileURL(path.join(OLYMPUS, 'src/lib/opencode-update.ts')).href + `?t=${Date.now()}`);
  expect('#212: compareVersions orders 2.1.4 above 2.0.32',
    upd.compareVersions('2.1.4', '2.0.32') > 0 && upd.compareVersions('2.0.32', '2.1.4') < 0,
    'semver math broken');
  expect('#212: compareVersions treats equal versions as equal',
    upd.compareVersions('2.1.4', '2.1.4') === 0,
    'equal versions differ');
  expect('#212: a prerelease ranks below its release',
    upd.compareVersions('2.1.4', '2.1.4-beta.1') > 0,
    'prerelease ordering broken');

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-upd-'));
  fs.mkdirSync(path.join(fixture, 'node_modules', '@opencode', 'cli'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'node_modules', '@opencode', 'cli', 'package.json'), JSON.stringify({ version: '2.0.32' }));
  expect('#212: the installed version reads from node_modules',
    upd.readInstalledOpencodeVersion(fixture) === '2.0.32',
    upd.readInstalledOpencodeVersion(fixture));
  const manifestOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-upd-manifest-'));
  fs.writeFileSync(path.join(manifestOnly, 'package.json'), JSON.stringify({ dependencies: { '@opencode/cli': '^2.1.4' } }));
  expect('#212: the manifest is the fallback (the ^ is stripped)',
    upd.readInstalledOpencodeVersion(manifestOnly) === '2.1.4',
    upd.readInstalledOpencodeVersion(manifestOnly));

  // ── Functional: the registry check is honest ─────────────────────────────
  upd.resetOpencodeUpdateCache();
  const okFetch = async () => ({ ok: true, json: async () => ({ version: '2.1.4' }) });
  const available = await upd.checkOpencodeUpdate({ root: fixture, fetchImpl: okFetch, force: true });
  expect('#212: an older install reports an available update',
    available.ok && available.installed === '2.0.32' && available.latest === '2.1.4' && available.updateAvailable === true,
    JSON.stringify(available));
  const cached = await upd.checkOpencodeUpdate({ root: fixture, fetchImpl: okFetch });
  expect('#212: the check is memoized (source=cache)', cached.source === 'cache', cached.source);

  const sameFetch = async () => ({ ok: true, json: async () => ({ version: '2.0.32' }) });
  const current = await upd.checkOpencodeUpdate({ root: fixture, fetchImpl: sameFetch, force: true });
  expect('#212: an equal install reports NO update',
    current.ok && current.updateAvailable === false,
    JSON.stringify(current));

  const failingFetch = async () => { throw new Error('registry unreachable'); };
  const down = await upd.checkOpencodeUpdate({ root: fixture, fetchImpl: failingFetch, force: true });
  expect('#212: an unreachable registry is honest (ok:false, never "up to date")',
    down.ok === false && down.updateAvailable === false && down.latest === null && /unreachable/.test(down.error || ''),
    JSON.stringify(down));

  // ── Functional: the boot-check route ─────────────────────────────────────
  const realFetch = globalThis.fetch;
  const routeFetch = async () => ({ ok: true, json: async () => ({ version: '2.2.0' }) });
  globalThis.fetch = routeFetch;
  try {
    const route = await import(pathToFileURL(path.join(OLYMPUS, 'src/app/api/olympus/opencode-update/route.ts')).href + `?t=${Date.now()}`);
    const res = await route.GET({ url: 'http://localhost/api/olympus/opencode-update?force=1' });
    const body = await res.json();
    expect('#212: GET /api/olympus/opencode-update returns the lane status',
      res.status === 200 && body.ok === true && body.updateAvailable === true && body.installed,
      JSON.stringify(body));
    expect('#212: the route is never cached',
      /no-store/.test(res.headers.get('cache-control') || ''),
      res.headers.get('cache-control'));
  } finally {
    globalThis.fetch = realFetch;
  }

  // The shipped tree really runs the pinned v2 (not the stub, not the legacy CLI).
  const installed = upd.readInstalledOpencodeVersion(OLYMPUS);
  expect('#212: the installed CLI is the v2 lane at >= 2.1.4',
    !!installed && upd.compareVersions(installed, '2.1.4') >= 0,
    installed);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
