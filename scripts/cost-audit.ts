#!/usr/bin/env tsx
/**
 * cost-audit.ts — v0.0.72: the campaign's economics, measured.
 *
 * The question open since the first independent analysis: what does one green
 * hop cost, in tokens and in dollars? This script answers it from two files
 * that already exist — the lane's hop telemetry and the cost ledger — and
 * refuses to invent the parts it cannot know:
 *
 *   - tokens come from the hop row (null is reported as null, never as 0);
 *   - cache reads come from the ledger, joined by session id;
 *   - `spend_usd` is the provider invoice (a subscription reports 0);
 *   - `spend_estimated_usd` is the LIST VALUE computed from the price table;
 *   - the invoice is printed as `unknown` when the provider reports 0 — a
 *     subscription is not a free lunch and must not read as one.
 *
 * Usage:
 *   npx tsx scripts/cost-audit.ts [--lane <path>] [--all] [--json] [--strict]
 *
 * Exit codes: 0 = report written; 1 = --strict and the truth is incomplete
 * (a hop with a session id but no token row, or a session missing from the
 * ledger). Read-only: the lane is never written.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { priceTokens } from '../src/lib/model-pricing';

interface HopRow {
  ts: string;
  hop: string;
  god: string;
  lane?: string;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number;
  status: string;
  sessionId?: string | null;
  transport?: string;
}

interface LedgerRow {
  ts: string;
  session_id?: string;
  god?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  cache_write_tokens?: number;
  spend_usd?: number;
  spend_estimated_usd?: number;
  tool?: string;
}

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name: string) => args.includes(`--${name}`);

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');

function activeSlug(): string | null {
  for (const file of [path.join(HOME, 'active-project.json'), path.join(HOME, 'studio-state.json')]) {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const slug = d?.slug ?? d?.activeProject?.slug ?? d?.project?.slug;
      if (typeof slug === 'string' && slug) return slug;
    } catch { /* next */ }
  }
  return null;
}

const laneArg = arg('lane');
const slug = laneArg ? path.basename(laneArg) : activeSlug();
if (!slug) {
  console.error('cost-audit: no lane. Pass --lane <path> (or open a project first).');
  process.exit(2);
}
const LANE = laneArg ?? path.join(VAULT, '02_Projects', slug);

const readJson = (file: string): any => {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
};
const readJsonl = <T>(file: string): T[] => {
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf-8'); } catch { return []; }
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as T); } catch { /* skip a torn line */ }
  }
  return out;
};

const state = readJson(path.join(LANE, '.olympus-hop-state.json'));
const plan = readJson(path.join(LANE, 'dispatch-plan.json'));
const allTelemetry = readJsonl<HopRow>(path.join(LANE, '.olympus-hop-telemetry.jsonl'));
const ledger = readJsonl<LedgerRow>(path.join(HOME, 'metrics', 'cost.jsonl'));

// The current campaign's hop set — the same rule campaign-report uses.
const mine = new Set<string>([
  ...((state?.completed ?? []) as string[]).map(String),
  ...(state?.parked?.hopId ? [String(state.parked.hopId)] : []),
  ...((state?.inFlight ?? []) as any[]).map((h) => String(typeof h === 'string' ? h : h?.hopId)).filter(Boolean),
]);
const scoped = has('all') || mine.size === 0
  ? allTelemetry
  : allTelemetry.filter((r) => mine.has(String(r.hop)));

// One row per hop: the newest telemetry line wins (a retry rewrites the truth).
const byHop = new Map<string, HopRow>();
for (const r of scoped) {
  const prev = byHop.get(String(r.hop));
  if (!prev || String(r.ts) > String(prev.ts)) byHop.set(String(r.hop), r);
}
const rows = [...byHop.values()];

