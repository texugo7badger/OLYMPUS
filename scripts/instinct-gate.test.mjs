#!/usr/bin/env node
/**
 * instinct-gate.test.mjs — v0.0.53.
 *
 * The gate had three structural defects: god instincts carry `trigger` (not
 * `tags`), the score divided by max(query, instinct), and nothing consumed
 * `short_circuit`. This pins all three fixes with a real temp vault.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-instinct-vault-'));
process.env.OLYMPUS_VAULT_ROOT = vault;
const dir = path.join(vault, '05_Auto_Learning', 'instincts', 'hermes', 'seed');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'webhook-signatures.md'), `---
id: webhook-signatures
agent: hermes
scope: god
trigger: Hermes is implementing a webhook endpoint
action: Validate the webhook signature before touching the payload.
confidence: 0.95
type: seed
immutable: true
---

# webhook signatures
`);

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const gate = await import(OLYMPUS + '/.opencode/src/olympus-router/src/instinct-gate.ts');
expect('G-1: the threshold is the calibrated 0.60 floor', gate.CONFIDENCE_THRESHOLD === 0.6, gate.CONFIDENCE_THRESHOLD);

const exact = gate.queryInstincts('god', 'hermes', '[OLYMPUS-TASK] Hermes is implementing a webhook endpoint [/OLYMPUS-TASK]', 3);
expect('G-2: a trigger-only instinct matches (tags derived from trigger)',
  exact.matching_instinct?.id === 'webhook-signatures' && exact.confidence > 0,
  JSON.stringify(exact));
expect('G-3: a strong trigger coverage short-circuits',
  exact.short_circuit === true && exact.confidence >= 0.6,
  JSON.stringify({ c: exact.confidence, sc: exact.short_circuit }));
const unrelated = gate.queryInstincts('god', 'hermes', '[OLYMPUS-TASK] paint a sunset over the ocean [/OLYMPUS-TASK]', 3);
expect('G-4: an unrelated task does NOT short-circuit', unrelated.short_circuit === false && unrelated.confidence === 0, JSON.stringify(unrelated));
const oneWord = gate.queryInstincts('god', 'hermes', '[OLYMPUS-TASK] endpoint [/OLYMPUS-TASK]', 3);
expect('G-5: one generic hit is refused (min 2 / 50%)', oneWord.short_circuit === false, JSON.stringify(oneWord));

const v1 = fs.readFileSync(OLYMPUS + '/.opencode/src/olympus-router/v1.ts', 'utf-8');
expect('G-6: the hit is injected into the system prompt (consumed, not decorative)',
  /pendingInstinctHits/.test(v1) && /INSTINCT SHORT-CIRCUIT/.test(v1) && /output\.system\.push/.test(v1),
  'short_circuit still has no effect');
const walker = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/walker.ts', 'utf-8');
expect('G-7: the hop prompt marks its task for the gate',
  walker.includes('[OLYMPUS-TASK]') && walker.includes('[/OLYMPUS-TASK]'),
  'the gate still reads the whole contract');
const compiled = fs.readFileSync(OLYMPUS + '/.opencode/plugin-dist/olympus-router/src/instinct-gate.js', 'utf-8');
expect('G-8: the compiled plugin carries the fix',
  /coverage/.test(compiled) && /hits >= 2/.test(compiled),
  'OpenCode loads the old plugin-dist');

console.log(failures === 0 ? '\ninstinct-gate: all green.' : `\ninstinct-gate: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
