/**
 * eta.ts — v0.0.91: the honest ETA model.
 *
 * The v0.0.30 projection was a per-god serial median. It was structurally
 * right (same-pool hops serialize; the critical path is the max across gods)
 * but it ignored the two facts the user feels most: parks and design loops.
 * AIME measured 27% parks overall and 81% on design-review hops; the header
 * said "~40m" while the last eight hops took 1h30–3h.
 *
 * This module keeps the critical-path shape and adds three corrections:
 *   - p50 and p90 per god (the band, never a single number);
 *   - parkRate multiplier (one extra attempt per observed park rate);
 *   - designGate multiplier (design reviews park far more often than code).
 *
 * The result is intentionally conservative: a narrow band is a lie when the
 * sample is small, so `confidence` is part of the answer.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type EtaConfidence = 'low' | 'medium' | 'high';

export interface EtaTelemetryRow {
  hop?: string;
  god?: string;
  status?: string;
  durationMs?: number;
  ts?: string;
}

export interface EtaHopInput {
  id?: string;
  god: string;
  /** pending | running | completed | parked | lost */
  status: string;
  startedAt?: string;
  /** A design-review / design-gate hop: historically the highest park rate. */
  designGate?: boolean;
}

export interface EtaGodLine {
  god: string;
  remaining: number;
  p50Ms: number;
  p90Ms: number;
  samples: number;
  eta50Ms: number;
  eta90Ms: number;
}

export interface EtaModel {
  eta50Ms: number;
  eta90Ms: number;
  /** Time until the first remaining hop settles (the next visible artifact). */
  nextVisibleMs: number;
  confidence: EtaConfidence;
  /** Observed parks / attempts (completed + parked). 0 when no history. */
  parkRate: number;
  sampleCount: number;
  designGateCount: number;
  perGod: EtaGodLine[];
  /** A short human explanation for the tooltip. */
  basis: string;
}

/** The house's established upper-middle median (preserves the v0.0.30 contract). */
export function medianUpper(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 2))];
}

