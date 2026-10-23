#!/usr/bin/env node
/**
 * w4-dispatch-dna.test.mjs — W4 DISPATCH-DNA regression suite (#182-#187, #205).
 * Run: npx tsx scripts/w4-dispatch-dna.test.mjs   (exit 0 = pass)
 *
 * Pins the four seams the dispatch DNA wave repaired:
 *   #186 — the DNA was LOST in transit: the bus outcome payload carried no
 *          skill/mcp/tokens/duration, the delegation event stuffed the demigod
 *          into the god slot, and the live-usage join read `subagent` while
 *          the events carry `demigod`.
 *   #187 — the Arsenal Recon was composed into the task text and THROWN AWAY;
 *          now it rides the dispatch event as structured `arsenal_recon`.
 *   #182 — the dashboard had no single dispatch feed: the new route joins
 *          open registry + live feed + arsenal resonance.
 *   #183/#184/#185 — the panels now render the DNA (timeline chips, live
 *          demigod cards, terminal demigod blocks); #205 lights the atlas.
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
  // ── Source pins: the seams exist ──────────────────────────────────────────
  const trackerSrc = read('.opencode/olympus/lib/dispatch-tracker.ts');
  const pubBody = trackerSrc.slice(trackerSrc.indexOf('function publishOutcomeOnBus'));
  expect('#186: the bus outcome payload carries the full DNA',
    ['skill', 'mcp', 'instinctId', 'shortCircuited', 'tokens', 'toolCallCount', 'durationMs', 'findings']
      .every((k) => new RegExp(`${k}:`).test(pubBody)),
    'publishOutcomeOnBus still ships a DNA-less payload');
  expect('#186: the duplicate publishOutcomeOnBus call is gone (2 call sites: try + catch)',
    (trackerSrc.match(/publishOutcomeOnBus\(d, outcome, contractViolation\)/g) || []).length === 2,
    `call sites = ${(trackerSrc.match(/publishOutcomeOnBus\(d, outcome, contractViolation\)/g) || []).length}`);

  const sessSrc = read('src/lib/opencode-session.ts');
  expect('#186: the delegation event separates god from demigod (no god-slot poisoning)',
    /god: state\.god/.test(sessSrc) && /demigod: part\.agent/.test(sessSrc),
    'the delegation event still writes the demigod into the god slot');
  expect('#185: child sessions are discovered via parentID + agent',
    /childSessions\?\.set\(info\.id, info\.agent\)/.test(sessSrc) && /demigod_text/.test(sessSrc),
    'no child-session discovery → the terminal can never stream a demigod');

  const graphSrc = read('src/app/api/olympus/god/dispatch-graph/route.ts');
  expect('#186: the live-usage join reads demigod (with the legacy subagent fallback)',
    /ev\.demigod \?\? ev\.subagent/.test(graphSrc),
    'getLiveAgentUsage still reads only ev.subagent — every demigod looks idle');

  const dispatchSrc = read('.opencode/olympus/tools/dispatch.ts');
  expect('#187: the structured Arsenal Recon rides the dispatch event',
    /arsenal_recon: arsenalRecon \?\? null/.test(dispatchSrc) && /arsenalRecon: arsenalReconData/.test(dispatchSrc),
    'the recon is still discarded after being pasted into the task text');

  expect('#182: the dispatch-DNA route exists and serves open + recent + byGod + arsenal',
    /readOpenDispatches/.test(read('src/app/api/olympus/dispatches/route.ts'))
    && /byGod/.test(read('src/app/api/olympus/dispatches/route.ts'))
    && /readArsenal/.test(read('src/app/api/olympus/dispatches/route.ts')),
    'no single dispatch feed for the dashboard');

  const episodesSrc = read('src/app/api/olympus/episodes/route.ts');
  expect('#183: the episode mapping carries the dispatch DNA',
    /dispatchId: ev\.dispatch_id/.test(episodesSrc) && /skill: ev\.skill_equipped/.test(episodesSrc)
    && /durationMs: typeof ev\.duration_ms/.test(episodesSrc),
    'the timeline rows still drop the DNA');
  const timelineSrc = read('src/components/olympus/activity-timeline.tsx');
  expect('#183: the timeline renders the DNA chips (skill/mcp/instinct/tokens)',
    /skill/.test(timelineSrc) && /shortCircuited/.test(timelineSrc) && /tokens/.test(timelineSrc),
    'the DNA never reaches a visible chip');

  const sheetSrc = read('src/lib/tasks-sheet.ts');
  expect('#184: the tasks sheet joins dispatch + outcome by dispatch_id into DemigodLive records',
    /export interface DemigodLive/.test(sheetSrc) && /outcomes\.get\(String\(dispatchId\)\)/.test(sheetSrc),
    'the Parthenon has no per-demigod live records');
  const panelSrc = read('src/components/olympus/god-panel.tsx');
  expect('#184: the god panel renders live demigod cards with status + tokens',
    /DemigodLive/.test(panelSrc) && /demigod/.test(panelSrc) && /status/.test(panelSrc),
    'the chips are still static names');

  const termSrc = read('src/components/olympus/interactive-terminal.tsx');
  expect('#185: the terminal streams demigod_text and closes on demigod_done',
    /demigod_text/.test(termSrc) && /demigod_done/.test(termSrc) && /GOD_NAMES\[god\]/.test(termSrc),
    'no demigod streaming block in the terminal');

  const brainSrc = read('src/lib/olympus.ts');
  const adapterSrc = read('src/lib/olympus-brain-adapter.ts');
  const hookSrc = read('src/lib/use-dispatch-dna.ts');
  const atlasSrc = read('src/components/olympus/brain-atlas-3d.tsx');
  expect('#205: MCP satellites exist in the brain graph',
    /'mcp'/.test(brainSrc) && /COLORS\.mcp/.test(brainSrc) && /mcp.*parietal/.test(adapterSrc),
    'the MCP lobe is missing');
  expect('#205: the atlas glows the live dispatch DNA',
    /useDispatchDna/.test(hookSrc) && /useDispatchDna/.test(atlasSrc) && /setWorkingGods/.test(atlasSrc),
    'the atlas never sees a live dispatch');

  // ── Functional: the route joins the three on-disk sources ─────────────────
  const NOW = Date.now();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-w4-home-'));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-w4-vault-'));
  fs.mkdirSync(path.join(vault, '06_Activity_Feed'), { recursive: true });
  fs.mkdirSync(path.join(vault, '03_Index'), { recursive: true });
  fs.mkdirSync(path.join(vault, '02_Projects', 'aurora'), { recursive: true });

  const iso = (ms) => new Date(ms).toISOString();
  fs.writeFileSync(path.join(home, 'dispatch-state.json'), JSON.stringify({
    openDispatches: [
      {
        dispatchId: 'd-open-1', god: 'hephaestus', demigod: 'build-resolver',
        instinctId: 'seed-1', shortCircuited: true, skill: 'go-patterns', mcp: 'github',
        taskSignature: 'build the auth module', classificationId: 'cls-9',
        findingsSummary: null, budgetTokens: null, outputShape: null, stack: 'go',
        project: 'aurora', directiveHash: 'abc123', expectedArtifacts: null,
        doneCondition: null, status: 'open', startTs: iso(NOW - 120_000),
        tokensUsed: { input: 1200, output: 340 }, hadError: false, toolCallCount: 7,
      },
      {
        dispatchId: 'd-open-2', god: 'hephaestus', demigod: 'code-verifier',
        instinctId: null, shortCircuited: false, skill: 'go-review', mcp: null,
        taskSignature: 'review the auth module', classificationId: null,
        findingsSummary: null, budgetTokens: null, outputShape: null, stack: 'go',
        project: 'aurora', directiveHash: 'def456', expectedArtifacts: null,
        doneCondition: null, status: 'open', startTs: iso(NOW - 30_000),
        tokensUsed: { input: 80, output: 10 }, hadError: false, toolCallCount: 1,
      },
    ],
  }));
  const feedRows = [
    {
      ts: iso(NOW - 600_000), god: 'athena', action: 'symphony-dispatch',
      task_signature: 'build the ui kit', demigod: 'ui-designer',
      skill_equipped: 'design-system', mcp_enabled: 'figma', instinct_id: null,
      short_circuited: false, classification_id: 'cls-3', dispatch_id: 'd-done-1',
      status: 'dispatched',
      arsenal_recon: {
        suggestedSkills: [{ skill: 'design-system', confidence: 0.87, samples: 12 }],
        suggestedMcps: [], suggestedDemigods: [{ demigod: 'ui-designer', confidence: 0.91, samples: 8 }],
        quickCircuit: false, coherence: 0.4,
      },
    },
    {
      ts: iso(NOW - 300_000), god: 'athena', action: 'dispatch_outcome',
      demigod: 'ui-designer', dispatch_id: 'd-done-1', status: 'success',
      outcome: 'success', duration_ms: 300_000,
      tokens_used: { input: 5000, output: 1500 }, tool_call_count: 22,
      findings_summary: 'shipped the kit',
    },
    {
      ts: iso(NOW - 25 * 60 * 60 * 1000), god: 'athena', action: 'symphony-dispatch',
      task_signature: 'stale work', demigod: 'ui-designer', dispatch_id: 'd-stale',
      status: 'dispatched',
    },
    {
      ts: iso(NOW - 90_000), god: 'hephaestus', action: 'symphony-dispatch',
      task_signature: 'sheet done hop', demigod: 'build-resolver',
      skill_equipped: 'go-patterns', mcp_enabled: null, dispatch_id: 'd-sheet-1',
      status: 'dispatched',
    },
    {
      ts: iso(NOW - 80_000), god: 'hephaestus', action: 'dispatch_outcome',
      demigod: 'build-resolver', dispatch_id: 'd-sheet-1', status: 'success',
      outcome: 'success', duration_ms: 60_000,
      tokens_used: { input: 300, output: 900 }, tool_call_count: 4,
    },
    {
      ts: iso(NOW - 20_000), god: 'hephaestus', action: 'symphony-dispatch',
      task_signature: 'sheet running hop', demigod: 'code-verifier',
      skill_equipped: 'go-review', mcp_enabled: null, dispatch_id: 'd-sheet-2',
      status: 'dispatched',
    },
    {
      ts: iso(NOW - 40_000), god: 'athena', action: 'symphony-dispatch',
      task_signature: 'sheet broken hop', demigod: 'ui-designer',
      skill_equipped: 'design-system', dispatch_id: 'd-sheet-3', status: 'dispatched',
    },
    {
      ts: iso(NOW - 35_000), god: 'athena', action: 'dispatch_outcome',
      demigod: 'ui-designer', dispatch_id: 'd-sheet-3', status: 'failure',
      outcome: 'failure', duration_ms: 5000,
      tokens_used: { input: 40, output: 5 }, tool_call_count: 1,
    },
  ];
  fs.writeFileSync(path.join(vault, '06_Activity_Feed', 'live.jsonl'), feedRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(vault, '03_Index', 'arsenal-resonance.jsonl'), [
    { skill: 'design-system', mcp: 'figma', demigod: 'ui-designer', outcome: 'success' },
    { skill: 'design-system', mcp: 'figma', demigod: 'ui-designer', outcome: 'success' },
    { skill: 'go-patterns', mcp: null, demigod: 'build-resolver', outcome: 'success' },
    { skill: 'go-patterns', mcp: null, demigod: 'build-resolver', outcome: 'failure' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');

  fs.writeFileSync(path.join(vault, '02_Projects', 'aurora', 'dispatch-plan.json'), JSON.stringify({
    version: 1, laneRoot: path.join(vault, '02_Projects', 'aurora'),
    hops: [
      { id: 'h1', god: 'hephaestus', prompt: 'build the auth module', artifacts: [], after: [] },
      { id: 'h2', god: 'athena', prompt: 'the ui kit', artifacts: [], after: ['h1'] },
    ],
  }));
  fs.writeFileSync(path.join(vault, '02_Projects', 'aurora', '.olympus-hop-state.json'), JSON.stringify({
    version: 1, completed: [], parked: null,
    inFlight: [{ hopId: 'h1', startedAt: iso(NOW - 60_000) }],
    updatedAt: iso(NOW - 60_000),
  }));

  process.env.OLYMPUS_HOME = home;
  process.env.OLYMPUS_VAULT = vault;
  const imp = (rel) => import(pathToFileURL(path.join(OLYMPUS, rel)).href + `?t=${Date.now()}`);

  const route = await imp('src/app/api/olympus/dispatches/route.ts');
  const res = await route.GET({ url: 'http://localhost/api/olympus/dispatches?limit=120' });
  const body = await res.json();

  const open1 = (body.open || []).find((r) => r.dispatchId === 'd-open-1');
  expect('#182: an OPEN registry row carries its full DNA (camelCase shape)',
    open1 && open1.skill === 'go-patterns' && open1.mcp === 'github'
    && open1.instinct === 'seed-1' && open1.shortCircuited === true
    && open1.classificationId === 'cls-9' && open1.task === 'build the auth module'
    && open1.tokens?.total === 1540 && open1.toolCalls === 7
    && open1.ageMs >= 119_000 && open1.status === 'open',
    `open1 = ${JSON.stringify(open1 && { skill: open1.skill, mcp: open1.mcp, instinct: open1.instinct, tokens: open1.tokens, toolCalls: open1.toolCalls, ageMs: open1.ageMs })}`);
  expect('#182: two open demigods under one god are marked PARALLEL',
    (body.open || []).length === 2 && body.open.every((r) => r.parallel === true),
    `open = ${JSON.stringify((body.open || []).map((r) => ({ id: r.dispatchId, parallel: r.parallel })))}`);

  const done1 = (body.recent || []).find((r) => r.dispatchId === 'd-done-1');
  expect('#182: a finished row joins the outcome (verdict + cost + findings)',
    done1 && done1.status === 'success' && done1.durationMs === 300_000
    && done1.tokens?.input === 5000 && done1.tokens?.output === 1500
    && done1.toolCalls === 22 && done1.findings === 'shipped the kit',
    `done1 = ${JSON.stringify(done1 && { status: done1.status, durationMs: done1.durationMs, tokens: done1.tokens, toolCalls: done1.toolCalls })}`);
  expect('#187: the row serves the structured Arsenal Recon it was dispatched with',
    done1?.arsenalRecon?.skills?.[0]?.skill === 'design-system'
    && done1.arsenalRecon.skills[0].confidence === 0.87
    && done1.arsenalRecon.skills[0].samples === 12
    && done1.arsenalRecon.demigods?.[0]?.demigod === 'ui-designer'
    && done1.arsenalRecon.coherence === 0.4,
    `arsenalRecon = ${JSON.stringify(done1?.arsenalRecon)}`);
  expect('#182: the 24h window drops stale dispatches',
    !(body.recent || []).some((r) => r.dispatchId === 'd-stale'),
    'a >24h dispatch leaked into recent');
  expect('#182: byGod aggregates open + recent demigods per god',
    body.byGod?.hephaestus?.open === 2 && body.byGod?.athena?.recent === 2
    && body.byGod?.hephaestus?.demigods?.includes('build-resolver'),
    `byGod = ${JSON.stringify(body.byGod)}`);
  expect('#182: the arsenal aggregate ranks by confidence then samples',
    body.arsenal?.skills?.[0]?.name === 'design-system' && body.arsenal.skills[0].confidence === 1
    && body.arsenal.skills[0].samples === 2
    && body.arsenal.skills.find((s) => s.name === 'go-patterns')?.confidence === 0.5,
    `arsenal.skills = ${JSON.stringify(body.arsenal?.skills)}`);

  const filtered = await (await route.GET({ url: 'http://localhost/api/olympus/dispatches?god=athena&limit=1' })).json();
  expect('#182: god + limit filters narrow the feed',
    (filtered.open || []).length === 0 && (filtered.recent || []).length === 1
    && filtered.recent[0].god === 'athena' && !filtered.byGod?.hephaestus,
    `filtered = ${JSON.stringify({ open: filtered.open?.length, recent: filtered.recent?.length, byGod: filtered.byGod })}`);

  // ── #183: episodes carry the DNA to the timeline ──────────────────────────
  const episodesRoute = await imp('src/app/api/olympus/episodes/route.ts');
  const eps = await (await episodesRoute.GET()).json();
  const dispatchEp = (eps.episodes || []).find((e) => e.dispatchId === 'd-done-1' && e.action === 'symphony-dispatch');
  const outcomeEp = (eps.episodes || []).find((e) => e.dispatchId === 'd-done-1' && e.action === 'dispatch_outcome');
  expect('#183: the dispatch episode carries skill/mcp/instinct + demigod',
    dispatchEp && dispatchEp.skill === 'design-system' && dispatchEp.mcp === 'figma'
    && dispatchEp.demigod === 'ui-designer' && dispatchEp.type === 'delegation',
    `dispatchEp = ${JSON.stringify(dispatchEp && { skill: dispatchEp.skill, mcp: dispatchEp.mcp, demigod: dispatchEp.demigod })}`);
  expect('#183: the outcome episode carries tokens + duration + tool calls',
    outcomeEp && outcomeEp.tokens?.input === 5000 && outcomeEp.tokens?.output === 1500
    && outcomeEp.durationMs === 300_000 && outcomeEp.toolCalls === 22,
    `outcomeEp = ${JSON.stringify(outcomeEp)}`);

  // ── #184: the Parthenon cards join dispatch + outcome ─────────────────────
  const { buildTasksSheet } = await imp('src/lib/tasks-sheet.ts');
  const sheet = buildTasksSheet({ lane: path.join(vault, '02_Projects', 'aurora'), feedPath: path.join(vault, '06_Activity_Feed', 'live.jsonl'), now: NOW });
  const hephCards = sheet.gods?.hephaestus?.demigods || [];
  const athenaCards = sheet.gods?.athena?.demigods || [];
  const runningCard = hephCards.find((c) => c.dispatchId === 'd-sheet-2');
  const doneCard = hephCards.find((c) => c.dispatchId === 'd-sheet-1');
  expect('#184: two parallel demigods render as two live cards (running + done)',
    hephCards.length === 2 && runningCard?.status === 'running' && doneCard?.status === 'done',
    `hephCards = ${JSON.stringify(hephCards.map((c) => ({ id: c.dispatchId, status: c.status })))}`);
  expect('#184: the done card carries the outcome cost + equipment',
    doneCard?.tokensOut === 900 && doneCard?.skill === 'go-patterns'
    && doneCard?.durationMs === 60_000 && doneCard?.task === 'sheet done hop',
    `doneCard = ${JSON.stringify(doneCard)}`);
  expect('#184: a failure verdict renders as an error card',
    athenaCards.find((c) => c.dispatchId === 'd-sheet-3')?.status === 'error',
    `athenaCards = ${JSON.stringify(athenaCards.map((c) => ({ id: c.dispatchId, status: c.status })))}`);

  console.log(failures === 0
    ? '\nAll W4 dispatch-DNA (#182-#187, #205) assertions passed'
    : `\n${failures} W4 dispatch-DNA assertion(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
