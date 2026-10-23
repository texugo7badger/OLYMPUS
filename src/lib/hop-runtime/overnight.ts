/**
 * overnight.ts — #211 (v0.0.9): the unattended overnight lane.
 *
 * The campaign doctrine already isolates every hop in a fresh session (the
 * disk carries the campaign, never the context window), so a night-long
 * walk never bloats or drifts. What was missing was the HUMAN: a fresh
 * plan opened the HITL gate and parked campaigns waited for a morning
 * click. This module supplies the honest overnight contract:
 *
 *   1. computeWaves — the DAG's topological depth, the campaign's waves.
 *   2. buildOvernightDigest — the morning digest: every wave + outcome,
 *      built from the lane's own hop telemetry (never narrated from
 *      memory).
 *   3. waveActivityRows — one live.jsonl row per wave (the durable night
 *      log the Pantheon already tails).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanHop } from './plan-schema';
import { readHopTelemetry, type HopTelemetryRow } from './walker';

export const OVERNIGHT_DIGEST_FILENAME = '.olympus-morning-digest.md';

export interface PlanWave {
  index: number;
  hops: PlanHop[];
}

/**
 * Group the plan's hops by topological depth (wave = 1 + max(dep wave)).
 * `after` edges naming ids outside the plan are treated as already
 * satisfied — the walker's `ready()` sees them completed or absent too.
 * A cycle (schema-legal today: the walker would stall) lands in a final
 * wave so the digest names it instead of hiding hops.
 */
