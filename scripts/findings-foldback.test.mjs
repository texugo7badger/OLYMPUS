#!/usr/bin/env node
/**
 * findings-foldback.test.mjs — RLM P2 fixture (BATCH 13, memo §P2).
 * Run: npx tsx scripts/findings-foldback.test.mjs   (exit 0 = pass)
 *
 * Drives the compiled-source tracker against a temp OLYMPUS_VAULT: the
 * demigod's LAST assistant text per open dispatch becomes
 * findings_summary on dispatch_outcome at finalize (sliced ≤2000 chars;
 * null when no text part — backward compat; orphan text never attaches).
 * Zero live dependencies; the real vault feed is never touched.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const VAULT = join(tmpdir(), 'olympus-p2-fixture');
rmSync(VAULT, { recursive: true, force: true });
mkdirSync(join(VAULT, '06_Activity_Feed'), { recursive: true });
process.env.OLYMPUS_VAULT = VAULT;

const tracker = await import('../.opencode/olympus/lib/dispatch-tracker.ts');
const FEED = join(VAULT, '06_Activity_Feed', 'live.jsonl');
let fails = 0;
const expect = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${ok?'PASS':'FAIL'}  ${n}: ${JSON.stringify(got)?.slice(0,110)}${ok?'':` (want ${JSON.stringify(want).slice(0,110)})`}`); if(!ok) fails++; };
const lastEvent = () => readFileSync(FEED, 'utf-8').trim().split('\n').map(l => JSON.parse(l)).pop();

// 1. LAST text wins; existing fields intact
tracker.registerOpenDispatch({ dispatchId: 'p2-1', god: 'apollo', demigod: 'planner', taskSignature: 'P2 test', classificationId: 'cls_p2_a' });
tracker.recordDispatchFinding('planner', 'VERDICT: approach approved. Finding 1: X.');
tracker.recordDispatchFinding('planner', 'VERDICT FINAL: approved with caveats — the design holds.');
tracker.attributeToolCall({ god: 'apollo', agentId: 'planner', tool: 'read', hadError: false, tokens: { input: 10, output: 5 } });
tracker.finalizeDispatchesForGod('apollo', null);
const e1 = lastEvent();
expect('findings_summary present (LAST text wins)', e1.findings_summary, 'VERDICT FINAL: approved with caveats — the design holds.');
expect('backward compat fields intact', [e1.classification_id, e1.budget_tokens], ['cls_p2_a', null]);

// 2. Slice to 2000
tracker.registerOpenDispatch({ dispatchId: 'p2-2', god: 'apollo', demigod: 'planner', taskSignature: 'P2 slice' });
tracker.recordDispatchFinding('planner', 'L'.repeat(5000));
tracker.finalizeDispatchesForGod('apollo', null);
expect('findings sliced to 2000', lastEvent().findings_summary.length, 2000);

// 3. No text → null
tracker.registerOpenDispatch({ dispatchId: 'p2-3', god: 'apollo', demigod: 'tdd-guide', taskSignature: 'P2 null' });
tracker.finalizeDispatchesForGod('apollo', null);
expect('findings null when no text part', lastEvent().findings_summary, null);

// 4. Orphan text: no crash, no attach
tracker.recordDispatchFinding('unknown-demigod-x', 'orphan text');
console.log('PASS  orphan text does not crash');

// 5. Hook wiring content assertion (message.part.updated → recordDispatchFinding)
const hooks = readFileSync(new URL('../.opencode/olympus/olympus-hooks.ts', import.meta.url), 'utf-8');
expect('hook: text parts captured for fold-back', /part\?\.type === "text"[\s\S]{0,200}recordDispatchFinding/.test(hooks), true);

rmSync(VAULT, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails} assertion(s) failed`); process.exit(1); }
console.log('\nAll RLM P2 findings-foldback assertions passed');
process.exit(0);
