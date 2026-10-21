#!/usr/bin/env node
/**
 * fetch-craft-logos.mjs — W-M CRAFT-VENDOR (v0.0.8): vendors the 13 Craft
 * App icons into public/craft-apps/logos/ — the official app icons, copied
 * unmodified from each app's repository (upstream: "The app icons of the
 * Craft apps are each app's own icon, copied unmodified from its
 * repository and licensed like that app" — MIT OR Apache-2.0) — plus the
 * official ArtCraft mark for the Studio card (the user's directive: use
 * their logo, unmodified, with the credit carried in CREDITS.md; the mark
 * remains an ArtCraft Team trademark — OLYMPUS uses it nominatively to
 * identify their product, never as an OLYMPUS mark).
 *
 *   node scripts/fetch-craft-logos.mjs          # fetch + verify
 *   node scripts/fetch-craft-logos.mjs --json   # machine-readable
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(OLYMPUS, 'public', 'craft-apps', 'logos');

const APPS = [
  'photocraft', 'vectorcraft', 'filmcraft', 'lightcraft', 'pdfcraft',
  'effectcraft', 'designcraft', 'figcraft', 'wordcraft', 'soundcraft',
  'deckcraft', 'cadcraft', 'gridcraft',
];

/** The upstream hicolor sizes, best first. */
const SIZES = ['128x128', '64x64'];

function iconUrl(app, size) {
  return `https://raw.githubusercontent.com/storytold/${app}/main/assets/app-icon/hicolor/${size}/apps/ai.storyteller.${app}.png`;
}

async function fetchLogo(app) {
  for (const size of SIZES) {
    try {
      const r = await fetch(iconUrl(app, size), { signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      // PNG magic — never commit a 404 page as a logo.
      if (buf.length < 100 || buf.readUInt32BE(0) !== 0x89504e47) continue;
      return { app, size, buf };
    } catch { /* try the next size */ }
  }
  return null;
}

async function main() {
  fs.mkdirSync(DEST, { recursive: true });
  const results = [];
  const queue = [...APPS];
  const worker = async () => {
    for (;;) {
      const app = queue.shift();
      if (!app) return;
      const got = await fetchLogo(app);
      if (got) {
        fs.writeFileSync(path.join(DEST, `${app}.png`), got.buf);
        results.push({ app, ok: true, size: got.size, bytes: got.buf.length });
      } else {
        results.push({ app, ok: false });
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  // W-M: the ArtCraft mark (the Studio card's logo — the user's directive,
  // used unmodified + credited; see CREDITS.md).
  try {
    const r = await fetch('https://getartcraft.com/artcraft-icon.svg', { signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (r.ok && text.trimStart().startsWith('<?xml') && text.includes('<svg')) {
      fs.writeFileSync(path.join(DEST, 'artcraft-icon.svg'), text);
      results.push({ app: 'artcraft-icon (the Studio card)', ok: true, bytes: text.length });
    } else {
      results.push({ app: 'artcraft-icon (the Studio card)', ok: false });
    }
  } catch {
    results.push({ app: 'artcraft-icon (the Studio card)', ok: false });
  }

  results.sort((a, b) => APPS.indexOf(a.app) - APPS.indexOf(b.app));
  const failed = results.filter((r) => !r.ok);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) console.log(`${r.ok ? 'OK  ' : 'MISS'} ${r.app}${r.ok ? ` (${r.size ?? 'svg'}, ${(r.bytes / 1024).toFixed(1)} KB)` : ' — no icon found upstream'}`);
    console.log(`craft-logos: ${results.length - failed.length}/${results.length} vendored → public/craft-apps/logos/`);
  }
  if (failed.length > 0) { console.error(`craft-logos: DOWN: ${failed.map((f) => f.app).join(', ')}`); process.exit(1); }
}

main().catch((e) => { console.error('fetch-craft-logos FAILED:', e); process.exit(1); });
