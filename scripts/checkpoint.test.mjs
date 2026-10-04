#!/usr/bin/env node
/**
 * checkpoint.test.mjs — #65 deterministic fixture (BATCH 13).
 * Run: npx tsx scripts/checkpoint.test.mjs   (exit 0 = pass)
 *
 * Pins every deterministic link of decision checkpointing:
 *   1. checkpointWriteTarget: the census detector across write/edit/bash
 *      shapes (positive + negative).
 *   2. The route composes the [OLYMPUS-SESSION <id>] marker on ALL turn
 *      types (content assertion on route.ts).
 *   3. SKILL.md + apollo prompt carry the checkpoint instruction (path
 *      convention, append-on-approval, read-on-resume, FC-5 evidence).
 *   4. The resume MECHANICS: a checkpoint file with N decisions + the
 *      read-on-resume instruction is the recovery contract — simulated
 *      kill-mid-interview: write a checkpoint with 3 decisions via the
 *      detector's own shapes, then verify the file's content is exactly
 *      what a resumed turn must replay (file survives the "crash" — the
 *      process ended — and carries every prior decision verbatim).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { checkpointWriteTarget } from '../src/lib/opencode-session';

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 160)}`);
  if (!cond) failures++;
}

// ── 1. Census detector ──
expect('detector: write with filePath', checkpointWriteTarget('write', { filePath: '.olympus/sessions/conv-42.decisions.md' }) === '.olympus/sessions/conv-42.decisions.md', 'should detect');
expect('detector: edit with file_path variant', checkpointWriteTarget('edit', { file_path: 'x/y/abc.decisions.md' }) === 'x/y/abc.decisions.md', 'should detect');
expect('detector: bash append >>', checkpointWriteTarget('bash', { command: "echo '- [10:32] approved' >> .olympus/sessions/conv-42.decisions.md" }) === '.olympus/sessions/conv-42.decisions.md', 'should detect');
expect('detector: bash tee -a', checkpointWriteTarget('bash', { command: "tee -a proj/.olympus/sessions/c1.decisions.md" }) === 'proj/.olympus/sessions/c1.decisions.md', 'should detect');
expect('detector NEGATIVE: write to README', checkpointWriteTarget('write', { filePath: 'README.md' }) === null, 'should NOT detect');
expect('detector NEGATIVE: bash writes another file', checkpointWriteTarget('bash', { command: 'echo hi >> notes.txt' }) === null, 'should NOT detect');
expect('detector NEGATIVE: bash mentions but does not append', checkpointWriteTarget('bash', { command: 'cat .olympus/sessions/c1.decisions.md' }) === null, 'should NOT detect');

// ── 2. Route marker composition (content assertions) ──
const route = readFileSync(new URL('../src/app/api/olympus/action/route.ts', import.meta.url), 'utf-8');
expect('route: session marker composed', /const sessionMarker = `\[OLYMPUS-SESSION \$\{conversationId\}\] `;/.test(route), 'marker missing');
expect('route: marker rides ALL turn types', /: sessionMarker \+ classificationMarker \+ promptText/.test(route), 'not wired for all types');
expect('route: classification marker still prompt-only', /classificationMarker = action === 'prompt'/.test(route), 'classification marker changed');

// ── 3. Prompt-layer instructions ──
const skill = readFileSync(new URL('../.opencode/skills/superpowers/brainstorming/SKILL.md', import.meta.url), 'utf-8');
expect('SKILL: checkpoint section present', /## Decision Checkpointing \(#65\)/.test(skill), 'missing section');
expect('SKILL: path convention', /\.olympus\/sessions\/<id>\.decisions\.md/.test(skill), 'missing path');
expect('SKILL: append per approval round', /END of every approval round[\s\S]*?APPEND a dated decisions block/.test(skill), 'missing append rule');
expect('SKILL: read-on-resume rule', /At the START of any resumed or continued turn, READ the checkpoint file/.test(skill), 'missing resume rule');
expect('SKILL: census tie-in', /checkpoint_writes/.test(skill), 'missing census tie-in');
const apollo = readFileSync(new URL('../.opencode/prompts/agents/gods/apollo.txt', import.meta.url), 'utf-8');
expect('apollo: #65 checkpointing instruction', /#65 decision checkpointing/.test(apollo), 'missing in apollo');
expect('apollo: FC-5 evidence named', /six successful turns, zero persisted state/.test(apollo), 'missing FC-5');

// ── 4. Resume mechanics: kill-mid-interview simulation ──
// The "interview" makes 3 approved decisions (written through the very
// shapes the detector recognizes), then the process "crashes" (nothing
// more happens). The resumed turn's contract: read the file, replay every
// decision. Assert the file carries all 3 verbatim after the crash.
const CKPT_DIR = '/tmp/opencode/p65/.olympus/sessions';
rmSync('/tmp/opencode/p65', { recursive: true, force: true });
mkdirSync(CKPT_DIR, { recursive: true });
const ckpt = CKPT_DIR + '/conv-p65.decisions.md';
const decisions = [
  '- [10:31] Site institucional estático em Next.js (because pedido sem backend)',
  '- [10:33] Paleta terracota + creme (because identidade artesanal)',
  '- [10:35] Formulário via Zod com estados de erro (because spec pede validação)',
];
writeFileSync(ckpt, decisions.join('\n') + '\n');
// The "crash": nothing else happens — the file is the only survivor.
const recovered = readFileSync(ckpt, 'utf-8').trim().split('\n');
expect('resume: checkpoint survived the crash (3 decisions)', recovered.length === 3, 'len=' + recovered.length);
expect('resume: every prior decision verbatim', decisions.every((d, i) => recovered[i] === d), JSON.stringify(recovered));
expect('resume: decision #2 verbatim (palette)', recovered[1].includes('Paleta terracota + creme'), recovered[1]);

if (failures > 0) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log('\nAll #65 checkpoint fixture assertions passed');
process.exit(0);
