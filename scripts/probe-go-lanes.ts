#!/usr/bin/env tsx
/**
 * probe-go-lanes.ts — v0.1.0: a REAL one-token probe per GO lane.
 *
 * The audit found lane-health entries that were stale in both directions:
 * minimax-m3 marked alive although the provider rejects it, and qwen3.8-flash
 * correctly marked auth. This script sends one tiny prompt through the local
 * opencode binary for each GO lane, classifies the refusal, and (with --apply)
 * writes the measured result into lane-health.json so the campaign fallback
 * chain is honest.
 *
 * Usage:
 *   npx tsx scripts/probe-go-lanes.ts            # report only
 *   npx tsx scripts/probe-go-lanes.ts --apply    # write lane-health.json
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markLaneAlive, markLaneDead } from '../src/lib/lane-health';

const LANES = [
  'opencode-go/deepseek-v4.1-flash',
  'opencode-go/mimo-v2.6-flash',
  'opencode-go/hy3',
  'opencode-go/kimi-k2.7-code',
  'opencode-go/glm-5.3-flash',
  'opencode-go/qwen3.8-flash',
  'opencode-go/qwen3.7-plus',
  'opencode-go/minimax-m3',
];

const apply = process.argv.includes('--apply');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'node_modules', '.bin', 'opencode');

function probe(lane: string): { ok: boolean; status: 'alive' | 'auth' | 'no-route' | 'timeout' | 'unknown'; detail: string; latencyMs: number } {
  const started = Date.now();
  const r = spawnSync(bin, ['run', '-m', lane, '--agent', 'apollo', 'Reply with exactly: OK'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 75_000,
    env: { ...process.env, PWD: root },
  });
  const latencyMs = Date.now() - started;
  const output = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  if (r.error && (r.error as any).code === 'ETIMEDOUT') return { ok: false, status: 'timeout', detail: 'probe exceeded 75s', latencyMs };
  if (/requires an API key|authentication_error|provider\.auth/i.test(output)) {
    return { ok: false, status: 'auth', detail: output.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300), latencyMs };
  }
  if (/provider\.no-route|model not found|does not exist/i.test(output)) {
    return { ok: false, status: 'no-route', detail: output.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300), latencyMs };
  }
  if (/\bOK\b/.test(output) && r.status === 0) return { ok: true, status: 'alive', detail: 'OK', latencyMs };
  return { ok: false, status: 'unknown', detail: output.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 300) || `exit ${r.status}`, latencyMs };
}

let failed = 0;
const results = LANES.map((lane) => {
  const result = probe(lane);
  if (apply) {
    if (result.ok) markLaneAlive(lane, result.latencyMs);
    else markLaneDead(lane, result.status === 'auth' ? 'provider.auth' : result.status, result.status === 'timeout' ? 10 * 60_000 : undefined, result.detail);
  }
  if (!result.ok) failed++;
  return { lane, ...result };
});
console.log(JSON.stringify({ probedAt: new Date().toISOString(), apply, results }, null, 2));
process.exit(failed === 0 ? 0 : 1);
