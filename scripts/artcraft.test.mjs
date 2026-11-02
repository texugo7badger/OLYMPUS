#!/usr/bin/env node
/**
 * artcraft.test.mjs — v0.0.32 (Epic Q).
 *
 * Pins the style contract: presets resolve to real hex, a user accent wins,
 * the prompt carries tokens + references (links, never assets), and the queue
 * item normalizes priority instead of trusting the wire.
 *
 * Run: npx tsx scripts/artcraft.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_TOKENS,
  STYLE_PRESETS,
  buildDesignMd,
  buildQueueItem,
  buildStylePrompt,
  normalizeStyleTokens,
  resolveColors,
} from '../src/lib/artcraft.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('every preset carries a full palette', () => {
  for (const [id, p] of Object.entries(STYLE_PRESETS)) {
    for (const key of ['bg', 'surface', 'accent', 'text', 'muted']) {
      assert.match(p.colors[key], /^#[0-9A-Fa-f]{6}$/, `${id}.${key}`);
    }
  }
});

ok('normalize keeps valid tokens and falls back on garbage', () => {
  const t = normalizeStyleTokens({ palette: 'technical', density: 'nope', radius: 'pill', motion: 'expressive' });
  assert.equal(t.palette, 'technical');
  assert.equal(t.density, DEFAULT_TOKENS.density);
  assert.equal(t.radius, 'pill');
  assert.equal(t.motion, 'expressive');
});

ok('a valid accent override wins; an invalid one is dropped', () => {
  assert.equal(resolveColors({ ...DEFAULT_TOKENS, accent: '#123ABC' }).accent, '#123ABC');
  assert.equal(normalizeStyleTokens({ accent: 'red' }).accent, undefined);
});

ok('the prompt names the project, the tokens and the rules', () => {
  const prompt = buildStylePrompt({ project: 'AIME', tokens: DEFAULT_TOKENS });
  assert.match(prompt, /# Design direction — AIME/);
  assert.match(prompt, /background: #0B0B0D/);
  assert.match(prompt, /accent: #D4A574/);
  assert.match(prompt, /motion: 120–180 ms/);
  assert.match(prompt, /no ad-hoc hex/);
});

ok('references are links with provenance, never copied assets', () => {
  const prompt = buildStylePrompt({
    project: 'AIME',
    tokens: DEFAULT_TOKENS,
    references: [{ name: 'Spotlight card', category: 'card', library: 'originkit', demoUrl: 'https://example.com/demo' }],
  });
  assert.match(prompt, /Spotlight card \(card · originkit\) — https:\/\/example\.com\/demo/);
  assert.match(prompt, /never clone the asset/);
});

ok('DESIGN.md carries the tokens JSON', () => {
  const md = buildDesignMd({ project: 'AIME', tokens: { ...DEFAULT_TOKENS, accent: '#123ABC' } });
  assert.match(md, /## Tokens JSON/);
  assert.match(md, /"accent": "#123ABC"/);
});

ok('the queue item normalizes priority and trims the title', () => {
  const item = buildQueueItem({
    project: 'aime',
    title: '  A very long design direction title that should be truncated to a sane length for the panel and the log  ',
    prompt: 'do the thing',
    tokens: DEFAULT_TOKENS,
    priority: 'urgent',
    now: 1_800_000_000_000,
    id: 'art-test',
  });
  assert.equal(item.priority, 'normal');
  assert.equal(item.id, 'art-test');
  assert.equal(item.status, 'queued');
  assert.ok(item.title.length <= 120);
});

ok('the queue item keeps known priorities and caps references', () => {
  const refs = Array.from({ length: 20 }, (_, i) => ({ name: `r${i}`, demoUrl: `https://example.com/${i}` }));
  const item = buildQueueItem({
    project: 'aime', title: 't', prompt: 'p', tokens: DEFAULT_TOKENS, references: refs, priority: 'now',
  });
  assert.equal(item.priority, 'now');
  assert.equal(item.references.length, 12);
});

console.log(`\nartcraft: ${passed} passed`);
