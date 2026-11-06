/**
 * go-usage-bar.tsx — v0.0.81: the GO Plus consumption instrument.
 *
 * Three windows (5h, week, month) over the PER-MODEL plan limits. The binding
 * model is named; the expanded table shows every lane, the spend/limit and a
 * burn-rate projection. "—" is honest: no readable ledger, no invented 0%.
 *
 * Used by the desktop creative studio and the mobile studio (compact).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Gauge, RefreshCw } from 'lucide-react';
import { mobileFetch } from '@/lib/mobile-fetch';

type Plan = 'go' | 'go-plus' | 'go-teams';
type WindowKey = 'h5' | 'd7' | 'month';

interface ModelUsage {
  model: string;
  spend5h: number;
  spend7d: number;
  spendMonth: number;
  limit: number | null;
  pct5h: number | null;
  pct7d: number | null;
  pctMonth: number | null;
  projectedDays: number | null;
}

interface Usage {
  plan: Plan;
  models: ModelUsage[];
  windows: Record<WindowKey, { pct: number | null; model: string | null; resetAt: string | null }>;
  binding: { model: string; window: WindowKey; pct: number } | null;
  source: 'local-ledger' | 'unavailable';
  updatedAt: string;
  note: string;
  catalogSource?: string;
  ledgerRows?: number;
}

const WINDOW_LABEL: Record<WindowKey, string> = { h5: '5h', d7: 'week', month: 'month' };
const PLAN_LABEL: Record<Plan, string> = { go: 'GO', 'go-plus': 'GO Plus', 'go-teams': 'GO Teams' };

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(1)}`;
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

function fmtReset(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'reset';
  const h = Math.floor(ms / 3600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d${h % 24}h`;
  if (h > 0) return `${h}h${Math.floor((ms % 3600_000) / 60_000)}m`;
  return `${Math.floor(ms / 60_000)}m`;
}

function tint(pct: number | null): string {
  if (pct == null) return 'bg-olympus-text-dim/30';
  if (pct >= 90) return 'bg-olympus-red';
  if (pct >= 70) return 'bg-olympus-gold';
  return 'bg-olympus-green';
}

function textTint(pct: number | null): string {
  if (pct == null) return 'text-olympus-text-dim';
  if (pct >= 90) return 'text-olympus-red';
  if (pct >= 70) return 'text-olympus-gold';
  return 'text-olympus-green';
}

export default function GoUsageBar({ token }: { token?: string | null }) {
  const [data, setData] = useState<Usage | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const mobileToken = token || (() => { try { return localStorage.getItem('olympus:mobile-token'); } catch { return null; } })();
      // v0.0.84 — the first call on a cold process scans the chat + hop DBs
      // (measured 6–9s, longer while a hop throttles the CPU). 12s aborted the
      // instrument exactly when it was most useful; 25s matches the cold scan.
      const r = await mobileFetch('/api/olympus/go-usage', {
        cache: 'no-store',
        headers: mobileToken ? { 'x-olympus-token': mobileToken } : undefined,
      }, 25_000);
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d as Usage);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'usage unavailable');
    }
  }, [token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const setPlan = useCallback(async (plan: Plan) => {
    setBusy(true);
    try {
      const mobileToken = token || (() => { try { return localStorage.getItem('olympus:mobile-token'); } catch { return null; } })();
      const r = await mobileFetch('/api/olympus/go-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(mobileToken ? { 'x-olympus-token': mobileToken } : {}) },
        body: JSON.stringify({ plan }),
      }, 20_000);
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      await load();
    } catch (e: any) { setError(e?.message || 'could not set the plan'); }
    finally { setBusy(false); }
  }, [token, load]);

  if (!data && !error) {
    return (
      <div className="w-full rounded-lg border border-olympus-gold/15 bg-olympus-panel/60 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Gauge size={10} className="text-olympus-cyan shrink-0" />
          <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">GO Plus</span>
          <span className="min-w-0 flex-1 truncate text-[8px] font-mono text-olympus-text-dim">reading the ledger…</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded bg-olympus-bg">
          <div className="h-full w-1/3 animate-pulse rounded bg-olympus-gold/40" />
        </div>
      </div>
    );
  }
  const binding = data?.binding;
  const unavailable = data?.source === 'unavailable';

  return (
    <div className="w-full rounded-lg border border-olympus-gold/15 bg-olympus-panel/60 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Gauge size={10} className="text-olympus-cyan shrink-0" />
        <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">{data ? PLAN_LABEL[data.plan] : 'GO'}</span>
        <span className="min-w-0 flex-1 truncate text-[8px] font-mono text-olympus-text-dim" data-tip={binding ? `${binding.model} · ${WINDOW_LABEL[binding.window]}` : 'no ledger'}>
          {unavailable ? 'ledger unavailable' : binding ? `${binding.model} · ${WINDOW_LABEL[binding.window]} ${fmtPct(binding.pct)}` : 'no usage yet'}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Expand GO usage"
          className="rounded p-0.5 text-olympus-text-dim hover:text-olympus-gold"
        >
          <ChevronDown size={10} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
        <button onClick={() => void load()} aria-label="Refresh GO usage" className="rounded p-0.5 text-olympus-text-dim hover:text-olympus-gold">
          <RefreshCw size={9} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mt-1 space-y-1">
        {(['h5', 'd7', 'month'] as WindowKey[]).map((w) => {
          const pct = data?.windows?.[w]?.pct ?? null;
          const reset = fmtReset(data?.windows?.[w]?.resetAt ?? null);
          return (
            <div key={w} className="flex items-center gap-1.5" data-tip={`${WINDOW_LABEL[w]}: ${fmtPct(pct)}${data?.windows?.[w]?.model ? ` · ${data.windows[w].model}` : ''}`}>
              <span className="w-8 shrink-0 text-[7.5px] font-mono uppercase text-olympus-text-dim">{WINDOW_LABEL[w]}</span>
              <div className="h-1 flex-1 overflow-hidden rounded bg-olympus-bg">
                <div
                  className={`h-full w-full origin-left rounded ${tint(pct)}`}
                  style={{ transform: `scaleX(${pct == null ? 0 : Math.min(1, pct / 100)})`, transition: 'transform .4s ease' }}
                />
              </div>
              <span className={`w-8 shrink-0 text-right text-[7.5px] font-mono tabular-nums ${textTint(pct)}`}>{fmtPct(pct)}</span>
              <span className="w-10 shrink-0 text-right text-[7px] font-mono text-olympus-text-dim">{reset}</span>
            </div>
          );
        })}
      </div>

      {open && data && (
        <div className="mt-2 border-t border-olympus-gold/10 pt-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] font-mono uppercase text-olympus-text-dim">plan</span>
            <select
              value={data.plan}
              onChange={(e) => void setPlan(e.target.value as Plan)}
              disabled={busy}
              className="rounded border border-olympus-gold/20 bg-olympus-bg px-1 py-0.5 text-[8px] font-mono text-olympus-text"
              aria-label="GO plan"
            >
              {(['go', 'go-plus', 'go-teams'] as Plan[]).map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
            </select>
            <span className="ml-auto text-[7px] font-mono text-olympus-text-dim">{data.ledgerRows ?? 0} turns · {data.catalogSource ?? '—'}</span>
          </div>
          <div className="mt-1 max-h-40 overflow-y-auto custom-scroll">
            <table className="w-full text-[7.5px] font-mono">
              <thead className="text-olympus-text-dim">
                <tr>
                  <th className="text-left font-normal">model</th>
                  <th className="text-right font-normal">5h</th>
                  <th className="text-right font-normal">wk</th>
                  <th className="text-right font-normal">mo</th>
                  <th className="text-right font-normal">$ / limit</th>
                </tr>
              </thead>
              <tbody>
                {data.models.slice(0, 10).map((m) => (
                  <tr key={m.model} data-tip={`${m.model} · ${fmtMoney(m.spendMonth)} of ${m.limit == null ? 'unknown' : fmtMoney(m.limit)} · projection ${m.projectedDays == null ? '—' : `${Math.round(m.projectedDays)}d`}`}>
                    <td className="max-w-[110px] truncate text-olympus-text">{m.model}</td>
                    <td className={`text-right tabular-nums ${textTint(m.pct5h)}`}>{fmtPct(m.pct5h)}</td>
                    <td className={`text-right tabular-nums ${textTint(m.pct7d)}`}>{fmtPct(m.pct7d)}</td>
                    <td className={`text-right tabular-nums ${textTint(m.pctMonth)}`}>{fmtPct(m.pctMonth)}</td>
                    <td className="text-right tabular-nums text-olympus-text-dim">{fmtMoney(m.spendMonth)} / {m.limit == null ? '—' : fmtMoney(m.limit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[6.5px] leading-relaxed text-olympus-text-dim">
            local ledger · console is authoritative · Extra Usage may bill PAYG
          </p>
        </div>
      )}

      {error && <p className="mt-0.5 text-[7px] font-mono text-olympus-red">{error}</p>}
    </div>
  );
}
