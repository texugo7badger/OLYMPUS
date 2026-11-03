#!/usr/bin/env node
/**
 * references-catalog.test.mjs — v0.0.52.
 *
 * The reference arsenal must be one card per real component: no duplicate id,
 * name or demo URL, every lane real, and Magic UI (MIT) included without
 * inventing a paid gate.
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

const { UI_REFERENCES, UI_REF_LIBRARIES, UI_REFERENCES_MARKER_BLOCK } = await import(OLYMPUS + '/src/lib/ui-references.ts');
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normUrl = (u) => String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/$/, '');

const byId = new Map();
const byName = new Map();
const byUrl = new Map();
for (const r of UI_REFERENCES) {
  (byId.get(r.id) ?? byId.set(r.id, []).get(r.id)).push(r.id);
  (byName.get(normName(r.name)) ?? byName.set(normName(r.name), []).get(normName(r.name))).push(r.id);
  const u = normUrl(r.demoUrl);
  if (u) (byUrl.get(u) ?? byUrl.set(u, []).get(u)).push(r.id);
}
const dups = (m) => [...m].filter(([, v]) => v.length > 1);

expect('REF-1: no duplicate ids', dups(byId).length === 0, JSON.stringify(dups(byId).slice(0, 5)));
expect('REF-2: no duplicate normalized names', dups(byName).length === 0, JSON.stringify(dups(byName).slice(0, 5)));
expect('REF-3: no duplicate demo URLs (the infinitegallery fix)', dups(byUrl).length === 0, JSON.stringify(dups(byUrl).slice(0, 5)));
expect('REF-4: the catalog carries Magic UI', UI_REFERENCES.some((r) => r.library === 'magicui') && UI_REFERENCES.filter((r) => r.library === 'magicui').length >= 24,
  `${UI_REFERENCES.filter((r) => r.library === 'magicui').length} magicui rows`);
expect('REF-5: Magic UI is declared MIT with no key/paid gate',
  UI_REF_LIBRARIES.some((l) => l.id === 'magicui' && /MIT/.test(l.license) && l.key === null),
  JSON.stringify(UI_REF_LIBRARIES.find((l) => l.id === 'magicui')));
expect('REF-6: the bounded marker names Magic UI',
  /magicui/.test(UI_REFERENCES_MARKER_BLOCK),
  'the design marker never offers the new lane');
expect('REF-7: every row is complete and points at a real http(s) lane',
  UI_REFERENCES.every((r) => r.id && r.name && r.what && r.category && /^https?:\/\//.test(r.demoUrl) && r.fetchLane),
  JSON.stringify(UI_REFERENCES.find((r) => !r.id || !r.name || !r.what || !/^https?:\/\//.test(r.demoUrl))));
const ui = fs.readFileSync(OLYMPUS + '/src/components/olympus/craft-apps-panel.tsx', 'utf-8');
expect('REF-8: the library filter exposes Magic UI',
  /'magicui'/.test(ui) && /Magic UI/.test(ui),
  'the catalog can hold it but the user cannot filter it');

console.log(failures === 0 ? `\nreferences-catalog: all green (${UI_REFERENCES.length} references).` : `\nreferences-catalog: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
