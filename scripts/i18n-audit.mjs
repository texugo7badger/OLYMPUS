#!/usr/bin/env node
/**
 * i18n-audit.mjs — v0.0.76: the seven languages, key by key.
 *
 * OLYMPUS ships seven UI languages (en, pt-BR, es, fr, de, ja, zh) across
 * several dictionaries (core, extra west/east, mobile, studio, projects).
 * This audit answers one question per dictionary: does every language carry
 * every key? A missing key falls back to English at runtime — the user sees a
 * mixed UI and calls it a bug.
 *
 * Usage: npx tsx scripts/i18n-audit.mjs [--json]
 * Exit: 0 = complete; 1 = gaps (each one printed with the key).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { UI_DICTS } from '../src/lib/i18n-ui.ts';
import { EXTRA_DICTS } from '../src/lib/i18n-extra.ts';
import { EXTRA_DICTS_EAST } from '../src/lib/i18n-extra-east.ts';
import { MOBILE_DICTS } from '../src/lib/i18n-mobile.ts';
import { STUDIO_DICTS } from '../src/lib/i18n-studio.ts';
import { PROJECT_DICTS } from '../src/lib/i18n-projects.ts';
import { BASE_DICTS } from '../src/lib/i18n.ts';

const LANGS = ['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh'];
const DICTS = [
  ['ui', UI_DICTS],
  ['extra-west', EXTRA_DICTS],
  ['extra-east', EXTRA_DICTS_EAST],
  ['mobile', MOBILE_DICTS],
  ['studio', STUDIO_DICTS],
  ['projects', PROJECT_DICTS],
];

const json = process.argv.includes('--json');

// Mirror the RUNTIME composition exactly (src/lib/i18n.ts):
//   1. base en / pt-BR;
//   2. EXTRA_DICTS REPLACES the dict for es/fr/de/ja/zh;
//   3. UI + STUDIO + PROJECT merge on top;
//   4. mobile is its own lookup (MOBILE_DICTS), audited separately.
const core = {};
for (const lang of LANGS) core[lang] = { ...(BASE_DICTS[lang] ?? {}) };
for (const [lang, dict] of Object.entries(EXTRA_DICTS)) core[lang] = { ...dict };
for (const [lang, dict] of Object.entries(UI_DICTS)) core[lang] = { ...(core[lang] ?? BASE_DICTS.en), ...dict };
for (const [lang, dict] of Object.entries(STUDIO_DICTS)) core[lang] = { ...(core[lang] ?? BASE_DICTS.en), ...dict };
for (const [lang, dict] of Object.entries(PROJECT_DICTS)) core[lang] = { ...(core[lang] ?? BASE_DICTS.en), ...dict };

const allKeys = new Set();
for (const lang of LANGS) for (const k of Object.keys(core[lang] ?? {})) allKeys.add(k);
for (const k of Object.keys(MOBILE_DICTS.en ?? {})) allKeys.add(k);

const report = [];
let gaps = 0;
for (const lang of LANGS) {
  const missing = [...allKeys].filter((k) => !(k in (core[lang] ?? {})) && !(k in (MOBILE_DICTS[lang] ?? {})));
  report.push({ lang, keys: Object.keys(core[lang] ?? {}).length, mobile: Object.keys(MOBILE_DICTS[lang] ?? {}).length, missing });
  gaps += missing.length;
}

if (json) {
  console.log(JSON.stringify({ languages: LANGS, totalKeys: allKeys.size, report, gaps }, null, 2));
} else {
  console.log(`\ni18n audit — ${LANGS.length} languages · ${allKeys.size} keys (core + mobile)`);
  for (const row of report) {
    console.log(`  ${row.lang.padEnd(6)} core ${String(row.keys).padStart(3)} · mobile ${String(row.mobile).padStart(3)}${row.missing.length ? ` · ${row.missing.length} missing` : ' · complete'}`);
    if (row.missing.length && row.missing.length <= 12) console.log(`         ${row.missing.join(', ')}`);
  }
  console.log(`\n${gaps === 0 ? 'i18n: COMPLETE' : `i18n: ${gaps} gap(s)`}`);
}
process.exit(gaps === 0 ? 0 : 1);
