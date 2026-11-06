/**
 * /m/widget — the live OLYMPUS status widget (v0.0.84 edit).
 *
 * A phone-sized, read-only view of the campaign: progress, the in-flight hop,
 * the GO Plus buckets and the money numbers. It is the screen the hibernation
 * HUD opens, and it can be added to the phone's home screen as a standalone
 * shortcut (`manifest-widget.webmanifest`). It never exposes the vault or the
 * session; the token in `#t=` is the same mobile capability token.
 *
 * Live: polls run-state + GO usage every 5s while visible. No ring, no particle
 * field, no full app — this is meant to be cheap enough to leave open.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Coins, Gauge, RefreshCw, Radio, Zap } from 'lucide-react';
import { applyTheme, normalizeThemeState, resolvePalette, type ThemeState } from '@/lib/theme';
import { mobileFetch } from '@/lib/mobile-fetch';

const TOKEN_KEY = 'olympus:mobile-token';
const THEME_KEY = 'olympus:mobile-theme';

type RunState = {
  line?: string;
  campaign?: { state?: string; lane?: string };
  hops?: {
    completed?: number;
    total?: number;
    inFlight?: number;
    inFlightList?: Array<{ hopId: string; god?: string }>;
    parked?: { hopId?: string; reason?: string } | null;
  };
};

type UsageWindow = { pct?: number | null; model?: string | null };
type Usage = {
  plan?: string;
  source?: string;
  binding?: { model?: string; window?: string; pct?: number } | null;
  windows?: { h5?: UsageWindow; d7?: UsageWindow; month?: UsageWindow };
  models?: Array<{ model?: string; spend5h?: number; spend7d?: number; spendMonth?: number; limit?: number | null }>;
};

type Costs = { spend?: number; stepCost?: number; total?: number };

function pct(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}

export default function LiveWidgetPage() {
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [costs, setCosts] = useState<Costs | null>(null);
  const [project, setProject] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('t') || '';
      const stored = localStorage.getItem(TOKEN_KEY) || '';
      setToken(fromHash || stored || null);
      const raw = localStorage.getItem(THEME_KEY);
      if (raw) setTheme(normalizeThemeState(JSON.parse(raw)));
    } catch { /* private mode */ }
  }, []);

  const palette = useMemo(() => resolvePalette(normalizeThemeState(theme)), [theme]);

  useEffect(() => {
    if (!theme) return;
    try { applyTheme(theme, document.documentElement); } catch { /* non-DOM */ }
  }, [theme]);

  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-olympus-token'] = token;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const [pRes, rRes, gRes, cRes, tRes] = await Promise.all([
        mobileFetch('/api/olympus/projects', { cache: 'no-store', headers }, 20_000),
        mobileFetch('/api/olympus/run-state', { cache: 'no-store', headers }, 20_000),
        mobileFetch('/api/olympus/go-usage', { cache: 'no-store', headers }, 25_000),
        mobileFetch('/api/olympus/costs?window=24h', { cache: 'no-store', headers }, 20_000),
        mobileFetch('/api/olympus/theme', { cache: 'no-store', headers }, 15_000),
      ]);
      if (pRes.ok) {
        const d = await pRes.json().catch(() => null);
        const active = String(d?.active?.slug || '');
        setProject(active || String(d?.projects?.[0]?.slug || ''));
      }
      if (rRes.ok) setRun(await rRes.json().catch(() => null));
      if (gRes.ok) setUsage(await gRes.json().catch(() => null));
      if (cRes.ok) setCosts(await cRes.json().catch(() => null));
      if (tRes.ok) {
        const d = await tRes.json().catch(() => null);
        if (d?.state) {
          const next = normalizeThemeState(d.state);
          setTheme(next);
          try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch { /* private */ }
        }
      }
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'offline');
    } finally {
      setBusy(false);
    }
  }, [token, busy, headers]);

  useEffect(() => {
    if (!token) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, 5_000);
    return () => clearInterval(timer);
  }, [token, load]);

  const completed = Number(run?.hops?.completed ?? 0);
  const total = Number(run?.hops?.total ?? 0);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const state = run?.campaign?.state || 'idle';
  const inFlight = run?.hops?.inFlightList ?? [];
  const parked = run?.hops?.parked ?? null;
  const h5 = pct(usage?.windows?.h5?.pct);
  const d7 = pct(usage?.windows?.d7?.pct);
  const mo = pct(usage?.windows?.month?.pct);
  const binding = usage?.binding?.model ? `${usage.binding.model} · ${usage.binding.window || ''} ${pct(usage.binding.pct) ?? '—'}%` : 'no binding';
  const listValue = usage?.models?.find((m) => m.model === usage?.binding?.model)?.spendMonth;
  const step = costs?.stepCost ?? costs?.spend ?? costs?.total;

  const card = { border: `1px solid ${palette.gold}22`, background: `${palette.card}cc` } as const;
  const dim = { color: palette.textDim } as const;
  const mono = 'font-mono tabular-nums';

  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6" style={{ background: palette.bg, color: palette.text }}>
        <div className="max-w-sm text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: palette.gold }}>OLYMPUS</div>
          <p className="mt-3 text-sm" style={dim}>Abra este widget pelo OLYMPUS mobile para herdar a sessão.</p>
          <Link href="/m" className="mt-4 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-mono" style={{ background: palette.gold, color: palette.bg }}>
            abrir /m <ArrowUpRight size={12} />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]" style={{ background: palette.bg, color: palette.text }}>
      <header className="flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-[0.28em]" style={{ color: palette.gold }}>OLYMPUS</span>
        <span className="flex items-center gap-1 text-[9px] font-mono uppercase" style={{ color: palette.green }}>
          <Radio size={9} className={busy ? 'animate-pulse' : ''} /> live
        </span>
        <span className="ml-auto text-[9px] font-mono" style={dim}>{updatedAt || '—'}</span>
        <button onClick={() => void load()} aria-label="Refresh widget" className="rounded p-1" style={dim}>
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
        </button>
      </header>

      <section className="rounded-xl p-3" style={card}>
        <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider" style={dim}>
          <span>{project || 'campaign'}</span>
          <span style={{ color: state === 'running' ? palette.green : state === 'parked' ? palette.gold : palette.textDim }}>{state}</span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <div className={`${mono} text-2xl font-semibold`}>{completed}<span className="text-sm" style={dim}>/{total || '—'}</span></div>
          <div className={`${mono} text-lg`} style={{ color: palette.cyan }}>{total ? `${progress}%` : '—'}</div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: palette.bg }}>
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, background: palette.gold }} />
        </div>
        <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed" style={dim}>{run?.line || 'waiting for the walker'}</p>
        {inFlight.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {inFlight.slice(0, 4).map((h) => (
              <span key={h.hopId} className="rounded-full px-1.5 py-0.5 text-[9px] font-mono" style={{ border: `1px solid ${palette.cyan}44`, color: palette.cyan }}>
                {h.hopId}{h.god ? ` · ${h.god}` : ''}
              </span>
            ))}
          </div>
        )}
        {parked?.hopId && (
          <p className="mt-2 text-[9px] font-mono" style={{ color: palette.gold }}>
            parked: {parked.hopId}{parked.reason ? ` · ${parked.reason}` : ''}
          </p>
        )}
      </section>

      <section className="rounded-xl p-3" style={card}>
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider" style={dim}>
          <Gauge size={10} style={{ color: palette.cyan }} /> {usage?.plan === 'go-plus' ? 'GO Plus' : (usage?.plan || 'GO')}
          <span className="ml-auto truncate" style={{ color: palette.gold }}>{binding}</span>
        </div>
        {[
          ['5h', h5],
          ['week', d7],
          ['month', mo],
        ].map(([label, value]) => {
          const v = typeof value === 'number' ? value : null;
          return (
            <div key={String(label)} className="mt-2 flex items-center gap-2">
              <span className="w-9 text-[9px] font-mono uppercase" style={dim}>{label}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: palette.bg }}>
                <div className="h-full rounded-full" style={{ width: `${v ?? 0}%`, background: (v ?? 0) >= 90 ? palette.red : (v ?? 0) >= 70 ? palette.gold : palette.green }} />
              </div>
              <span className={`${mono} w-8 text-right text-[9px]`} style={{ color: palette.text }}>{v == null ? '—' : `${v}%`}</span>
            </div>
          );
        })}
        <div className="mt-2 flex items-center gap-2 text-[9px] font-mono" style={dim}>
          <Coins size={9} style={{ color: palette.gold }} />
          <span>step {money(step)}</span>
          <span className="ml-auto">list {money(listValue)}</span>
          <span style={{ color: palette.amberSoft }}>invoice {usage?.source === 'local-ledger' ? 'unknown' : '—'}</span>
        </div>
      </section>

      <div className="flex items-center gap-2 text-[9px] font-mono" style={dim}>
        <Zap size={9} style={{ color: palette.gold }} />
        <span>{error ? `offline · ${error}` : 'read-only · no vault, no chat surface'}</span>
        <Link href="/m" className="ml-auto inline-flex items-center gap-1" style={{ color: palette.gold }}>
          abrir OLYMPUS <ArrowUpRight size={10} />
        </Link>
      </div>

      <p className="text-center text-[8px] font-mono" style={dim}>
        adicione à tela inicial para um widget ao vivo · sem acordar a janela principal
      </p>
    </main>
  );
}