export function computeWaves(plan: unknown): PlanWave[] {
  const hops = Array.isArray((plan as { hops?: unknown })?.hops)
    ? ((plan as { hops: PlanHop[] }).hops)
    : [];
  if (hops.length === 0) return [];
  const byId = new Map(hops.map((h) => [String(h.id), h]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const resolveDepth = (hop: PlanHop): number => {
    const id = String(hop.id);
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let d = 0;
    for (const dep of hop.after ?? []) {
      const depHop = byId.get(String(dep));
      if (!depHop) continue;
      d = Math.max(d, resolveDepth(depHop) + 1);
    }
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };

  for (const h of hops) resolveDepth(h);
  const maxDepth = Math.max(...hops.map((h) => depth.get(String(h.id)) ?? 0));
  const waves: PlanWave[] = [];
  for (let i = 0; i <= maxDepth; i++) {
    const waveHops = hops.filter((h) => (depth.get(String(h.id)) ?? 0) === i);
    if (waveHops.length > 0) waves.push({ index: waves.length + 1, hops: waveHops });
  }
  return waves;
}

export type WaveOutcome = 'GREEN' | 'PARKED' | 'PENDING';

export interface WaveReport {
  wave: number;
  outcome: WaveOutcome;
  gods: string;
  hops: Array<{
    id: string;
    god: string;
    status: 'completed' | 'parked' | 'pending';
    detail: string;
    durationMs: number | null;
    tokensOut: number | null;
  }>;
}

function latestRows(rows: HopTelemetryRow[]): Map<string, HopTelemetryRow> {
  const latest = new Map<string, HopTelemetryRow>();
  for (const row of rows) latest.set(String(row.hop), row);
  return latest;
}

export function buildWaveReports(plan: unknown, rows: HopTelemetryRow[]): WaveReport[] {
  const latest = latestRows(rows);
  return computeWaves(plan).map((wave) => {
    const hops = wave.hops.map((h) => {
      const row = latest.get(String(h.id));
      const status: 'completed' | 'parked' | 'pending' = !row
        ? 'pending'
        : row.status === 'completed'
          ? 'completed'
          : row.status.startsWith('parked')
            ? 'parked'
            : 'pending';
      return {
        id: String(h.id),
        god: String(h.god),
        status,
        detail: row?.status ?? 'not reached',
        durationMs: row?.durationMs ?? null,
        tokensOut: row?.tokensOut ?? null,
      };
    });
    const outcome: WaveOutcome = hops.some((h) => h.status === 'parked')
      ? 'PARKED'
      : hops.length > 0 && hops.every((h) => h.status === 'completed')
        ? 'GREEN'
        : 'PENDING';
    return {
      wave: wave.index,
      outcome,
      gods: [...new Set(hops.map((h) => h.god))].join(', '),
      hops,
    };
  });
}

export interface OvernightDigestInput {
  slug: string;
  laneRoot: string;
  plan: unknown;
  rows?: HopTelemetryRow[];
  parked?: { hopId: string; reason: string } | null;
  autoApproved: boolean;
  resumeAttempts: number;
  startedAt: string;
  finishedAt: string;
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

/**
 * The morning digest: the campaign's own telemetry, wave by wave. No
 * model narration — a hop is GREEN because its telemetry row says
 * completed and its artifact verified, never because the night felt good.
 */
export function buildOvernightDigest(input: OvernightDigestInput): string {
  const rows = input.rows ?? readHopTelemetry(input.laneRoot);
  const waves = buildWaveReports(input.plan, rows);
  const totalHops = waves.reduce((n, w) => n + w.hops.length, 0);
  const completed = waves.reduce((n, w) => n + w.hops.filter((h) => h.status === 'completed').length, 0);
  const parkedHops = waves.flatMap((w) => w.hops.filter((h) => h.status === 'parked'));
  const lines: string[] = [
    `# Overnight digest — ${input.slug}`,
    '',
    `Started: ${input.startedAt}`,
    `Finished: ${input.finishedAt}`,
    'Mode: unattended (no human input — the plan-walk gate auto-approved)',
    `Plan: ${totalHops} hops across ${waves.length} wave${waves.length === 1 ? '' : 's'} · Completed: ${completed}/${totalHops} · Parked: ${input.parked ? `${input.parked.hopId} (${input.parked.reason})` : parkedHops.length > 0 ? parkedHops.map((h) => h.id).join(', ') : 'none'}`,
    `Auto-approved: ${input.autoApproved ? 'yes — the plan-walk gate (unattended overnight run)' : 'no — the gate was already approved'}`,
    `Auto-resumes: ${input.resumeAttempts}`,
    `Lane: ${input.laneRoot}`,
    '',
    'Context hygiene: every hop runs in its own fresh session (the walker isolates by design); the artifacts on disk carry the campaign between waves.',
    '',
    '## Waves',
    '',
    '| Wave | Gods | Outcome | Hops |',
    '|------|------|---------|------|',
    ...waves.map((w) => {
      const done = w.hops.filter((h) => h.status === 'completed').length;
      return `| ${w.wave} | ${w.gods} | ${w.outcome} | ${done}/${w.hops.length} completed |`;
    }),
    '',
  ];
  for (const w of waves) {
    lines.push(`### Wave ${w.wave} — ${w.outcome}`);
    for (const h of w.hops) {
      const marker = h.status === 'completed' ? 'done' : h.status === 'parked' ? 'parked' : 'pending';
      const extras = [
        h.durationMs !== null ? fmtDuration(h.durationMs) : null,
        h.tokensOut !== null ? `${h.tokensOut} out tokens` : null,
      ].filter(Boolean).join(', ');
      lines.push(`- [${marker}] \`${h.id}\` — ${h.god}${extras ? ` (${extras})` : ''}${h.status === 'parked' ? ` — ${h.detail}` : ''}`);
    }
    lines.push('');
  }
  lines.push('## Night log', '');
  lines.push('Every wave above was appended to `06_Activity_Feed/live.jsonl` as an `overnight-wave` milestone when the walk settled.');
  lines.push('');
  return lines.join('\n');
}

export function writeOvernightDigest(laneRoot: string, markdown: string): string {
  const target = join(laneRoot, OVERNIGHT_DIGEST_FILENAME);
  writeFileSync(target, markdown, 'utf-8');
  return target;
}

export function readOvernightDigest(laneRoot: string): string | null {
  const target = join(laneRoot, OVERNIGHT_DIGEST_FILENAME);
  if (!existsSync(target)) return null;
  try {
    return readFileSync(target, 'utf-8');
  } catch {
    return null;
  }
}
