#!/usr/bin/env node
/**
 * portfolio.test.mjs — v0.0.98-16: two projects, two profiles, one dashboard.
 *
 * The MVP confirmation is a bounded fixture drill (no model tokens): a Spike
 * lane (3 script hops) and a Demo lane (6 script hops with design + QA), then
 * the portfolio read. It proves the profile selection, the walker boundary,
 * the measured metrics and the dashboard payload.
 *
 * Run: npx tsx scripts/portfolio.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-portfolio-vault-'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-portfolio-home-'));
process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_VAULT = VAULT;
process.on('exit', () => {
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}
const scripts = [
  { id: 'page', command: 'printf page > page.txt', artifact: 'page.txt' },
  { id: 'api', command: 'printf api > api.txt', artifact: 'api.txt' },
  { id: 'design-gate-demo', command: 'printf \'{"overall":8}\' > design-review.json', artifact: 'design-review.json', checks: ['design-score:7'] },
  { id: 'qa-demo', command: 'printf "Overall: PASS" > evidence/qa/demo.md', artifact: 'evidence/qa/demo.md', checks: ['file-contains:evidence/qa/demo.md::Overall: PASS'] },
  { id: 'report', command: 'printf report > report.md', artifact: 'report.md' },
];

function lane(slug, profile) {
  const root = path.join(VAULT, '02_Projects', slug);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'project.md'), `---\nslug: ${slug}\nname: ${slug}\npath: ${root}\n---\n`);
  fs.writeFileSync(path.join(root, '.olympus-delivery-profile.json'), JSON.stringify({ version: 1, profile, updatedAt: new Date().toISOString(), updatedBy: 'fixture' }));
  return root;
}

function planFor(root, hops) {
  return {
    version: 1, laneRoot: root, generation: 1, createdAt: new Date(Date.now() - 60_000).toISOString(),
    hops: hops.map((h) => ({ id: h.id, kind: 'script', god: 'system', command: h.command, artifacts: [h.artifact], verify: { review: 'deterministic', checks: h.checks ?? [`file-exists:${h.artifact}`] } })),
  };
}

async function main() {
  const { walkPlan } = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
  const { buildPortfolio } = await import(OLYMPUS + '/src/lib/portfolio.ts');
  const spike = lane('mvp-spike', 'spike');
  const demo = lane('mvp-demo', 'demo');
  fs.mkdirSync(path.join(demo, 'evidence/qa'), { recursive: true });
  const spikePlan = planFor(spike, scripts.slice(0, 2));
  const demoPlan = planFor(demo, scripts);
  fs.writeFileSync(path.join(spike, 'dispatch-plan.json'), JSON.stringify(spikePlan));
  fs.writeFileSync(path.join(demo, 'dispatch-plan.json'), JSON.stringify(demoPlan));
  const s = await walkPlan({ plan: spikePlan, resume: false, stateDir: spike, campaignId: 'cmp_spike' });
  const d = await walkPlan({ plan: demoPlan, resume: false, stateDir: demo, campaignId: 'cmp_demo' });
  expect('the Spike lane completed 2/2', s.completed.length === 2 && !s.parked, JSON.stringify(s));
  expect('the Demo lane completed 5/5', d.completed.length === 5 && !d.parked, JSON.stringify(d));

  const p = buildPortfolio();
  expect('the portfolio sees two projects', p.projects.length === 2, JSON.stringify(p.projects.map((x) => x.slug)));
  const sp = p.projects.find((x) => x.slug === 'mvp-spike');
  const de = p.projects.find((x) => x.slug === 'mvp-demo');
  expect('the profiles are selected', sp?.profile === 'spike' && de?.profile === 'demo', JSON.stringify([sp?.profile, de?.profile]));
  expect('the profile checks pass', sp?.profileCheck?.ok === true && de?.profileCheck?.ok === true, JSON.stringify([sp?.profileCheck, de?.profileCheck]));
  expect('the projects are DONE', sp?.status === 'DONE' && de?.status === 'DONE', JSON.stringify([sp?.status, de?.status]));
  expect('hops-to-done is 100%', sp?.hopsToDonePct === 100 && de?.hopsToDonePct === 100, JSON.stringify([sp?.hopsToDonePct, de?.hopsToDonePct]));
  expect('first-green is measured', (sp?.firstGreenMs ?? -1) >= 0 && (de?.firstGreenMs ?? -1) >= 0, JSON.stringify([sp?.firstGreenMs, de?.firstGreenMs]));
  expect('done time is measured', (sp?.doneMs ?? -1) >= 0 && (de?.doneMs ?? -1) >= 0, JSON.stringify([sp?.doneMs, de?.doneMs]));
  expect('the totals aggregate both lanes', p.totals.projects === 2 && p.totals.done === 2 && p.totals.hops === 7 && p.totals.completed === 7, JSON.stringify(p.totals));

  // A Spike lane with 5 hops is refused before a token.
  const over = lane('mvp-over', 'spike');
  let refused = '';
  try { await walkPlan({ plan: planFor(over, scripts), resume: false, stateDir: over, campaignId: 'cmp_over' }); } catch (e) { refused = String(e); }
  expect('an over-profile plan is refused', /Spike refuses this plan/.test(refused), refused);

  const route = fs.readFileSync(path.join(OLYMPUS, 'src/app/api/olympus/portfolio/route.ts'), 'utf-8');
  const ui = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/logs-dashboard.tsx'), 'utf-8');
  expect('the portfolio API exists', /buildPortfolio/.test(route));
  expect('the Portfolio tab exists', /id: 'portfolio'/.test(ui) && /Portfolio/.test(ui));

  console.log('');
  if (failures > 0) {
    console.log(`portfolio: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('portfolio: all checks PASS');
}
await main();
