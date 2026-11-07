/**
 * GoForecastChart — v0.0.89: "when will this run out, at the current pace?"
 *
 * The GO usage bar says how much was used; this chart says where the month is
 * heading. It plots the measured cumulative monthly percentage (the actual
 * ledger rows), the linear forecast to the renewal, the monthly limit and the
 * date the forecast crosses 100% — the same story the console tells, measured
 * locally and labelled as an estimate.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';

interface Point { ts: string; pct: number }
interface Forecast {
  model: string; currentPct: number; dailyPct: number; projectedPct: number;
  hitAt: string | null; resetAt: string; periodStart: string; points: Point[];
}
interface Usage {
  ok?: boolean; plan?: string; source?: string; updatedAt?: string;
  windows?: { month?: { pct: number | null; model: string | null; resetAt: string | null } };
  forecast?: Forecast | null;
}

const PLAN_LABEL: Record<string, string> = { go: 'Go', 'go-plus': 'Go Plus', 'go-teams': 'Go Teams' };
const DAY = 86_400_000;

function dateLabel(ts?: string | null, withYear = false): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).toUpperCase();
}

function moneyPct(v: number): string {
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}%`;
}

export default function GoForecastChart() {
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/olympus/go-usage', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!cancelled) { setData(d); setError(false); }
      } catch { if (!cancelled) setError(true); }
    };
    void load();
    const iv = setInterval(() => { void load(); }, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-olympus-gold/15 bg-olympus-card px-3 py-2 text-[9px] font-mono text-olympus-text-dim">
        The GO ledger is unavailable; the console remains authoritative.
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-[190px] animate-pulse rounded-xl border border-olympus-gold/10 bg-olympus-card" aria-label="Loading GO forecast" />
    );
  }

  const f = data.forecast;
  const plan = PLAN_LABEL[String(data.plan || 'go-plus')] ?? 'Go Plus';
  if (!f) {
    return (
      <div className="rounded-xl border border-olympus-gold/15 bg-olympus-card px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide text-olympus-gold"><TrendingUp size={11} /> {plan} pace</div>
        <p className="mt-1 text-[10px] text-olympus-text-dim">No measured monthly usage in the local ledger yet — the forecast starts with the first priced turn. The console is authoritative.</p>
      </div>
    );
  }

  const W = 720, H = 220;
  const M = { l: 46, r: 18, t: 14, b: 28 };
  const start = Date.parse(f.periodStart);
  const reset = Date.parse(f.resetAt);
  const now = Date.now();
  const span = Math.max(1, reset - start);
  const yMax = Math.max(100, Math.ceil(Math.max(f.projectedPct, f.currentPct * 1.15, 100) / 100) * 100);
  const x = (ts: number) => M.l + ((Math.min(reset, Math.max(start, ts)) - start) / span) * (W - M.l - M.r);
  const y = (pct: number) => H - M.b - (Math.min(yMax, Math.max(0, pct)) / yMax) * (H - M.t - M.b);
  const xNow = x(now);
  const xReset = x(reset);
  const hitTs = f.hitAt ? Date.parse(f.hitAt) : null;
  const xHit = hitTs ? x(hitTs) : null;
  const actual = [...f.points].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const actualPath = actual.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(Date.parse(p.ts)).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(' ');
  const forecastPath = `M ${xNow.toFixed(1)} ${y(f.currentPct).toFixed(1)} L ${xReset.toFixed(1)} ${y(f.projectedPct).toFixed(1)}`;
  const hatchPath = `M ${xNow.toFixed(1)} ${y(f.currentPct).toFixed(1)} L ${xReset.toFixed(1)} ${y(f.projectedPct).toFixed(1)} L ${xReset.toFixed(1)} ${y(0).toFixed(1)} L ${xNow.toFixed(1)} ${y(0).toFixed(1)} Z`;
  const gridValues: number[] = [];
  for (let v = 0; v <= yMax; v += 100) gridValues.push(v);
  const midTs = xHit ?? start + span / 2;
  const pace = f.dailyPct >= 0.1 ? f.dailyPct.toFixed(1) : f.dailyPct.toFixed(2);

  return (
    <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-3" aria-label={`${plan} usage forecast`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[24px] font-semibold leading-none text-olympus-gold">{moneyPct(f.currentPct)}</div>
          <div className="mt-1 text-[9px] font-mono text-olympus-text-dim">
            {plan} usage · Renews {dateLabel(f.resetAt)}
            {data.source === 'local-ledger' ? ' · local ledger' : ''}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-mono ${
            f.hitAt ? 'border-olympus-gold/35 bg-olympus-gold/10 text-olympus-gold' : 'border-olympus-green/30 bg-olympus-green/10 text-olympus-green'
          }`}
          data-tip={f.hitAt ? 'The forecast crosses 100% before the renewal at the measured pace.' : 'The measured pace stays under 100% until the renewal.'}
        >
          {f.hitAt ? `On pace to hit the limit ${dateLabel(f.hitAt)}` : 'Within the limit this period'}
        </span>
      </header>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${plan} cumulative usage: ${moneyPct(f.currentPct)} now, forecast ${moneyPct(f.projectedPct)} at renewal`}>
        <defs>
          <pattern id="go-forecast-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#D4A574" strokeWidth="1" opacity="0.35" />
          </pattern>
          <radialGradient id="go-now-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#7BAE8E" stopOpacity="0.5" />
            <stop offset="1" stopColor="#7BAE8E" stopOpacity="0" />
          </radialGradient>
        </defs>

        {gridValues.map((v) => (
          <g key={v}>
            <line x1={M.l} y1={y(v)} x2={W - M.r} y2={y(v)} stroke="#2A2E38" strokeWidth="0.7" />
            <text x={M.l - 8} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#8B8B8B" fontFamily="ui-monospace, monospace">{v}%</text>
          </g>
        ))}

        {/* The 100% monthly limit. */}
        <line x1={M.l} y1={y(100)} x2={W - M.r} y2={y(100)} stroke="#C4756A" strokeWidth="1" strokeDasharray="4 4" opacity="0.85" />
        <text x={W - M.r} y={y(100) - 4} textAnchor="end" fontSize="8" fill="#C4756A" fontFamily="ui-monospace, monospace">MONTHLY LIMIT</text>

        {/* The forecast area is hatched, never a filled promise. */}
        <path d={hatchPath} fill="url(#go-forecast-hatch)" />
        <path d={actualPath} fill="none" stroke="#7BAE8E" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={forecastPath} fill="none" stroke="#D4A574" strokeWidth="1.8" strokeDasharray="5 4" strokeLinecap="round" />

        {xHit !== null && (
          <g>
            <line x1={xHit} y1={y(100)} x2={xHit} y2={y(0)} stroke="#D4A574" strokeWidth="0.7" strokeDasharray="2 4" opacity="0.45" />
            <circle cx={xHit} cy={y(100)} r="4" fill="#0B0E13" stroke="#D4A574" strokeWidth="1.6" />
          </g>
        )}
        <circle cx={xNow} cy={y(f.currentPct)} r="10" fill="url(#go-now-glow)" />
        <circle cx={xNow} cy={y(f.currentPct)} r="3.4" fill="#7BAE8E" stroke="#0B0E13" strokeWidth="1.2" />
        <circle cx={xReset} cy={y(f.projectedPct)} r="3.4" fill="#0B0E13" stroke="#D4A574" strokeWidth="1.6" />

        {[start, midTs, reset].map((ts, i) => (
          <text
            key={i} x={x(ts)} y={H - 8}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fontSize="8" fill="#8B8B8B" fontFamily="ui-monospace, monospace"
          >{dateLabel(new Date(ts).toISOString())}</text>
        ))}
      </svg>

      <footer className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[8px] font-mono text-olympus-text-dim">
        <span>Average {pace}% a day · {f.points.length} ledger point{f.points.length === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><span className="h-[2px] w-4 bg-olympus-green" /> Usage</span>
          <span className="flex items-center gap-1"><span className="h-[2px] w-4 border-t border-dashed border-olympus-gold" /> Forecast</span>
          <span className="flex items-center gap-1"><span className="h-[2px] w-4 border-t border-dashed border-olympus-red" /> Monthly limit</span>
        </span>
      </footer>
      <p className="mt-1 text-[7px] font-mono leading-relaxed text-olympus-text-dim/80">
        The forecast is a linear burn of the local ledger (current % ÷ elapsed subscription days). The OpenCode console is authoritative; Extra Usage may bill PAYG.
      </p>
    </section>
  );
}
