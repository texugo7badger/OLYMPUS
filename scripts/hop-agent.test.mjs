#!/usr/bin/env node
/**
 * hop-agent.test.mjs — v0.0.31 (R31-09).
 *
 * The lean hop agent: a hop runs as `<god>-hop`, with file/shell tools only.
 * The full god keeps its 22 orchestration tools for the app's chat.
 *
 * Run: npx tsx scripts/hop-agent.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import {
  buildHopAgent,
  applyHopAgentVariants,
  isConfigSelectionError,
  resolveHopAgentId,
  HOP_TOOL_ALLOWLIST,
} from '../src/lib/hop-runtime/walker.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const base = {
  description: 'Frontend Strategist',
  mode: 'subagent',
  model: 'opencode-go/qwen3.7-plus',
  prompt: '{file:.opencode/prompts/agents/gods/athena.txt}',
  tools: {
    read: true, write: true, edit: true, bash: true, task: true,
    'olympus-dispatch': true, 'olympus-instinct-query': true,
    'symphony-resonate': true, 'symphony-decode': true,
  },
};

const hop = buildHopAgent('athena', base);

ok('the hop keeps the god prompt + model', () => {
  assert.equal(hop.prompt, base.prompt);
  assert.equal(hop.model, base.model);
});
ok('the hop is a subagent with a hop description', () => {
  assert.equal(hop.mode, 'subagent');
  assert.match(hop.description, /Hop executor for athena/);
});
ok('file/shell tools are on', () => {
  for (const t of HOP_TOOL_ALLOWLIST) assert.equal(hop.tools[t], true, t);
});
ok('orchestration tools are OFF (task/olympus/symphony)', () => {
  assert.equal(hop.tools.task, false);
  assert.equal(hop.tools['olympus-dispatch'], false);
  assert.equal(hop.tools['symphony-resonate'], false);
});
ok('the base god is not mutated', () => {
  assert.equal(base.tools.task, true);
  assert.equal(base.tools['olympus-dispatch'], true);
});
ok('a missing base returns null', () => assert.equal(buildHopAgent('athena', undefined), null));

const lane = mkdtempSync(join(tmpdir(), 'olympus-hopagent-'));
const cfgPath = join(lane, 'opencode.json');
writeFileSync(cfgPath, JSON.stringify({
  agent: { athena: base, hephaestus: { ...base, model: 'opencode-go/kimi-k2.7-code' } },
  plugin: ['./.opencode/olympus', './.opencode/plugin-dist/olympus-router'],
}, null, 2));

const first = applyHopAgentVariants(cfgPath);
ok('variants are created for every god', () => assert.equal(first.created, 2)); // the 2 gods, not the demigods
ok('the lane has athena-hop', () => {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
  assert.ok(cfg.agent['athena-hop']);
  assert.equal(cfg.agent['athena-hop'].tools.task, false);
});
ok('the overlay plugins stay in the lane (permission + router contract)', () => {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
  assert.equal(cfg.plugin.length, 2);
});
ok('a second apply is a no-op', () => assert.equal(applyHopAgentVariants(cfgPath).changed, false));
ok('resolveHopAgentId returns the variant', () => assert.equal(resolveHopAgentId('athena', lane), 'athena-hop'));
ok('an unknown god falls back to itself', () => assert.equal(resolveHopAgentId('callimachus', lane), 'callimachus'));

// ── R31-09: a config error is never rescued as a finished hop ────────────
ok('Agent not found is a config-selection error', () => {
  assert.equal(isConfigSelectionError({ error: 'Agent not found: "athena-hop"' }), true);
  assert.equal(isConfigSelectionError({ output: '{"type":"error","error":{"message":"Agent not found: \\"hermes-hop\\""}}' }), true);
});
ok('Model not found and unknown agent count too', () => {
  assert.equal(isConfigSelectionError({ error: 'Model not found: opencode-go/x' }), true);
  assert.equal(isConfigSelectionError({ error: 'unknown agent "nope"' }), true);
});
ok('an ordinary stream failure is not a config error', () => {
  assert.equal(isConfigSelectionError({ error: 'ceiling-kill (OLYMPUS_HOP_TIMEOUT_MS 1500000ms)' }), false);
  assert.equal(isConfigSelectionError({ error: '' }), false);
});
ok('the walker never artifact-rescues a config error (source pin)', () => {
  const src = readFileSync(new URL('../src/lib/hop-runtime/walker.ts', import.meta.url), 'utf-8');
  assert.match(src, /next\.kind !== 'script' && !isConfigSelectionError\(result\)/);
});
ok('the warm server reloads when the lane config mtime changes (source pin)', () => {
  const src = readFileSync(new URL('../src/lib/hop-runtime/warm-server.ts', import.meta.url), 'utf-8');
  assert.match(src, /currentMtime !== cached\.configMtimeMs/);
  assert.match(src, /configError[\s\S]{0,400}invalidateHopServer\(server\)/);
});

console.log(`\nhop-agent: ${passed} passed`);
