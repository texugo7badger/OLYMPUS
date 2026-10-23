#!/usr/bin/env node
/**
 * w5-ux-chat.test.mjs — W5 premium UX/chat wave regression suite (#204, #206, #207, #208, #210).
 * Run: npx tsx scripts/w5-ux-chat.test.mjs   (exit 0 = pass)
 *
 * Pins the five seams:
 *   #207 — the conversation LANGUAGE LAW: detection (script + marker scoring),
 *          sticky per-conversation state, and the directive riding every
 *          strategy block (all three call sites pass the raw user turn).
 *   #206 — @god addressing: the mention/free-text/structured precedence and
 *          the action route routing straight to the addressed god.
 *   #204 — HITL rider: Accept / Request different / Reject with an optional
 *          rider, persisted aliases, and an audible hitl-decision feed row.
 *   #210 — the chat queue: messages typed while a turn runs are queued,
 *          persisted per conversation, and posted FIFO when the turn ends.
 *   #208 — Athena's Design Studio: GET proposals (references/palettes/logos
 *          + saved), POST decision to <project>/design-decisions.jsonl.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}

async function main() {
  // ── Source pins ───────────────────────────────────────────────────────────
  const sessSrc = read('src/lib/opencode-session.ts');
  expect('#207: language detection + sticky state + directive are exported',
    /export function detectUserLanguage/.test(sessSrc)
    && /export function recordUserLanguage/.test(sessSrc)
    && /export function conversationLanguage/.test(sessSrc)
    && /export function languageDirective/.test(sessSrc),
    'the language seam is missing');
  expect('#207: the strategy block accepts the raw turn and appends the LANGUAGE LAW',
    /buildStrategyContextBlock\(opts\?: \{ sessionId\?: string \| null; userText\?: string \| null \}\)/.test(sessSrc)
    && /recordUserLanguage\(opts\?\.sessionId/.test(sessSrc)
    && /if \(directive\) lines\.push\(directive\)/.test(sessSrc),
    'the directive never reaches the model');
  expect('#207: every strategy-block call site passes sessionId + userText',
    (sessSrc.match(/buildStrategyContextBlock\(\{ sessionId: opts\.sessionId, userText: opts\.text \}\)/g) || []).length === 2
    && /buildStrategyContextBlock\(\{ sessionId: opts\.conversationId, userText: opts\.text \}\)/.test(read('src/app/api/olympus/action/route.ts')),
    'a call site lost the language context');

  const classifierSrc = read('src/lib/task-classifier.ts');
  expect('#206: @god + aliases + addressedGodFromText exist with structured precedence',
    /const AT_GOD_RE/.test(classifierSrc) && /const GOD_ALIAS_MAP/.test(classifierSrc)
    && /export function addressedGodFromText/.test(classifierSrc)
    && classifierSrc.indexOf('EXPLICIT_GOD_RE') < classifierSrc.indexOf('AT_GOD_RE')
    && classifierSrc.indexOf('AT_GOD_RE') < classifierSrc.indexOf('FREE_TEXT_REDIRECT_RE'),
    'the addressing precedence is broken');
  const actionSrc = read('src/app/api/olympus/action/route.ts');
  expect('#206: the action route routes to the addressed god and marks the turn',
    /directGod = action === 'prompt' \? addressedGodFromText\(text\) : null/.test(actionSrc)
    && /agent = directGod \?\? 'apollo'/.test(actionSrc)
    && /\[OLYMPUS-ADDRESS god=/.test(actionSrc),
    'the addressed god is ignored');

  const toastSrc = read('src/components/olympus/hitl-gate-toast.tsx');
  const gatesSrc = read('src/app/api/olympus/hitl/gates/route.ts');
  expect('#204: the HITL toast offers Accept / Request different / Reject with a rider',
    /riders/.test(toastSrc) && /Request different/.test(toastSrc) && /rider/.test(toastSrc),
    'the gate is still a binary approve/deny');
  expect('#204: the gates route aliases the three actions and persists the rider',
    /DECISION_ALIASES/.test(gatesSrc) && /'request-different': 'patch'/.test(gatesSrc)
    && /hitl-decision/.test(gatesSrc) && /rider: note \?\? null/.test(gatesSrc),
    'the decision/rider never lands on the feed');

  const termSrc = read('src/components/olympus/interactive-terminal.tsx');
  expect('#210: the chat queue exists and persists per conversation',
    /interface QueuedMessage/.test(termSrc) && /queuePausedRef/.test(termSrc)
    && /olympus-chat-queue:/.test(termSrc)
    && /restoreConversationId/.test(termSrc) && /persistConversationId/.test(termSrc),
    'messages typed during a turn are still lost');
  expect('#210: the queue posts FIFO when the turn ends and pauses on stop',
    /setQueued\(prev => \[/.test(termSrc) && /queuePausedRef\.current = true/.test(termSrc),
    'the queue never drains / never pauses');

  const studioSrc = read('src/app/api/olympus/design-studio/route.ts');
  const studioUiSrc = read('src/components/olympus/design-studio.tsx');
  expect('#208: the Design Studio route serves proposals + saved decisions',
    /filterReferences/.test(studioSrc) && /PALETTES/.test(studioSrc)
    && /LOGOS/.test(studioSrc) && /design-decisions\.jsonl/.test(studioSrc),
    'no proposal route');
  expect('#208: the Design Studio UI is wired into the terminal',
    /DesignStudio/.test(termSrc) && /Athena's Design Studio/.test(termSrc)
    && /references/.test(studioUiSrc) && /palettes/.test(studioUiSrc) && /logos/.test(studioUiSrc),
    'the proposals have no surface');

  // ── Functional: language (fresh module against a temp OLYMPUS_HOME) ──────
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-w5-home-'));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-w5-vault-'));
  fs.mkdirSync(path.join(vault, '05_Auto_Learning'), { recursive: true });
  fs.mkdirSync(path.join(vault, '06_Activity_Feed'), { recursive: true });
  fs.mkdirSync(path.join(vault, '02_Projects', 'aurora'), { recursive: true });
  process.env.OLYMPUS_HOME = home;
  process.env.OLYMPUS_VAULT = vault;
  const imp = (rel) => import(pathToFileURL(path.join(OLYMPUS, rel)).href + `?t=${Date.now()}-${Math.random()}`);

  const lang = await imp('src/lib/opencode-session.ts');
  expect('#207: pt-BR is detected from markers + diacritics',
    lang.detectUserLanguage('Olá, preciso de ajuda com o projeto e com o código') === 'pt',
    'pt not detected');
  expect('#207: non-Latin scripts are detected (kana → ja)',
    lang.detectUserLanguage('こんにちは、手伝ってください') === 'ja',
    'ja not detected');
  expect('#207: a short continuation turn keeps the sticky language (null)',
    lang.detectUserLanguage('ok') === null && lang.detectUserLanguage('s') === null,
    'a choice click would flip the language');
  expect('#207: an English prompt is detected as en',
    lang.detectUserLanguage('please fix this error in the project') === 'en',
    'en not detected');

  expect('#207: recordUserLanguage persists the sticky language',
    lang.recordUserLanguage('conv-1', 'preciso corrigir o erro do projeto') === 'pt'
    && lang.conversationLanguage('conv-1') === 'pt'
    && lang.conversationLanguage('conv-unknown') === 'pt',
    'the sticky record is missing');
  expect('#207: an undetected turn does not overwrite the sticky language',
    lang.recordUserLanguage('conv-1', 'ok') === 'pt' && lang.conversationLanguage('conv-1') === 'pt',
    'the sticky language was clobbered');
  expect('#207: the language state file is on disk',
    fs.existsSync(path.join(home, 'conversation-language.json'))
    && JSON.parse(fs.readFileSync(path.join(home, 'conversation-language.json'), 'utf-8')).bySession['conv-1'] === 'pt',
    'no persisted language state');

  const directive = lang.languageDirective('pt');
  expect('#207: the directive names the language and forbids switching',
    typeof directive === 'string' && directive.includes('LANGUAGE LAW') && directive.includes('Portuguese') && directive.includes('never switch to English'),
    directive);
  const block = lang.buildStrategyContextBlock({ sessionId: 'conv-2', userText: 'quero fazer uma tela nova' });
  expect('#207: the strategy block carries the LANGUAGE LAW for the turn',
    block.includes('LANGUAGE LAW') && block.includes('Portuguese'),
    'the model never sees the directive');
  expect('#207: the turn was recorded from the strategy block',
    lang.conversationLanguage('conv-2') === 'pt',
    'the block did not record the turn');

  // ── Functional: @god addressing ──────────────────────────────────────────
  const classifier = await imp('src/lib/task-classifier.ts');
  expect('#206: @athena addresses Athena',
    classifier.addressedGodFromText('@athena use a dark palette') === 'athena',
    'the mention was ignored');
  expect('#206: @Hefesto (alias, case-insensitive) addresses Hephaestus',
    classifier.addressedGodFromText('@Hefesto resolve the build') === 'hephaestus',
    'the alias was ignored');
  expect('#206: a structured godId wins over the mention',
    classifier.addressedGodFromText('godId=apollo @athena plan this') === 'apollo',
    'structured precedence broken');
  expect('#206: a free-text redirect addresses the god',
    classifier.addressedGodFromText('preciso falar com o Hefesto sobre o build') === 'hephaestus',
    'the redirect was ignored');
  expect('#206: a plain prompt addresses nobody',
    classifier.addressedGodFromText('build a react dashboard') === null,
    'a plain prompt was hijacked');

  // ── Functional: HITL gates (#204) ────────────────────────────────────────
  const gateFile = path.join(vault, '05_Auto_Learning', 'hitl-gates.json');
  fs.writeFileSync(gateFile, JSON.stringify({
    gates: [
      {
        id: 'gate-w5-1', phase: 'phase-2', action: 'Run migration',
        approvalPrompt: 'Confirm the migration?', createdAt: new Date().toISOString(),
        sessionId: 'conv-1', god: 'apollo', decision: null,
      },
      {
        id: 'gate-w5-2', phase: 'phase-3', action: 'Deploy',
        approvalPrompt: 'Confirm the deploy?', createdAt: new Date().toISOString(),
        sessionId: 'conv-1', god: 'apollo', decision: null,
      },
    ],
  }));
  const gates = await imp('src/app/api/olympus/hitl/gates/route.ts');
  const patchRes = await gates.POST({
    json: async () => ({ gateId: 'gate-w5-1', decision: 'request-different', rider: 'use a shadow instead of a border' }),
  });
  const patchBody = await patchRes.json();
  expect('#204: request-different maps to patch and echoes the rider',
    patchRes.status === 200 && patchBody.decision === 'patch' && patchBody.rider === 'use a shadow instead of a border',
    JSON.stringify(patchBody));
  expect('#204: the persisted gate carries the rider',
    JSON.parse(fs.readFileSync(gateFile, 'utf-8')).gates.find((g) => g.id === 'gate-w5-1').userNote === 'use a shadow instead of a border',
    'the rider was dropped');
  const acceptRes = await gates.POST({ json: async () => ({ gateId: 'gate-w5-2', decision: 'accept' }) });
  const acceptBody = await acceptRes.json();
  expect('#204: accept maps to approve',
    acceptRes.status === 200 && acceptBody.decision === 'approve',
    JSON.stringify(acceptBody));
  const badRes = await gates.POST({ json: async () => ({ gateId: 'gate-w5-2', decision: 'maybe' }) });
  expect('#204: an unknown decision is rejected (400)', badRes.status === 400, `status=${badRes.status}`);
  const feedRaw = fs.readFileSync(path.join(vault, '06_Activity_Feed', 'live.jsonl'), 'utf-8');
  const hitlRow = feedRaw.trim().split('\n').map((l) => JSON.parse(l)).find((r) => r.action === 'hitl-decision' && r.meta?.gateId === 'gate-w5-1');
  expect('#204: the refusal path is audible on the durable feed (decision + rider)',
    !!hitlRow && hitlRow.meta.decision === 'patch' && hitlRow.meta.rider === 'use a shadow instead of a border',
    'no hitl-decision feed row');

  // ── Functional: Design Studio (#208) ─────────────────────────────────────
  const studio = await imp('src/app/api/olympus/design-studio/route.ts');
  const allRes = await studio.GET({ url: 'http://localhost/api/olympus/design-studio?project=aurora' });
  const allBody = await allRes.json();
  expect('#208: GET returns the full proposal set (10 references, 5 palettes, 3 logos)',
    allBody.ok && allBody.references.length === 10 && allBody.palettes.length === 5 && allBody.logos.length === 3,
    `refs=${allBody.references?.length} palettes=${allBody.palettes?.length} logos=${allBody.logos?.length}`);
  const getRes = await studio.GET({ url: 'http://localhost/api/olympus/design-studio?project=aurora&query=pricing' });
  const getBody = await getRes.json();
  expect('#208: the query filters references toward the task (pricing first)',
    getBody.references[0]?.id === 'ref-pricing-anchor',
    getBody.references[0]?.id);
  const badKind = await studio.POST({ json: async () => ({ project: 'aurora', kind: 'vibes', decision: { id: 'x' } }) });
  expect('#208: an invalid kind is rejected (400)', badKind.status === 400, `status=${badKind.status}`);
  const traversal = await studio.POST({ json: async () => ({ project: '../evil', kind: 'palette', decision: { id: 'x' } }) });
  expect('#208: a path-traversal slug is rejected (400)', traversal.status === 400, `status=${traversal.status}`);
  const saveRes = await studio.POST({
    json: async () => ({
      project: 'aurora', kind: 'palette', conversationId: 'conv-1',
      decision: { id: 'pal-aurora-noir', name: 'Aurora Noir' },
    }),
  });
  const saveBody = await saveRes.json();
  expect('#208: a valid decision is appended to the project record',
    saveRes.status === 200 && saveBody.ok && saveBody.saved.kind === 'palette'
    && saveBody.saved.decision.name === 'Aurora Noir',
    JSON.stringify(saveBody));
  const decisionsFile = path.join(vault, '02_Projects', 'aurora', 'design-decisions.jsonl');
  expect('#208: the record file exists with the decision',
    fs.existsSync(decisionsFile) && fs.readFileSync(decisionsFile, 'utf-8').includes('Aurora Noir'),
    'the decision was not persisted');
  const reread = await studio.GET({ url: 'http://localhost/api/olympus/design-studio?project=aurora' });
  const rereadBody = await reread.json();
  expect('#208: a later GET re-serves the saved decision',
    rereadBody.saved.length === 1 && rereadBody.saved[0].decision.id === 'pal-aurora-noir',
    JSON.stringify(rereadBody.saved));
  const feedRows = fs.readFileSync(path.join(vault, '06_Activity_Feed', 'live.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  expect('#208: the saved decision lands on the activity feed',
    feedRows.some((r) => r.action === 'design-decision' && r.god === 'athena' && r.meta?.project === 'aurora'),
    'no design-decision feed row');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
