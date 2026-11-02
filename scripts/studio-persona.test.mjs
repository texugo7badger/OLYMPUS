#!/usr/bin/env node
/**
 * studio-persona.test.mjs — v0.0.34: the gods answer, they do not echo.
 * Run: npx tsx scripts/studio-persona.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { godIntro, godFallback, godThanks, isIntroIntent, isThanksIntent } from '../src/lib/god-personas.ts';

let pass = 0;
const ok = (name, fn) => { try { fn(); console.log('PASS ', name); pass += 1; } catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; } };

ok('each god introduces itself in PT with its name and domain', () => {
  const intro = godIntro('athena', 'pt-BR');
  assert.match(intro, /Atena/);
  assert.match(intro, /Frontend e design/);
  assert.match(intro, /sem repetir/);
  assert.ok(!intro.includes('{'), intro);
});

ok('introductions localize (EN + JA)', () => {
  assert.match(godIntro('apollo', 'en'), /Apollo/);
  assert.match(godIntro('apollo', 'ja'), /アポロン/);
});

ok('the fallback never echoes the user message', () => {
  const text = godFallback('hephaestus', 'pt-BR', '4/38 hops');
  assert.match(text, /Hefesto/);
  assert.match(text, /4\/38 hops/);
  assert.ok(!/você perguntou|you asked|sua mensagem/i.test(text));
  assert.ok(!text.includes('{'));
});

ok('thanks and intent detection', () => {
  assert.match(godThanks('pt-BR'), /De nada/);
  assert.ok(isIntroIntent('quem é você?'));
  assert.ok(isIntroIntent('introduce yourself'));
  assert.ok(isThanksIntent('obrigado!'));
});

console.log(`\nstudio-persona: ${pass} passed`);
