#!/usr/bin/env node
/**
 * rlm-envelope.test.mjs — v0.1.4: recursion is bounded before it runs.
 *
 * Proves the envelope contract: depth <= 2, <= 4 children per parent, child
 * budgets never exceed the parent, cycles die at plan time, and the prompt
 * block carries the goal + parent artifacts, not a campaign dump.
 *
 * Run: npx tsx scripts/rlm-envelope.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 320)}`}`);
  if (!ok) failures++;
};

async function main() {
  const rlm = await import(OLYMPUS + '/src/lib/rlm/envelope.ts');
  const schema = await import(OLYMPUS + '/src/lib/hop-runtime/plan-schema.ts');

  const config = rlm.normalizeRlmConfig({ goal: 'ship the onboarding flow', budgetTokens: 20_000, maxDepth: 2 });
  expect('E1: a valid config normalizes', Boolean(config) && config.maxDepth === 2, JSON.stringify(config));
  expect('E2: a budget below the floor is rejected', rlm.normalizeRlmConfig({ goal: 'x', budgetTokens: 100 }) === null);

  const valid = [
    { id: 'h1', rlmDepth: 1, budgetTokens: 8_000, artifacts: ['a.md'] },
    { id: 'h2', rlmDepth: 1, budgetTokens: 8_000, artifacts: ['b.md'] },
    { id: 'h2-child', rlmParent: 'h2', rlmDepth: 2, budgetTokens: 6_000, artifacts: ['c.md'] },
  ];
  expect('E3: a depth-2 tree within budget passes', rlm.validateRlmTree(valid, config).ok, JSON.stringify(rlm.validateRlmTree(valid, config)));

  const tooDeep = valid.concat([{ id: 'h3', rlmParent: 'h2-child', rlmDepth: 3, budgetTokens: 4_000, artifacts: ['d.md'] }]);
  expect('E4: depth 3 is rejected', !rlm.validateRlmTree(tooDeep, config).ok, JSON.stringify(rlm.validateRlmTree(tooDeep, config)));

  const tooMany = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, rlmDepth: 1, budgetTokens: 1_000, artifacts: [`${i}.md`] }));
  expect('E5: five root children are rejected', !rlm.validateRlmTree(tooMany, config).ok, JSON.stringify(rlm.validateRlmTree(tooMany, config)));

  const overBudget = [
    { id: 'a', rlmDepth: 1, budgetTokens: 12_000, artifacts: ['a.md'] },
    { id: 'b', rlmDepth: 1, budgetTokens: 12_000, artifacts: ['b.md'] },
  ];
  expect('E6: child budgets above the root budget are rejected', !rlm.validateRlmTree(overBudget, config).ok, JSON.stringify(rlm.validateRlmTree(overBudget, config)));

  const cycle = [
    { id: 'c1', rlmParent: 'c2', rlmDepth: 2, budgetTokens: 4_000, artifacts: ['1.md'] },
    { id: 'c2', rlmParent: 'c1', rlmDepth: 2, budgetTokens: 4_000, artifacts: ['2.md'] },
  ];
  expect('E7: an rlmParent cycle is rejected', !rlm.validateRlmTree(cycle, config).ok, JSON.stringify(rlm.validateRlmTree(cycle, config)));

  const block = rlm.composeRlmBlock({
    config,
    hop: { id: 'h2-child', prompt: 'build the first-run wizard', artifacts: ['wizard.tsx'], rlmDepth: 2, budgetTokens: 6_000 },
    parent: { id: 'h2', artifacts: ['flow.md'], rlmDepth: 1 },
  });
  expect('E8: the block names the goal and the parent artifact', block.includes('ship the onboarding flow') && block.includes('flow.md') && block.includes('depth 2/2'), block);
  expect('E9: the block carries the stop rule', /stop when the budget is spent/i.test(block), block);

  const baseHop = {
    id: 'root-1', god: 'athena', prompt: 'build the onboarding flow', artifacts: ['flow.md'],
    skills: ['frontend-design'], mcps: ['context7'], demigods: ['ui-designer'], rlmDepth: 1, budgetTokens: 8_000,
  };
  const okPlan = schema.validateDispatchPlan({
    version: 1, laneRoot: '/tmp/x', rlm: { goal: 'ship the onboarding flow', budgetTokens: 20_000, maxDepth: 2 },
    hops: [baseHop, { ...baseHop, id: 'child-1', rlmParent: 'root-1', rlmDepth: 2, budgetTokens: 6_000, artifacts: ['child.md'] }],
  });
  expect('E10: the plan schema keeps a valid envelope', okPlan.ok && okPlan.plan?.rlm?.goal === 'ship the onboarding flow', JSON.stringify(okPlan.errors));
  const badPlan = schema.validateDispatchPlan({
    version: 1, laneRoot: '/tmp/x', rlm: { goal: 'ship the onboarding flow', budgetTokens: 20_000 },
    hops: [baseHop, { ...baseHop, id: 'child-1', rlmDepth: 3, budgetTokens: 6_000, artifacts: ['child.md'] }],
  });
  expect('E11: the plan schema rejects depth 3', !badPlan.ok, JSON.stringify(badPlan));

  const before = rlm.rlmEnabled();
  process.env.OLYMPUS_RLM = '1';
  expect('E12: the flag enables the envelope lane', rlm.rlmEnabled() === true);
  if (!before) delete process.env.OLYMPUS_RLM;

  console.log(`\nrlm-envelope: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
