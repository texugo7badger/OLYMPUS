#!/usr/bin/env node
/**
 * design-builds.test.mjs — v0.0.32 (Epic P seed).
 * Pins the registry, the evidence join (hot/warm/cold), user builds and the
 * copyable prompt.
 * Run: npx tsx scripts/design-builds.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import {
  SEED_DESIGN_BUILDS, buildPrompt, mergeBuildStats, normalizeUserBuild, tierFor,
} from '../src/lib/design-builds.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('at least 10 seed builds, each with a god and signature', () => {
  assert.ok(SEED_DESIGN_BUILDS.length >= 10, String(SEED_DESIGN_BUILDS.length));
  for (const b of SEED_DESIGN_BUILDS) {
    assert.ok(b.god && b.signature && b.name, b.id);
    assert.ok(Array.isArray(b.skills) && Array.isArray(b.mcps) && Array.isArray(b.demigods), b.id);
  }
});

ok('tierFor: hot needs 5 samples at 0.8, warm 2 at 0.5', () => {
  assert.equal(tierFor(0.9, 5), 'hot');
  assert.equal(tierFor(0.9, 4), 'warm');
  assert.equal(tierFor(0.6, 2), 'warm');
  assert.equal(tierFor(0.4, 9), 'cold');
});

ok('the join counts successes/failures and ignores unknown', () => {
  const build = SEED_DESIGN_BUILDS.find((b) => b.id === 'hero-editorial');
  const rows = [
    { god: 'athena', skill: 'frontend-design', outcome: 'success', ts: '2026-11-01T10:00:00Z' },
    { god: 'athena', skill: 'frontend-design', outcome: 'success' },
    { god: 'athena', mcp: 'originkit', outcome: 'failure' },
    { god: 'athena', demigod: 'ui-designer', outcome: 'unknown' },
    { god: 'hephaestus', skill: 'frontend-design', outcome: 'success' }, // wrong god
  ];
  const [merged] = mergeBuildStats([build], rows);
  assert.equal(merged.stats.samples, 3);
  assert.equal(merged.stats.successes, 2);
  assert.equal(merged.stats.rate, Math.round(((2 + 1) / (3 + 2)) * 1000) / 1000);
  assert.equal(merged.stats.lastUsed, '2026-11-01T10:00:00Z');
});

ok('five successes promote a build to hot', () => {
  const build = SEED_DESIGN_BUILDS[0];
  const rows = Array.from({ length: 5 }, () => ({ god: build.god, skill: build.skills[0], outcome: 'success' }));
  const [merged] = mergeBuildStats([build], rows);
  assert.equal(merged.stats.tier, 'hot');
});

ok('with no evidence the seed tier stands (never a fake 0%)', () => {
  const build = SEED_DESIGN_BUILDS.find((b) => b.id === 'theme-system');
  const [merged] = mergeBuildStats([build], []);
  assert.equal(merged.stats.samples, 0);
  assert.equal(merged.stats.tier, build.tier);
});

ok('a user build is normalized and never marked seed', () => {
  const build = normalizeUserBuild({
    name: '  Pricing page ', god: 'ATHENA', signature: 'pricing plans',
    skills: ['frontend-design', '  ', 'color-expert'], mcps: ['originkit'], demigods: ['ui-designer'], note: 'try it',
  }, 1_800_000_000_000);
  assert.ok(build);
  assert.equal(build.source, 'user');
  assert.equal(build.name, 'Pricing page');
  assert.deepEqual(build.skills, ['frontend-design', 'color-expert']);
  assert.equal(build.tier, 'cold');
  assert.equal(normalizeUserBuild({ name: '', god: 'athena' }), null);
});

ok('the copyable prompt names the loadout and the evidence', () => {
  const build = SEED_DESIGN_BUILDS[0];
  const [merged] = mergeBuildStats([build], []);
  const prompt = buildPrompt(merged);
  assert.match(prompt, /# Build —/);
  assert.match(prompt, /skills: frontend-design/);
  assert.match(prompt, /mcps: originkit/);
  assert.match(prompt, /tier: /);
});

console.log(`\ndesign-builds: ${passed} passed`);
