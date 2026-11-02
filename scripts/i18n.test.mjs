#!/usr/bin/env node
/**
 * i18n.test.mjs — v0.0.34: the language store is real and complete enough.
 * Run: npx tsx scripts/i18n.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { LANGUAGES, t, godName, godDomain, categoryName, searchTerms, languageInstruction } from '../src/lib/i18n.ts';

let pass = 0;
const ok = (name, fn) => { try { fn(); console.log('PASS ', name); pass += 1; } catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; } };

ok('seven languages are registered', () => {
  assert.equal(LANGUAGES.length, 7);
  assert.deepEqual(LANGUAGES.map((l) => l.id).sort(), ['de', 'en', 'es', 'fr', 'ja', 'pt-BR', 'zh'].sort());
});

ok('every language renders the visible surfaces (no raw keys)', () => {
  const keys = ['terminal.welcome1', 'settings.title', 'god.dispatches', 'studio.chat', 'studio.voicePolicy', 'learning.title', 'references.search', 'category.gallery'];
  for (const l of LANGUAGES) {
    for (const key of keys) {
      const value = t(key, l.id);
      assert.ok(value && value !== key, `${l.id} missing ${key}`);
    }
  }
});

ok('god names and domains localize', () => {
  assert.equal(godName('athena', 'pt-BR'), 'Atena');
  assert.equal(godName('hephaestus', 'pt-BR'), 'Hefesto');
  assert.match(godDomain('apollo', 'pt-BR'), /Planejamento/);
  assert.match(godName('athena', 'ja'), /アテナ/);
});

ok('reference categories localize and search understands PT', () => {
  assert.equal(categoryName('Image gallery', 'pt-BR'), 'galeria de imagens');
  const terms = searchTerms('galeria', 'pt-BR');
  assert.ok(terms.some((x) => x.includes('gallery')), JSON.stringify(terms));
  assert.ok(searchTerms('fundo', 'pt-BR').some((x) => x.includes('background')));
});

ok('the chat language instruction names the language', () => {
  assert.match(languageInstruction('pt-BR'), /Português/);
  assert.match(languageInstruction('ja'), /日本語/);
});

console.log(`\ni18n: ${pass} passed`);
