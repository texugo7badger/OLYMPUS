#!/usr/bin/env node
/**
 * campaign-report.mjs — v0.0.53: the campaign's own evidence.
 *
 * Reads a lane's dispatch-plan, durable hop state, telemetry, the activity
 * feed and the cost ledger. Produces one Markdown report: per-hop duration,
 * tokens, out-tokens/s, tool calls, cost; per-god aggregate; top slowest;
 * parks and causes. Read-only: the lane is never written.
 *
 * Usage: node scripts/campaign-report.mjs --lane <path> [--out <file>]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const LANE = arg('lane', path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', 'aime'));
const OUT = arg('out', path.join(os.homedir(), 'Documents', 'OLYMPUS-plan', `campaign-report-${path.basename(LANE)}.md`));
const read = (f) => { try { return fs.readFileSync(f, 'utf-8'); } catch { return null; } };
const json = (f) => { try { return JSON.parse(read(f) || 'null'); } catch { return null; } };
const plan = json(path.join(LANE, 'dispatch-plan.json'));
const state = json(path.join(LANE, '.olympus-hop-state.json'));
const telemetry = (read(path.join(LANE, '.olympus-hop-telemetry.jsonl')) || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const costs = (read(path.join(os.homedir(), '.olympus', 'metrics', 'cost.jsonl')) || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const activity = (read(path.join(os.homedir(), 'OLYMPUS-VAULT', '06_Activity_Feed', 'live.jsonl')) || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const hops = new Map((plan?.hops || []).map((h) => [String(h.id), h]));
const done = new Set((state?.completed || []).map(String));
const rows = new Map();
for (const r of telemetry) if (!rows.has(String(r.hop)) || String(r.ts) > String(rows.get(String(r.hop)).ts)) rows.set(String(r.hop), r);
const costBySession = new Map();
for (const c of costs) {
  const sid = String(c.session_id || '');
  if (!sid) continue;
  const b = costBySession.get(sid) || { spend: 0, input: 0, output: 0, cached: 0, rows: 0 };
  b.spend += Number(c.spend_usd || 0); b.input += Number(c.input_tokens || 0); b.output += Number(c.output_tokens || 0); b.cached += Number(c.cached_tokens || 0); b.rows++;
  costBySession.set(sid, b);
}

function toolCallsFor(row) {
  const end = Date.parse(row.ts);
  if (!Number.isFinite(end)) return null;
  const start = end - Number(row.durationMs || 0);
  const god = String(row.god || '').split('-')[0];
  return activity.filter((a) => a?.action === 'tool_call' && Date.parse(a.ts) >= start && Date.parse(a.ts) <= end && (!god || String(a.god || '').startsWith(god))).length;
}

const enriched = [...rows.values()].map((r) => {
  const c = r.sessionId ? costBySession.get(String(r.sessionId)) : null;
  const durationMin = Number(r.durationMs || 0) / 60_000;
  const outPerSec = Number(r.tokensOut || 0) > 0 && Number(r.durationMs || 0) > 0 ? Number(r.tokensOut) / (Number(r.durationMs) / 1000) : null;
  return { ...r, durationMin, outPerSec, cost: c?.spend ?? null, tools: toolCallsFor(r) };
});

function med(values) { const a = values.filter((n) => Number.isFinite(n)).sort((x, y) => x - y); if (!a.length) return 0; return a[Math.floor((a.length - 1) / 2)]; }
function pct(values, p) { const a = values.filter((n) => Number.isFinite(n)).sort((x, y) => x - y); if (!a.length) return 0; return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]; }
const byGod = new Map();
for (const r of enriched) {
  const g = byGod.get(r.god) || { hops: 0, done: 0, parked: 0, durations: [], tokensIn: 0, tokensOut: 0, cost: 0 };
  g.hops++; g.durations.push(r.durationMin); if (String(r.status).startsWith('completed')) g.done++; if (String(r.status).startsWith('parked')) g.parked++;
  g.tokensIn += Number(r.tokensIn || 0); g.tokensOut += Number(r.tokensOut || 0); g.cost += Number(r.cost || 0);
  byGod.set(r.god, g);
}

const lines = [];
lines.push(`# Campaign report — ${path.basename(LANE)}`, '');
lines.push(`- Generated: ${new Date().toISOString()}`);
lines.push(`- Plan: ${plan?.hops?.length ?? 0} hops · completed: ${done.size} · remaining: ${Math.max(0, (plan?.hops?.length ?? 0) - done.size)}`);
lines.push(`- State: ${state?.parked ? `PARKED at ${state.parked.hopId} (${state.parked.reason})` : 'no park'} · campaign ${state?.campaignId ?? '?'}`);
lines.push('');
lines.push('## Per hop', '', '| hop | god | status | min | in | out | out tok/s | tools | cost |', '|---|---|---|---|---|---|---|---|---|');
for (const r of [...enriched].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))) {
  lines.push(`| ${r.hop} | ${r.god} | ${r.status} | ${r.durationMin.toFixed(1)} | ${r.tokensIn ?? '—'} | ${r.tokensOut ?? '—'} | ${r.outPerSec == null ? '—' : r.outPerSec.toFixed(2)} | ${r.tools ?? '—'} | ${r.cost == null ? '—' : `$${r.cost.toFixed(4)}`} |`);
}
lines.push('', '## By god', '', '| god | hops | done | parked | median min | p90 min | in | out | cost |', '|---|---|---|---|---|---|---|---|---|');
for (const [god, g] of [...byGod].sort((a, b) => b[1].durations.length - a[1].durations.length)) {
  lines.push(`| ${god} | ${g.hops} | ${g.done} | ${g.parked} | ${med(g.durations).toFixed(1)} | ${pct(g.durations, 90).toFixed(1)} | ${g.tokensIn} | ${g.tokensOut} | $${g.cost.toFixed(4)} |`);
}
lines.push('', '## Slowest hops', '');
for (const r of [...enriched].sort((a, b) => b.durationMin - a.durationMin).slice(0, 5)) lines.push(`- **${r.hop}** (${r.god}) — ${r.durationMin.toFixed(1)} min · ${r.status}${r.error ? ` · ${String(r.error).slice(0, 160)}` : ''}`);
lines.push('', '## Totals', '');
const durations = enriched.map((r) => r.durationMin);
const totalCost = enriched.reduce((n, r) => n + Number(r.cost || 0), 0);
lines.push(`- Median hop: **${med(durations).toFixed(1)} min** · p90: **${pct(durations, 90).toFixed(1)} min**`);
lines.push(`- Tokens: in ${enriched.reduce((n, r) => n + Number(r.tokensIn || 0), 0)} · out ${enriched.reduce((n, r) => n + Number(r.tokensOut || 0), 0)}`);
lines.push(`- Joined step cost: **$${totalCost.toFixed(4)}** (list/invoice remain separate in the cost panel)`);
lines.push(`- Tool calls (activity join, best effort): ${enriched.every((r) => r.tools == null) ? 'unavailable' : enriched.reduce((n, r) => n + Number(r.tools || 0), 0)}`);
lines.push('', '> The report is read-only. A null token row means the warm transport did not capture it; it is not zero.', '');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf-8');
console.log(`campaign-report: ${OUT}`);