// Ledger aggregate per session (only rows the campaign's hops name).
const sessions = new Set(rows.map((r) => r.sessionId).filter((s): s is string => Boolean(s)));
const perSession = new Map<string, { input: number; output: number; cached: number; cacheWrite: number; real: number; list: number; steps: number; models: Set<string> }>();
for (const ev of ledger) {
  const sid = String(ev.session_id ?? '');
  if (!sid || (sessions.size > 0 && !sessions.has(sid))) continue;
  const b = perSession.get(sid) ?? { input: 0, output: 0, cached: 0, cacheWrite: 0, real: 0, list: 0, steps: 0, models: new Set<string>() };
  b.input += Number(ev.input_tokens) || 0;
  b.output += Number(ev.output_tokens) || 0;
  b.cached += Number(ev.cached_tokens) || 0;
  b.cacheWrite += Number(ev.cache_write_tokens) || 0;
  b.real += Number(ev.spend_usd) || 0;
  b.list += Number(ev.spend_estimated_usd) || 0;
  b.steps += 1;
  if (ev.model && ev.model !== 'unknown') b.models.add(String(ev.model));
  perSession.set(sid, b);
}

const pct = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};
const fmt = (n: number | null | undefined): string => (n == null ? '—' : n.toLocaleString('en-US'));
const usd = (n: number): string => `$${n.toFixed(4)}`;
const mins = (ms: number | null): string => (ms == null ? '—' : `${(ms / 60_000).toFixed(1)} min`);

const durations = rows.map((r) => Number(r.durationMs) || 0).filter((n) => n > 0);
const tokIn = rows.map((r) => r.tokensIn).filter((n): n is number => typeof n === 'number' && n > 0);
const tokOut = rows.map((r) => r.tokensOut).filter((n): n is number => typeof n === 'number' && n > 0);
const nullRows = rows.filter((r) => r.tokensIn == null || r.tokensOut == null);
const parked = rows.filter((r) => String(r.status) !== 'completed');

let ledgerInput = 0, ledgerOutput = 0, cached = 0, cacheWrite = 0, real = 0, list = 0, steps = 0;
const models = new Set<string>();
for (const b of perSession.values()) {
  ledgerInput += b.input; ledgerOutput += b.output; cached += b.cached; cacheWrite += b.cacheWrite;
  real += b.real; list += b.list; steps += b.steps;
  for (const m of b.models) models.add(m);
}
const cacheHit = ledgerInput + cached > 0 ? (cached / (ledgerInput + cached)) * 100 : null;
const unmatched = [...sessions].filter((s) => !perSession.has(s));

// The ledger's step-finish rows do not always carry a session id, so a hop
// can be absent from it. Those hops are still priced: the same catalog the
// cost panel uses, from the hop's own model lane + token counts. The two
// figures are reported separately — a joined ledger number and a catalog
// estimate are not the same evidence.
let hopEstimated = 0;
let hopEstimatedHops = 0;
for (const r of rows) {
  if (r.sessionId && perSession.has(String(r.sessionId))) continue;
  const model = String(r.lane || 'unknown');
  const priced = priceTokens(model, { input: Number(r.tokensIn) || 0, output: Number(r.tokensOut) || 0 });
  if (priced.spendUsd > 0) { hopEstimated += priced.spendUsd; hopEstimatedHops += 1; }
}
const listTotal = list + hopEstimated;
const invoiceKnown = real >= 0.005;
const green = rows.filter((r) => String(r.status) === 'completed').length;

const top = [...rows]
  .filter((r) => typeof r.tokensIn === 'number')
  .sort((a, b) => (Number(b.tokensIn) + Number(b.tokensOut)) - (Number(a.tokensIn) + Number(a.tokensOut)))
  .slice(0, 5)
  .map((r) => ({ hop: r.hop, god: r.god, tokens: (Number(r.tokensIn) || 0) + (Number(r.tokensOut) || 0), minutes: Number((Number(r.durationMs) / 60_000).toFixed(1)) }));

