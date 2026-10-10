#!/usr/bin/env node
/**
 * walk-driver.mjs — PLANO-MASTER-1 B7: LUMINA walked by the CURED machine.
 *
 * The SMOKE-1 smoke.mjs precedent: the PRODUCT seam (maybeWalkThePlan) with
 * the REAL dispatcher (the live free lanes, the #107 crescendo inside), the
 * publishActivity opt-in ON (the cross-session feed — the #85 surface), and
 * the campaign RESUMED from the state the failed UAT afternoon parked (the
 * disk carried it since 2026-10-09 17:41Z).
 *
 * The lane-aware replan (declared in b7-acceptance.md): the 4 hops that rode
 * dead-lane gods this window (hephaestus x3 -> apollo on glm-5.3; prometheus
 * x1 -> dionysus, the QA god, on glm-5.3); athena's 15 ride the flash lane
 * (alive this window). The user's B7 approval at the campaign gate is the
 * walk's approval of record (the hop-state predates the gate — the resume
 * doctrine).
 *
 * Run from the repo root:
 *   npx tsx reports/plano-master-1/b7/walk-driver.mjs
 * Exit 0 = walked N/N; exit 2 = PARKED (run again to resume); 1 = other.
 */
const OLYMPUS = process.cwd();
const HOME = process.env.HOME;
const LANE = HOME + '/OLYMPUS-VAULT/02_Projects/lumina-crm';

const { maybeWalkThePlan } = await import(OLYMPUS + '/src/lib/hop-runtime/post-run.ts');

const send = (ev) => {
  const t = ev.type ?? 'log';
  if (t === 'hop_start' || t === 'hop_done' || t === 'hop_parked' || t === 'walk_summary' || t === 'log') {
    console.log(`[${new Date().toISOString()}] [${t}] ${ev.msg ?? ''}`);
  }
};

const out = await maybeWalkThePlan({
  slug: 'lumina-crm',
  laneRoot: LANE,
  send,
  sessionId: 'plano-master-1-b7',
  publishActivity: true,
});

console.log('WALK RESULT:', JSON.stringify({
  walked: out.walked,
  completed: out.completed,
  total: out.total,
  parked: out.parked,
  reason: out.reason ?? null,
  summaryLine: out.summaryLine,
}, null, 2));

if (out.parked) {
  console.log('PARKED — run this driver again; the walk resumes from the state file, nothing is lost.');
  process.exit(2);
}
process.exit(out.walked && out.completed === out.total ? 0 : 1);
