/**
 * campaign-groups.ts — group Recent Activity by campaign (#226, v0.0.24).
 *
 * A campaign is one walk of a dispatch-plan. Its identity comes from the
 * walk lock (`cmp_*`) and rides every hop event + activity row. Legacy rows
 * (before campaignId existed) go to a single "Earlier" bucket, collapsed.
 *
 * Pure and dependency-free so the UI and the tests share it.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface CampaignRow {
  id: string;
  ts: string;
  god: string;
  action?: string;
  summary: string;
  impact?: string;
  outcome?: string;
  campaignId?: string | null;
  project?: string | null;
  hop?: string | null;
  skill?: string | null;
  mcp?: string | null;
  durationMs?: number | null;
  tokens?: { input: number; output: number } | null;
}

export interface CampaignGroup {
  campaignId: string | null;
  project: string | null;
  startedAt: string;
  endedAt: string;
  status: 'running' | 'done' | 'parked' | 'legacy';
  rows: CampaignRow[];
  hopCount: number;
  completedHops: number;
  parkedHops: number;
}

function tsOf(row: CampaignRow): number {
  const t = new Date(row.ts).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isHop(row: CampaignRow): boolean {
  return row.action === 'hop';
}

function hopVerdict(row: CampaignRow): 'done' | 'parked' | 'running' {
  const s = `${row.summary || ''} ${row.outcome || ''}`.toUpperCase();
  if (s.includes('PARKED')) return 'parked';
  if (s.includes('GREEN') || s.includes('DONE') || s.includes('COMPLETED')) return 'done';
  return 'running';
}

/**
 * Group rows by campaign. The output is newest-campaign-first. Inside a
 * campaign, rows are ordered oldest-first (the minitask chain reads as a
 * sequence: hop 1 → hop 2 → hop 3).
 */
export function groupEpisodesByCampaign(rows: CampaignRow[], opts: { nowMs?: number } = {}): CampaignGroup[] {
  const now = opts.nowMs ?? Date.now();
  const byKey = new Map<string, CampaignRow[]>();
  for (const row of rows) {
    const key = row.campaignId || '__legacy__';
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const groups: CampaignGroup[] = [];
  for (const [key, list] of byKey) {
    const ordered = [...list].sort((a, b) => tsOf(a) - tsOf(b));
    const hopRows = ordered.filter(isHop);
    // A hop can produce several rows (started + GREEN/PARKED). Count the
    // HOP, not the row: parked > done > running.
    const hopState = new Map<string, 'running' | 'done' | 'parked'>();
    for (const row of hopRows) {
      const id = row.hop || row.summary.match(/Hop '([^']+)'/)?.[1] || row.id;
      const verdict = hopVerdict(row);
      const prev = hopState.get(id);
      if (prev === 'parked' || (prev === 'done' && verdict === 'running')) continue;
      hopState.set(id, verdict);
    }
    const verdicts = [...hopState.values()];
    const parkedHops = verdicts.filter((v) => v === 'parked').length;
    const completedHops = verdicts.filter((v) => v === 'done').length;
    const lastTs = tsOf(ordered[ordered.length - 1]);
    const isLegacy = key === '__legacy__';
    const status: CampaignGroup['status'] = isLegacy
      ? 'legacy'
      : parkedHops > 0
        ? 'parked'
        : hopState.size > 0 && completedHops === hopState.size
          ? 'done'
          : (now - lastTs < 3 * 60_000 ? 'running' : 'done');

    groups.push({
      campaignId: isLegacy ? null : key,
      project: ordered.find((r) => r.project)?.project ?? null,
      startedAt: ordered[0]?.ts ?? new Date(now).toISOString(),
      endedAt: ordered[ordered.length - 1]?.ts ?? new Date(now).toISOString(),
      status,
      rows: ordered,
      hopCount: hopState.size,
      completedHops,
      parkedHops,
    });
  }

  const rank: Record<CampaignGroup['status'], number> = { running: 0, parked: 1, done: 2, legacy: 3 };
  return groups.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return tsOf({ ts: b.endedAt } as CampaignRow) - tsOf({ ts: a.endedAt } as CampaignRow);
  });
}

/** A short, readable campaign label: `cmp_abc123` → `cmp_abc123`. */
export function campaignLabel(id: string | null): string {
  if (!id) return 'Earlier activity';
  return id.length > 18 ? `${id.slice(0, 18)}…` : id;
}

/** Human duration between two ISO timestamps. */
export function campaignDuration(g: CampaignGroup): string {
  const start = tsOf({ ts: g.startedAt } as CampaignRow);
  const end = tsOf({ ts: g.endedAt } as CampaignRow);
  const ms = Math.max(0, end - start);
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
