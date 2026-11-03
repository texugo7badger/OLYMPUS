#!/usr/bin/env node
/**
 * certify-100hop.ts — v0.0.59: the 100-hop RUNTIME certification.
 *
 * HONEST SCOPE: this proves the deterministic spine at 100 hops — the plan
 * validator, the dependency scheduler, the per-hop state file, the launch
 * floor, the telemetry rows and the artifact verifier — with zero LLM
 * tokens. It is NOT the 8-hour model soak; that gate stays open and is
 * labelled as such in the report.
 *
 * The lane is disposable (/tmp/opencode/cert-100hop): 100 script hops in
 * ten chains of ten, each writing one artifact and verifying it.
 *
 * Run: npx tsx scripts/certify-100hop.ts
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { maybeWalkThePlan } from '../src/lib/hop-runtime/post-run';

const LANE = path.join('/tmp/opencode', 'cert-100hop');
const REPORT = path.join(os.homedir(), 'Documents', 'OLYMPUS-plan', 'certification-100hop.md');
const TOTAL = 100;
const CHAINS = 10;

type Hop = Record<string, unknown>;

function buildPlan(): { version: number; laneRoot: string; hops: Hop[] } {
  const hops: Hop[] = [];
  for (let i = 1; i <= TOTAL; i++) {
    const id = `h${String(i).padStart(3, '0')}`;
    const chain = (i - 1) % CHAINS;
    const step = Math.floor((i - 1) / CHAINS);
    const after = step > 0 ? [`h${String(i - CHAINS).padStart(3, '0')}`] : undefined;
    hops.push({
      id,
      kind: 'script',
      god: 'hephaestus',
      command: `mkdir -p artifacts && printf '%s\\n' '${id} ok' > artifacts/${id}.txt`,
      artifacts: [`artifacts/${id}.txt`],
      after,
      verify: { review: 'deterministic', checks: [`file-exists:artifacts/${id}.txt`, `file-contains:artifacts/${id}.txt::${id} ok`] },
      timeoutMs: 30_000,
    });
    void chain;
  }
  return { version: 1, laneRoot: LANE, hops };
}

function pct(values: number[], p: number): number {
  const a = values.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
}

async function main() {
  fs.rmSync(LANE, { recursive: true, force: true });
  fs.mkdirSync(LANE, { recursive: true });
  const plan = buildPlan();
  fs.writeFileSync(path.join(LANE, 'dispatch-plan.json'), JSON.stringify(plan, null, 2) + '\n', 'utf-8');

  const logs: string[] = [];
  const startedAt = Date.now();
  const result = await maybeWalkThePlan({
    slug: 'cert-100hop',
    laneRoot: LANE,
    unattended: true,
    expectPlan: false,
    publishActivity: false,
    send: (ev: any) => {
      const msg = ev?.msg || ev?.type || '';
      logs.push(String(msg));
      if (ev?.type === 'hop_done' || ev?.type === 'hop_parked') console.log(`[${ev.type}] ${ev.hop} ${ev.msg || ev.reason || ''}`);
    },
  });
  const durationMs = Date.now() - startedAt;

  const statePath = path.join(LANE, '.olympus-hop-state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const completed: string[] = state.completed || [];
  const artifacts = fs.readdirSync(path.join(LANE, 'artifacts')).filter((f) => f.endsWith('.txt'));
  const telemetryPath = path.join(LANE, '.olympus-hop-telemetry.jsonl');
  const rows = fs.existsSync(telemetryPath)
    ? fs.readFileSync(telemetryPath, 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  const completedRows = rows.filter((r) => r.status === 'completed');
  const durations = completedRows.map((r) => Number(r.durationMs) || 0);
  const tokens = completedRows.reduce((s, r) => s + (Number(r.tokensIn) || 0) + (Number(r.tokensOut) || 0), 0);

  const checks: Array<[string, boolean, string]> = [
    ['walk reported success', result.walked === true, JSON.stringify(result)],
    ['100 hops completed', completed.length === TOTAL, `${completed.length}/${TOTAL}`],
    ['no hop in flight', Array.isArray(state.inFlight) && state.inFlight.length === 0, JSON.stringify(state.inFlight)],
    ['no park', state.parked == null, JSON.stringify(state.parked)],
    ['100 artifacts on disk', artifacts.length === TOTAL, `${artifacts.length}/${TOTAL}`],
    ['100 completed telemetry rows', completedRows.length === TOTAL, `${completedRows.length}`],
    ['every hop id appears exactly once', new Set(completedRows.map((r) => r.hop)).size === TOTAL, `${new Set(completedRows.map((r) => r.hop)).size}`],
    ['zero LLM tokens', tokens === 0, `tokens=${tokens}`],
    ['under 5 minutes wall clock', durationMs < 5 * 60_000, `${Math.round(durationMs / 1000)}s`],
    ['state is parseable with a campaign id', typeof state.campaignId === 'string' && state.campaignId.length > 0, String(state.campaignId)],
  ];

  const pass = checks.every(([, ok]) => ok);
  const report = `# 100-hop runtime certification

- Run: ${new Date().toISOString()}
- Lane: \`${LANE}\` (disposable)
- Plan: ${TOTAL} deterministic script hops in ${CHAINS} dependency chains
- Result: **${pass ? 'PASS' : 'FAIL'}**
- Wall clock: ${(durationMs / 1000).toFixed(1)}s
- Per-hop p50 / p95: ${pct(durations, 50)}ms / ${pct(durations, 95)}ms
- Tokens: ${tokens} (script hops run with zero LLM tokens by design)
- Campaign: \`${state.campaignId}\`

## Checks

| check | result | evidence |
|---|---|---|
${checks.map(([name, ok, detail]) => `| ${name} | ${ok ? 'PASS' : 'FAIL'} | ${String(detail).replace(/\|/g, '\\|').slice(0, 180)} |`).join('\n')}

## Honest scope

This certifies the **deterministic spine** at 100 hops: the plan validator,
the dependency scheduler, per-hop state, the launch floor, telemetry and the
artifact verifier. It is **not** the 8-hour model soak; 100 LLM hops across
real providers remain the open v1.0 gate. No claim is made about model
quality or provider reliability here.

## Walk summary

\`\`\`
${(logs.slice(-20).join('\n') || 'no log lines').slice(0, 3000)}
\`\`\`
`;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, report, 'utf-8');

  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  }
  console.log(`\nreport: ${REPORT}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error('certification crashed:', e);
  process.exit(2);
});
