'use client';

/**
 * burn-panel.tsx — v0.0.96: the smart-burn control.
 *
 * The user sees the account truth (console anchor + local delta), the
 * projection, the roster the next hop/message will use, and the exact reasons.
 * The toggle never rewrites opencode.json; it writes ~/.olympus/burn-policy.json
 * and the runtime resolver applies it at the next boundary.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Flame, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'off' | 'pace' | 'burn' | 'reserve';

interface Policy { mode: Mode; targetPct: number; modelCeilingPct: number; updatedAt?: string }
interface Reason { god: string; model: string; tier: string; reason: string }
interface Decision {
  active: boolean; mode: Mode; targetPct: number; accountPct: number | null; dailyPct: number;
  projectedPct: number | null; daysLeft: number; step: number; roster: Record<string, string>;
  reasons: Reason[]; blocked: 'off' | 'console-sync-required' | 'stale-anchor' | 'quota-hit' | null; resumeAt?: string | null; generatedAt: string;
}
interface Account {
  monthlyPct: number | null; h5Pct: number | null; weeklyPct: number | null;
  spendMonthUsd: number; spend5hUsd: number; spend7dUsd: number; capUsd: number | null;
  source: 'console' | 'mixed' | 'local'; anchorAt: string | null; anchorAgeMs: number | null;
  weeklyResetAt: string; resetAt: string | null; requests: number | null; tokens: number | null;
  rollingResetAt?: string | null;
  modelMix: Array<{ model: string; pct: number }>;
}
interface Anchor {
  monthlyPct: number; h5Pct: number; weeklyPct: number; resetAt: string; capUsd: number | null;
  capturedAt: string; source: string;
}
interface BurnResponse { ok: boolean; policy: Policy; decision: Decision; account: Account; error?: string }

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'off', label: 'Off', hint: 'Static strategy; no runtime override' },
  { id: 'reserve', label: 'Reserve', hint: 'Target 70% — cost-effective' },
  { id: 'pace', label: 'Pace', hint: 'Target 90% — quality with a reserve' },
  { id: 'burn', label: 'Burn', hint: 'Target 95% — best quality, 5% reserve' },
];

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}%`;
}
function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}
function dt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function BurnPanel() {
  const [data, setData] = useState<BurnResponse | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [form, setForm] = useState({ monthlyPct: '', h5Pct: '', weeklyPct: '', resetAt: '', capUsd: '' });
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [r, a] = await Promise.all([
        fetch(`/api/olympus/burn${force ? '?force=1' : ''}`, { cache: 'no-store' }),
        fetch('/api/olympus/go-usage/console', { cache: 'no-store' }),
      ]);
      const d = await r.json();
      const ad = await a.json().catch(() => ({}));
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d);
      if (ad?.anchor) {
        setAnchor(ad.anchor);
        setForm((prev) => ({
          monthlyPct: prev.monthlyPct || String(ad.anchor.monthlyPct),
          h5Pct: prev.h5Pct || String(ad.anchor.h5Pct),
          weeklyPct: prev.weeklyPct || String(ad.anchor.weeklyPct),
          resetAt: prev.resetAt || String(ad.anchor.resetAt).slice(0, 10),
          capUsd: prev.capUsd || (ad.anchor.capUsd ? String(Math.round(ad.anchor.capUsd)) : ''),
        }));
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // First paint uses the cached decision; the refresh button forces a new
    // ledger scan. A cold scan is ~10s on a large AIME ledger; a warm one is
    // instant.
    void load(false);
    const iv = setInterval(() => { if (document.visibilityState !== 'hidden') void load(false); }, 60_000);
    // v0.0.97 — the GO console frame posts a fresh anchor every 30s; follow it
    // immediately so the graph and the decision never trail the console.
    const onSync = () => { if (document.visibilityState !== 'hidden') void load(false); };
    window.addEventListener('olympus:go-console-synced', onSync);
    return () => {
      clearInterval(iv);
      window.removeEventListener('olympus:go-console-synced', onSync);
    };
  }, [load]);

  const setMode = async (mode: Mode) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/olympus/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      await load(true);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSaving(true);
    setSyncMsg(null);
    setError(null);
    try {
      const reset = form.resetAt ? `${form.resetAt}T00:00:00.000Z` : '';
      const r = await fetch('/api/olympus/go-usage/console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyPct: Number(form.monthlyPct),
          h5Pct: Number(form.h5Pct),
          weeklyPct: Number(form.weeklyPct),
          resetAt: reset,
          capUsd: form.capUsd ? Number(form.capUsd) : undefined,
          plan: 'go-plus',
          source: 'manual',
        }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setAnchor(d.anchor);
      setSyncMsg(`anchored: ${pct(d.anchor.monthlyPct)} monthly · cap ${money(d.anchor.capUsd)} · ${dt(d.anchor.resetAt)}`);
      setSyncOpen(false);
      await load(true);
    } catch (e: any) {
      setSyncMsg(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const policy = data?.policy;
  const decision = data?.decision;
  const account = data?.account;
  const activeMode = policy?.mode ?? 'off';
  const rolling = account?.h5Pct ?? null;
  const weekly = account?.weeklyPct ?? null;
  const monthly = account?.monthlyPct ?? null;
  // The hard reserve line — same thresholds as burn-policy.ts. At this line
  // Burn/Pace cannot upgrade; Off and Reserve stay available.
  const hardPressure = (rolling != null && rolling >= 80)
    || (weekly != null && weekly >= 90)
    || (monthly != null && monthly >= 80);
  // v0.0.97 — the console truth is surfaced even when Burn is Off: the
  // decision short-circuits to blocked:'off', but a fresh 100% rolling anchor
  // is still a quota hit, and a >5 min anchor is still stale (no upgrades).
  const anchorAgeMin = account?.anchorAgeMs != null ? Math.round(account.anchorAgeMs / 60_000) : null;
  const quotaHit = decision?.blocked === 'quota-hit' || (rolling != null && rolling >= 100);
  const staleAnchor = decision?.blocked === 'stale-anchor'
    || (account?.anchorAgeMs != null && account.anchorAgeMs > 5 * 60_000);
  const resumeAt = decision?.resumeAt || account?.rollingResetAt || null;

  return (
    <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-3" aria-label="Smart burn policy">
      <div className="flex flex-wrap items-center gap-2">
        <Flame size={12} className="text-olympus-gold" />
        <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-olympus-gold">Smart burn</span>
        <span className="text-[8px] font-mono text-olympus-text-dim">
          {loading && !data ? 'reading the account…' : account?.source === 'console' ? `console anchor · ${pct(account.monthlyPct)} account${anchorAgeMin != null ? ` · ${anchorAgeMin}m ago` : ''}` : 'console sync required for exact account %'}
        </span>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          data-tip="Recompute the roster from the latest console anchor + local ledger"
          className="ml-auto flex items-center gap-1 rounded border border-olympus-text-dim/20 px-1.5 py-0.5 text-[8px] font-mono text-olympus-text-dim hover:border-olympus-gold/30 hover:text-olympus-gold disabled:opacity-40"
        >
          <RefreshCw size={9} className={loading ? 'animate-spin' : ''} /> refresh
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => void setMode(mode.id)}
            disabled={saving || ((quotaHit || staleAnchor || hardPressure) && (mode.id === 'burn' || mode.id === 'pace'))}
            data-tip={quotaHit
              ? 'GO 5-hour limit hit — wait for the reset; Off and Reserve remain available'
              : staleAnchor
                ? 'Console anchor is stale — keep the Frames → OpenCode frame open to auto-sync; Off and Reserve remain available'
                : hardPressure
                  ? 'Pressure at the reserve line (rolling/weekly/monthly) — Burn/Pace are paused; Reserve is enforced'
                  : mode.hint}
            className={cn(
              'rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-50',
              activeMode === mode.id
                ? 'border-olympus-gold/40 bg-olympus-gold/10 text-olympus-gold'
                : 'border-olympus-text-dim/15 text-olympus-text-dim hover:border-olympus-gold/30 hover:text-olympus-text',
            )}
          >
            <div className="text-[9px] font-mono font-semibold">{mode.label}</div>
            <div className="mt-0.5 text-[8px] font-mono leading-snug opacity-80">{mode.hint}</div>
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-[9px] font-mono text-olympus-red">{error}</p>}

      {loading && !data ? (
        <div className="mt-2 flex items-center gap-2 text-[9px] font-mono text-olympus-text-dim"><Loader2 size={11} className="animate-spin" /> reading the account + ledger…</div>
      ) : data && decision ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-olympus-text-dim/12 bg-olympus-bg/40 p-2">
              <div className="text-[8px] font-mono text-olympus-text-dim">account month</div>
              <div className="text-[15px] font-semibold text-olympus-gold">{pct(account?.monthlyPct)}</div>
              <div className="text-[8px] font-mono text-olympus-text-dim">{money(account?.spendMonthUsd)} local · cap {money(account?.capUsd)}</div>
            </div>
            <div className="rounded-lg border border-olympus-text-dim/12 bg-olympus-bg/40 p-2">
              <div className="text-[8px] font-mono text-olympus-text-dim">projection at reset</div>
              <div className={cn('text-[15px] font-semibold', decision.projectedPct != null && decision.projectedPct > decision.targetPct + 5 ? 'text-olympus-amber-soft' : 'text-olympus-green')}>{pct(decision.projectedPct)}</div>
              <div className="text-[8px] font-mono text-olympus-text-dim">target {pct(decision.targetPct)} · {decision.daysLeft.toFixed(1)}d left</div>
            </div>
            <div className="rounded-lg border border-olympus-text-dim/12 bg-olympus-bg/40 p-2">
              <div className="text-[8px] font-mono text-olympus-text-dim">5h / weekly</div>
              <div className="text-[13px] font-semibold text-olympus-text">{pct(account?.h5Pct)} / {pct(account?.weeklyPct)}</div>
              <div className="text-[8px] font-mono text-olympus-text-dim">weekly resets {dt(account?.weeklyResetAt)}</div>
            </div>
            <div className="rounded-lg border border-olympus-text-dim/12 bg-olympus-bg/40 p-2">
              <div className="text-[8px] font-mono text-olympus-text-dim">decision</div>
              <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-olympus-text">
                {decision.blocked === 'console-sync-required' ? <AlertTriangle size={11} className="text-olympus-amber-soft" /> : decision.step > 0 ? <ArrowUpCircle size={11} className="text-olympus-gold" /> : decision.step < 0 ? <ShieldCheck size={11} className="text-olympus-cyan" /> : <CheckCircle2 size={11} className="text-olympus-green" />}
                {decision.blocked === 'console-sync-required' ? 'sync console' : decision.blocked === 'stale-anchor' ? 'paused (stale)' : decision.blocked === 'quota-hit' ? 'limit hit' : decision.step > 0 ? 'upgrade' : decision.step < 0 ? 'step down' : 'hold'}
              </div>
              <div className="text-[8px] font-mono text-olympus-text-dim">applies at the next hop/message</div>
            </div>
          </div>

          {decision.blocked === 'console-sync-required' && (
            <div className="mt-2 rounded-lg border border-olympus-amber-soft/30 bg-olympus-amber-soft/5 px-2 py-1.5 text-[9px] font-mono text-olympus-amber-soft">
              The account percentage has no console anchor. Open Frames → OpenCode (the logged-in GO console) or use Sync GO console.
            </div>
          )}
          {staleAnchor && (
            <div className="mt-2 rounded-lg border border-olympus-amber-soft/35 bg-olympus-amber-soft/5 px-2 py-1.5 text-[9px] font-mono text-olympus-amber-soft">
              Console anchor is {anchorAgeMin != null ? `${anchorAgeMin} min` : 'stale'} old — upgrades are PAUSED. Keep the Frames → OpenCode console open; it auto-syncs every 30s, or use Sync GO console.
            </div>
          )}
          {quotaHit && (
            <div className="mt-2 rounded-lg border border-olympus-red/35 bg-olympus-red/5 px-2 py-1.5 text-[9px] font-mono text-olympus-red">
              GO 5-hour limit hit — no new hops until {resumeAt ? new Date(resumeAt).toLocaleString() : 'the rolling reset'}. The walk is parked; Burn cannot upgrade.
            </div>
          )}
          {!quotaHit && !staleAnchor && hardPressure && (
            <div className="mt-2 rounded-lg border border-olympus-amber-soft/35 bg-olympus-amber-soft/5 px-2 py-1.5 text-[9px] font-mono text-olympus-amber-soft">
              Pressure at the reserve line (rolling {pct(rolling)} · weekly {pct(weekly)} · monthly {pct(monthly)}) — Burn/Pace are paused; Reserve is enforced. The policy re-evaluates on the next console sync.
            </div>
          )}

          <div className="mt-2 overflow-hidden rounded-lg border border-olympus-text-dim/12">
            <div className="grid grid-cols-[70px_1fr_60px] gap-2 border-b border-olympus-text-dim/10 bg-olympus-bg/40 px-2 py-1 text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">
              <span>god</span><span>next model</span><span>why</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {(decision.reasons ?? []).map((r) => (
                <div key={r.god} className="grid grid-cols-[70px_1fr_60px] gap-2 border-b border-olympus-text-dim/5 px-2 py-1 text-[8px] font-mono">
                  <span className="text-olympus-text">{r.god}</span>
                  <span className={cn('truncate', r.model ? 'text-olympus-gold' : 'text-olympus-red')} data-tip={r.model || 'static config stays'}>{r.model ? r.model.replace('opencode-go/', '') : 'static'}</span>
                  <span className="truncate text-olympus-text-dim" data-tip={r.reason}>{r.tier}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSyncOpen((v) => !v)}
              className="rounded-md border border-olympus-text-dim/20 px-2 py-1 text-[8px] font-mono text-olympus-text-dim hover:border-olympus-gold/30 hover:text-olympus-gold"
            >
              {syncOpen ? 'close console sync' : 'sync GO console'}
            </button>
            <span className="text-[8px] font-mono text-olympus-text-dim">
              {anchor ? `anchored ${dt(anchor.capturedAt)} · exact after sync` : 'no anchor — local ledger only'}
            </span>
          </div>

          {syncOpen && (
            <div className="mt-2 rounded-lg border border-olympus-gold/20 bg-olympus-bg/40 p-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {([
                  ['monthlyPct', 'monthly %'],
                  ['h5Pct', 'rolling %'],
                  ['weeklyPct', 'weekly %'],
                  ['resetAt', 'reset (YYYY-MM-DD)'],
                  ['capUsd', 'cap USD (optional)'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="block text-[8px] font-mono text-olympus-text-dim">{label}</span>
                    <input
                      value={form[key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="mt-0.5 w-full rounded border border-olympus-gold/20 bg-olympus-panel px-1.5 py-1 text-[9px] font-mono text-olympus-text focus:outline-none focus:ring-1 focus:ring-olympus-gold/40"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void sync()}
                  disabled={saving}
                  className="rounded-md bg-olympus-gold/15 px-2 py-1 text-[9px] font-mono text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25 disabled:opacity-40"
                >
                  {saving ? <Loader2 size={10} className="inline animate-spin" /> : null} save anchor
                </button>
                {syncMsg && <span className="text-[8px] font-mono text-olympus-text-dim">{syncMsg}</span>}
              </div>
            </div>
          )}
        </>
      ) : null}

      <p className="mt-2 text-[8px] leading-relaxed text-olympus-text-dim/80">
        The console is authoritative for the account percentage. The local ledger supplies the delta and the per-model headroom. A model with no known cap is shown as static, never guessed. The toggle applies at the next hop/message — no config rewrite, no live turn cut.
      </p>
    </section>
  );
}