const report = {
  lane: LANE,
  slug,
  campaignId: state?.campaignId ?? null,
  hops: { total: rows.length, completed: green, parked: parked.length },
  tokens: {
    in: tokIn.reduce((a, b) => a + b, 0),
    out: tokOut.reduce((a, b) => a + b, 0),
    inP50: pct(tokIn, 50),
    inP95: pct(tokIn, 95),
    outP50: pct(tokOut, 50),
    nullRows: nullRows.length,
    nullHops: nullRows.map((r) => r.hop).slice(-5),
  },
  durationMs: { p50: pct(durations, 50), p95: pct(durations, 95) },
  ledger: {
    sessions: sessions.size,
    matched: sessions.size - unmatched.length,
    unmatched: unmatched.slice(0, 5),
    steps,
    tokensIn: ledgerInput,
    tokensOut: ledgerOutput,
    cachedRead: cached,
    cacheWrite,
    cacheHitPct: cacheHit == null ? null : Number(cacheHit.toFixed(1)),
    spendRealUsd: Number(real.toFixed(4)),
    ledgerListValueUsd: Number(list.toFixed(4)),
    hopEstimatedUsd: Number(hopEstimated.toFixed(4)),
    listValueUsd: Number(listTotal.toFixed(4)),
    hopEstimatedHops,
    invoice: invoiceKnown ? 'provider-reported' : 'unknown (subscription reports $0)',
    models: [...models],
  },
  perHop: {
    listValueUsd: rows.length > 0 ? Number((listTotal / rows.length).toFixed(4)) : null,
    tokensInP50: pct(tokIn, 50),
    tokensOutP50: pct(tokOut, 50),
  },
  top,
};

if (has('json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nOLYMPUS cost audit — ${slug}`);
  console.log(`lane: ${LANE}`);
  console.log(`campaign: ${report.campaignId ?? '(none)'} · hops ${rows.length} · green ${green} · parked ${parked.length}\n`);
  console.log('| metric | value |');
  console.log('|---|---:|');
  console.log(`| tokens in (sum) | ${fmt(report.tokens.in)} |`);
  console.log(`| tokens out (sum) | ${fmt(report.tokens.out)} |`);
  console.log(`| tokens in p50 / p95 | ${fmt(report.tokens.inP50)} / ${fmt(report.tokens.inP95)} |`);
  console.log(`| tokens out p50 | ${fmt(report.tokens.outP50)} |`);
  console.log(`| duration p50 / p95 | ${mins(report.durationMs.p50)} / ${mins(report.durationMs.p95)} |`);
  console.log(`| cache read (ledger) | ${fmt(cached)} |`);
  console.log(`| cache hit | ${cacheHit == null ? '—' : cacheHit.toFixed(1) + '%'} |`);
  console.log(`| spend real (provider) | ${usd(real)} |`);
  console.log(`| list value (ledger join) | ${usd(list)} |`);
  console.log(`| list value (catalog, unmatched hops) | ${usd(hopEstimated)} (${hopEstimatedHops} hop(s)) |`);
  console.log(`| list value (total estimate) | ${usd(listTotal)} |`);
  console.log(`| invoice | ${report.ledger.invoice} |`);
  console.log(`| list value / hop | ${report.perHop.listValueUsd == null ? '—' : usd(report.perHop.listValueUsd)} |`);
  console.log(`| ledger sessions matched | ${report.ledger.matched}/${sessions.size} |`);
  console.log(`| hops with null tokens | ${nullRows.length}${nullRows.length ? ' (last: ' + report.tokens.nullHops.join(', ') + ')' : ''} |`);
  if (report.ledger.models.length) console.log(`| models | ${report.ledger.models.join(', ')} |`);
  if (top.length) {
    console.log('\nTop hops by tokens:');
    for (const t of top) console.log(`- ${t.hop} (${t.god}) — ${fmt(t.tokens)} tokens, ${t.minutes} min`);
  }
  console.log('\nHonest notes:');
  console.log('- `spend real` is the provider invoice; a subscription reports $0 and that is not free.');
  console.log('- `list value` is the price-table estimate for the same tokens — label it, never sum it silently.');
  console.log('- A null token row is a measurement gap, not a zero.\n');
}

const strictFail = has('strict') && (nullRows.length > 0 || unmatched.length > 0);
if (strictFail) {
  console.error(`cost-audit: STRICT failed — ${nullRows.length} null-token hop(s), ${unmatched.length} session(s) missing from the ledger.`);
  process.exit(1);
}
