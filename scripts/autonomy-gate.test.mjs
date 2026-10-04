#!/usr/bin/env node
/**
 * autonomy-gate.test.mjs — #64 deterministic fixture (BATCH 13).
 * Run: npx tsx scripts/autonomy-gate.test.mjs   (exit 0 = pass)
 *
 * The MODEL-behavior half of #64 (a no-questions prompt producing a first
 * artifact without an approval stop) is prompt-layer by design — this
 * fixture pins every DETERMINISTIC link in the chain:
 *   1. noQuestionsIntent: the pt-BR/en intent detector (positives +
 *      negatives — including the campaign prompt shapes verbatim).
 *   2. The strengthened UNATTENDED_DIRECTIVE carries the anti-escape clause
 *      targeting the observed failure shape (autoescola-veloz: "I'll
 *      present a design before implementing" + stop, 0 files, exit 0).
 *   3. The brainstorming SKILL.md carries the #64 sections: round cap by
 *      task scale, declared-defaults wording, no-questions parity, and the
 *      ABSOLUTE unattended override naming the failure shape.
 *   4. The apollo god prompt carries the round-cap + never-present-to-wait
 *      clause.
 * Live-behavior evidence for the directive itself is pre-existing:
 * 12b probe B5 ("HARD-GATE … explicitly overridden") and the 12c/12d probes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { readFileSync } from 'node:fs';
import { noQuestionsIntent, classifyTask } from '../src/lib/task-classifier';

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 160)}`);
  if (!cond) failures++;
}

// ── 1. Intent detector: campaign shapes + pt/en variants + negatives ──
const CAMPAIGN_RULE = 'Regras (autonomia total, sem perguntas):'; // verbatim from the BENCH-MADRUGA-1 prompt template
expect('campaign prompt shape (autonomia total, sem perguntas) detected', noQuestionsIntent(CAMPAIGN_RULE), CAMPAIGN_RULE);
expect('pt-BR: sem perguntas', noQuestionsIntent('Faça isso sem perguntas'), true);
expect('pt-BR: não me pergunte', noQuestionsIntent('não me pergunte nada, decida você'), true);
expect('en: no questions', noQuestionsIntent('build it, no questions asked'), true);
expect("en: don't ask me anything", noQuestionsIntent("just do it — don't ask me anything") === true, 'intent should fire');
expect('negative: plain request', noQuestionsIntent('Construa uma landing page para a padaria') === false, 'intent should NOT fire');
expect('negative: question the user asks', noQuestionsIntent('Posso te fazer uma pergunta?') === false, 'intent should NOT fire');

// ── 2. Strengthened UNATTENDED_DIRECTIVE (route.ts) ──
const route = readFileSync(new URL('../src/app/api/olympus/action/route.ts', import.meta.url), 'utf-8');
const directive = route.match(/const UNATTENDED_DIRECTIVE = \[([\s\S]*?)\]\.join/)?.[1] || '';
expect('directive: anti-escape clause present', /NEVER end your turn by presenting a design/.test(directive), 'missing anti-escape');
expect('directive: names the observed failure shape', /I\\?'ll present a design before implementing/.test(directive), 'missing failure-shape quote');
expect('directive: build-in-same-run requirement', /present the design AND build the deliverable in the SAME run/i.test(directive), 'missing same-run clause');
expect('route: unattended parity wired', /body\.unattended === true \|\| noQuestionsIntent\(text\)/.test(route), 'route not wired to intent');

// ── 3. Brainstorming SKILL.md sections ──
const skill = readFileSync(new URL('../.opencode/skills/superpowers/brainstorming/SKILL.md', import.meta.url), 'utf-8');
expect('SKILL: round cap section present', /Round Cap, Declared Defaults, and Unattended Override \(#64\)/.test(skill), 'missing section');
expect('SKILL: simple/trivial cap 1-2 rounds', /Simple\/trivial tasks.*1–2 question rounds/s.test(skill), 'missing simple cap');
expect('SKILL: declared-defaults wording', /Assuming X — correct me later/.test(skill), 'missing defaults wording');
expect('SKILL: no-questions parity', /No-questions parity \(#64\)/.test(skill), 'missing parity clause');
expect('SKILL: unattended is ABSOLUTE', /Unattended mode is ABSOLUTE/.test(skill), 'missing absolute override');
expect('SKILL: names the failure shape', /I\\?'ll present a design before implementing[\s\S]*zero files written/.test(skill), 'missing failure-shape evidence');

// ── 4. Apollo god prompt ──
const apollo = readFileSync(new URL('../.opencode/prompts/agents/gods/apollo.txt', import.meta.url), 'utf-8');
expect('apollo: #64 round cap present', /#64 round cap/.test(apollo), 'missing round cap');
expect('apollo: declare-and-proceed wording', /Assuming X — correct me later/.test(apollo), 'missing defaults');
expect('apollo: never present-to-wait clause', /NEVER presents a design only to wait/.test(apollo), 'missing never-wait');
expect('apollo: unattended marker honored', /OLYMPUS UNATTENDED MODE/.test(apollo), 'missing marker reference');

// ── 5. Campaign prompt classifies simple (the F-scenario class) ──
const cls = classifyTask('Projeto: [Autoescola Veloz] — autoescola com simulados online, Guarulhos-SP.');
expect('campaign-shape prompt classifies simple/trivial-adjacent', ['simple', 'moderate'].includes(cls.complexity), cls.complexity);

if (failures > 0) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log('\nAll #64 autonomy-gate fixture assertions passed');
process.exit(0);