/** Nearest-rank percentile (p in 0..1). */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, p));
  const rank = Math.ceil(clamped * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

export function isParkedStatus(status: unknown): boolean {
  return String(status ?? '').startsWith('parked');
}

export function isDesignHop(hop: EtaHopInput): boolean {
  if (hop.designGate) return true;
  return /design[-_]?(review|gate)|design-review/i.test(String(hop.id ?? ''));
}

const DEFAULT_HOP_MS = 300_000;
const DEFAULT_P90_RATIO = 2.5;
const MAX_DESIGN_FACTOR = 2.5;
const MAX_COMBINED_FACTOR = 3;

function addTo(map: Map<string, number[]>, key: string, value: number): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function normalizeGod(god: unknown): string {
  return String(god ?? 'unknown').toLowerCase();
}

/**
 * Build the ETA band for a lane.
 *
 * `telemetry` should be ALL rows (not the last row per hop): parks and
 * retries are the signal. `hops` is the plan's remaining work.
 */
export function buildEtaModel(opts: {
  hops: EtaHopInput[];
  telemetry: EtaTelemetryRow[];
  now: number;
  defaultMs?: number;
}): EtaModel {
  const defaultMs = opts.defaultMs ?? DEFAULT_HOP_MS;
  const completedByGod = new Map<string, number[]>();
  const completedAll: number[] = [];
  let completedCount = 0;
  let parkCount = 0;
  let designCompleted = 0;
  let designParked = 0;

  for (const row of opts.telemetry) {
    const status = String(row?.status ?? '');
    const isDesign = /design[-_]?(review|gate)/i.test(String(row?.hop ?? ''));
    if (status === 'completed' && typeof row?.durationMs === 'number' && row.durationMs > 0) {
      const god = normalizeGod(row.god);
      addTo(completedByGod, god, row.durationMs);
      completedAll.push(row.durationMs);
      completedCount++;
      if (isDesign) designCompleted++;
    } else if (isParkedStatus(status)) {
      parkCount++;
      if (isDesign) designParked++;
    }
  }

  const globalP50 = medianUpper(completedAll) || defaultMs;
  const globalP90 = percentile(completedAll, 0.9) || Math.round(globalP50 * DEFAULT_P90_RATIO);
  const parkRate = completedCount + parkCount > 0
    ? parkCount / (completedCount + parkCount)
    : 0;
  const designAttempts = designCompleted + designParked;
  const designParkRate = designAttempts > 0
    ? designParked / designAttempts
    : 0;

  // One extra attempt per observed park rate. The p90 side is slightly more
  // conservative because a tail that parks twice is not the same as one park.
  const parkFactor50 = 1 + parkRate * 2;
  const parkFactor90 = 1 + parkRate * 3;

  const byGod = new Map<string, { p50: number; p90: number; samples: number; remaining: number; eta50: number; eta90: number }>();
  let designGateCount = 0;
  let nextVisibleMs = Number.POSITIVE_INFINITY;

  for (const hop of opts.hops) {
    if (hop.status !== 'pending' && hop.status !== 'running') continue;
    const god = normalizeGod(hop.god);
    const samples = completedByGod.get(god) ?? [];
    const p50 = medianUpper(samples) || globalP50;
    const p90 = percentile(samples, 0.9) || globalP90 || Math.round(p50 * DEFAULT_P90_RATIO);
    const design = isDesignHop(hop);
    if (design) designGateCount++;

    // Running hops count down their elapsed time; never below 30s.
    let base50 = p50;
    let base90 = p90;
    if (hop.status === 'running' && hop.startedAt) {
      const started = new Date(hop.startedAt).getTime();
      if (Number.isFinite(started)) {
        const elapsed = Math.max(0, opts.now - started);
        base50 = Math.max(30_000, p50 - elapsed);
        base90 = Math.max(30_000, p90 - elapsed);
      }
    }

    // A design gate with no history is still risky: the observed default is
    // at least 25% parks (the AIME design review was 81%). The factor is
    // capped so a single old park cannot dominate a fresh lane.
    const designRate = design ? Math.max(designParkRate, 0.25) : 0;
    const designFactor = design ? Math.min(MAX_DESIGN_FACTOR, 1 + designRate * 2) : 1;
    const factor50 = Math.min(MAX_COMBINED_FACTOR, parkFactor50 * designFactor);
    const factor90 = Math.min(MAX_COMBINED_FACTOR, parkFactor90 * designFactor);

    const line = byGod.get(god) ?? { p50, p90, samples: samples.length, remaining: 0, eta50: 0, eta90: 0 };
    line.remaining++;
    line.eta50 += base50 * factor50;
    line.eta90 += base90 * factor90;
    byGod.set(god, line);

    // The first hop of a god is the next visible artifact for that pool.
    // We only add it once per god (the loop keeps the smallest).
    if (line.remaining === 1) {
      nextVisibleMs = Math.min(nextVisibleMs, base50 * factor50);
    }
  }

  const perGod: EtaGodLine[] = [...byGod.entries()].map(([god, line]) => ({
    god,
    remaining: line.remaining,
    p50Ms: Math.round(line.p50),
    p90Ms: Math.round(line.p90),
    samples: line.samples,
    eta50Ms: Math.round(line.eta50),
    eta90Ms: Math.round(line.eta90),
  })).sort((a, b) => b.eta50Ms - a.eta50Ms);

  const eta50Ms = perGod.length ? Math.max(...perGod.map((g) => g.eta50Ms)) : 0;
  const eta90Ms = perGod.length ? Math.max(...perGod.map((g) => g.eta90Ms)) : 0;
  const sampleCount = completedCount;
  const spread = globalP50 > 0 ? globalP90 / globalP50 : 0;
  const confidence: EtaConfidence = sampleCount >= 20 && spread > 0 && spread <= 2.5
    ? 'high'
    : sampleCount >= 8 && spread > 0 && spread <= 5
      ? 'medium'
      : 'low';

  const basisParts: string[] = [];
  for (const g of perGod.slice(0, 4)) {
    basisParts.push(`${g.remaining} ${g.god}${g.remaining > 1 ? '' : ''}`);
  }
  if (parkRate > 0) basisParts.push(`${Math.round(parkRate * 100)}% park`);
  if (designGateCount > 0) basisParts.push(`${designGateCount} design gate${designGateCount > 1 ? 's' : ''}`);
  basisParts.push(`confidence ${confidence}`);
  const basis = basisParts.join(' · ');

  return {
    eta50Ms,
    eta90Ms,
    nextVisibleMs: Number.isFinite(nextVisibleMs) ? Math.round(nextVisibleMs) : 0,
    confidence,
    parkRate: Math.round(parkRate * 1000) / 1000,
    sampleCount,
    designGateCount,
    perGod,
    basis,
  };
}

/** "54m" · "1h24" · "2h" — compact, no locale, no rounding surprises. */
export function formatEta(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  if (ms >= 3_600_000) {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.round((ms % 3_600_000) / 60_000);
    if (minutes === 0) return `${hours}h`;
    if (minutes === 60) return `${hours + 1}h`;
    return `${hours}h${String(minutes).padStart(2, '0')}`;
  }
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

/** "p50 54m · p90 1h40" — the band the Parthenon shows. */
export function formatEtaBand(eta: Pick<EtaModel, 'eta50Ms' | 'eta90Ms'> | null | undefined): string {
  if (!eta || !eta.eta50Ms) return '—';
  if (!eta.eta90Ms || eta.eta90Ms <= eta.eta50Ms) return `p50 ${formatEta(eta.eta50Ms)}`;
  return `p50 ${formatEta(eta.eta50Ms)} · p90 ${formatEta(eta.eta90Ms)}`;
}
