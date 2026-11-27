'use client';

/**
 * logs-dashboard.tsx — v0.0.98: the Logs workspace.
 *
 * One read (`/api/olympus/logs`) → the whole recent truth: hops, walks,
 * models, economy. The detail is a full screen inside the Logs pane (back
 * button) — no 8px tables, no fake numbers.
 *
 * Tabs: Visão geral · Hops · Walks · Models · Economy.
 * (Arsenal/Brain/Audit follow in v0.0.99; the data is already indexed.)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText, RefreshCw, Search, ArrowLeft, Copy, Check,
  CircleCheck, CircleAlert, Clock3, Coins, Cpu, Route, Boxes, Gauge, ShieldAlert, Wrench, Server, Activity, ListTree, RotateCcw, TriangleAlert, LayoutGrid, ShieldCheck,
} from 'lucide-react';
import { planHealth, estimateHopToolBudget } from '@/lib/plan-health';
import { useLanguage, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { LogHop, LogWalk, LogsPayload } from '@/lib/logs-index';

type Tab = 'overview' | 'hops' | 'walks' | 'portfolio' | 'blocked' | 'boot' | 'plan' | 'recovery' | 'errors' | 'hygiene' | 'models' | 'economy';

interface HygienePayload {
  version: string; generatedAt: string; ok: boolean;
  gates: Array<{ name: string; ok: boolean; ms: number }>;
  battery: { pass: number | null; fail: number | null; suites: number | null } | null;
}

interface PortfolioProject {
  slug: string; generation: number; status: 'RUNNING' | 'PARKED' | 'DONE' | 'IDLE'; completed: number; total: number;
  hopsToDonePct: number; parkedHop: string | null; profile: string | null; profileLabel: string | null;
  profileCheck: { ok: boolean; violations: string[] } | null; liveWalk: boolean;
  firstGreenMs: number | null; doneMs: number | null; parkRatePct: number | null; attempts: number;
  tokensOut: number; lastActivity: string | null;
}
interface PortfolioPayload {
  ok: true; generatedAt: string; projects: PortfolioProject[];
  totals: { projects: number; running: number; parked: number; done: number; hops: number; completed: number; firstGreenMs: number | null; parkRatePct: number | null };
}

interface BootHealth {
  app: { version: string; port: number; portAlive: boolean; health: { ok: boolean; status: number | null; ms: number; error: string | null }; mode: string };
  boot: { at: string | null; bootId: string | null; electronPid: number | null; nextPid: number | null; nextExternal: boolean; watchdogRespawns: number; lastRespawnAt: string | null; lastWatchdogAt: string | null } | null;
  opencode: { port: number; alive: boolean };
  mcpGit: Array<{ pid: number; ppid: number; etimes: number }>;
  errorLog: { bytes: number; rotated: boolean; lastErrorAt: string | null };
}

const TABS: Array<{ id: Tab; labelKey: string; icon: any }> = [
  { id: 'overview', labelKey: 'logs.tab.overview', icon: Gauge },
  { id: 'hops', labelKey: 'logs.tab.hops', icon: Route },
  { id: 'walks', labelKey: 'logs.tab.walks', icon: Boxes },
  { id: 'portfolio', labelKey: 'logs.tab.portfolio', icon: LayoutGrid },
  { id: 'blocked', labelKey: 'logs.tab.blocked', icon: ShieldAlert },
  { id: 'boot', labelKey: 'logs.tab.boot', icon: Server },
  { id: 'plan', labelKey: 'logs.tab.plan', icon: ListTree },
  { id: 'recovery', labelKey: 'logs.tab.recovery', icon: RotateCcw },
  { id: 'errors', labelKey: 'logs.tab.errors', icon: TriangleAlert },
  { id: 'hygiene', labelKey: 'logs.tab.hygiene', icon: ShieldCheck },
  { id: 'models', labelKey: 'logs.tab.models', icon: Cpu },
  { id: 'economy', labelKey: 'logs.tab.economy', icon: Coins },
];

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function fmtTokens(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtCost(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function fmtClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statusTone(status: string, failureClass?: string | null): 'green' | 'red' | 'amber' | 'cyan' | 'dim' {
  if (status === 'completed') return 'green';
  if (status.startsWith('parked')) {
    if (failureClass === 'provider-quota') return 'amber';
    return 'red';
  }
  if (status === 'running') return 'cyan';
  if (status === 'waiting') return 'amber';
  return 'dim';
}

function StatusChip({ status, failureClass }: { status: string; failureClass?: string | null }) {
  const tone = statusTone(status, failureClass);
  const label = status === 'completed' ? 'GREEN'
    : status.startsWith('parked') ? `PARKED${failureClass ? ` · ${failureClass}` : ''}`
      : status.toUpperCase();
  return (
    <span className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-mono ring-1',
      tone === 'green' ? 'text-olympus-green ring-olympus-green/25 bg-olympus-green/5'
        : tone === 'red' ? 'text-olympus-red ring-olympus-red/25 bg-olympus-red/5'
          : tone === 'amber' ? 'text-olympus-amber-soft ring-olympus-amber-soft/25 bg-olympus-amber-soft/5'
            : tone === 'cyan' ? 'text-olympus-cyan ring-olympus-cyan/25 bg-olympus-cyan/5'
              : 'text-olympus-text-dim ring-olympus-text-dim/20 bg-olympus-text-dim/5',
    )}>
      {tone === 'green' ? <CircleCheck size={9} /> : tone === 'red' ? <CircleAlert size={9} /> : <Clock3 size={9} />}
      {label}
    </span>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-olympus-gold/15 bg-olympus-card px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-olympus-text-dim">{label}</div>
      <div className={cn('mt-1 text-[26px] leading-none font-semibold tabular-nums', tone ?? 'text-olympus-text')}>{value}</div>
      {sub && <div className="mt-1 text-[10px] font-mono text-olympus-text-dim">{sub}</div>}
    </div>
  );
}

export default function LogsDashboard() {
  const language = useLanguage();
  const [data, setData] = useState<LogsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [lane, setLane] = useState<string>('');
  const [query, setQuery] = useState('');
  const [selectedHop, setSelectedHop] = useState<LogHop | null>(null);
  const [selectedWalk, setSelectedWalk] = useState<LogWalk | null>(null);
  const [bootHealth, setBootHealth] = useState<BootHealth | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);
  const [hygiene, setHygiene] = useState<HygienePayload | null>(null);
  const [visible, setVisible] = useState(120);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/logs', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d as LogsPayload);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBoot = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/boot-health', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.ok) setBootHealth(d as BootHealth);
    } catch { /* the Boot tab degrades to — */ }
  }, []);

  const loadPortfolio = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/portfolio', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.ok) setPortfolio(d as PortfolioPayload);
    } catch { /* the Portfolio tab degrades to — */ }
  }, []);

  const loadHygiene = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/hygiene', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setHygiene(d as HygienePayload);
    } catch { /* the Hygiene tab degrades to — */ }
  }, []);

  useEffect(() => {
    void load();
    void loadBoot();
    void loadPortfolio();
    void loadHygiene();
    const iv = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void load();
      void loadBoot();
      void loadPortfolio();
      void loadHygiene();
    }, 15_000);
    return () => clearInterval(iv);
  }, [load, loadBoot, loadPortfolio, loadHygiene]);

  const lanes = useMemo(() => {
    const set = new Map<string, string>();
    for (const w of data?.walks ?? []) set.set(w.slug, w.slug);
    for (const h of data?.hops ?? []) set.set(h.slug, h.slug);
    return [...set.keys()].sort();
  }, [data]);

  const hops = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.hops ?? []).filter((h) => {
      if (lane && h.slug !== lane) return false;
      if (!q) return true;
      return `${h.hop} ${h.god} ${h.model} ${h.status} ${h.failureClass ?? ''} ${h.error ?? ''} ${h.slug}`.toLowerCase().includes(q);
    });
  }, [data, lane, query]);

  const walks = useMemo(() => (data?.walks ?? []).filter((w) => !lane || w.slug === lane), [data, lane]);

  // v0.0.98-10 — Blocked & Recovery. The latest park per hop/lane, with the
  // cause and the next action. Loop-blocked rows are the same hop after two
  // deterministic failures; one card, not eight repeated notifications.
  const blocked = useMemo(() => {
    const latest = new Map<string, LogHop>();
    for (const h of data?.hops ?? []) {
      const parked = h.status.startsWith('parked') || String(h.failureClass) === 'loop-blocked';
      if (!parked) continue;
      const key = `${h.slug}:${h.hop}`;
      if (!latest.has(key)) latest.set(key, h);
    }
    return [...latest.values()]
      .filter((h) => !lane || h.slug === lane)
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
      .slice(0, 40);
  }, [data, lane]);

  const copy = useCallback(async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard denied */ }
  }, []);

  const exportHops = useCallback(() => {
    const blob = new Blob([JSON.stringify(hops, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `olympus-logs-hops-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [hops]);

  const plans = useMemo(() => walks.map((w) => ({
    walk: w,
    health: planHealth(w.hops.map((h) => ({
      id: h.id, god: h.god, status: h.status, toolBudget: h.toolBudget,
      artifacts: h.artifacts, after: h.after, checks: h.checks, promptExcerpt: h.promptExcerpt, promptChars: h.promptChars,
    }))),
  })), [walks]);

  const recoveries = useMemo(() => (data?.recoveries ?? []).filter((r) => !lane || r.slug === lane).slice(0, 120), [data, lane]);
  const realErrors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.errors ?? []).filter((e) => !q || `${e.source} ${e.message} ${e.appVersion ?? ''}`.toLowerCase().includes(q)).slice(0, 120);
  }, [data, query]);

  const summary = data?.summary;
  const economy = data?.economy;

  if (selectedHop) {
    return <HopDetail hop={selectedHop} onBack={() => setSelectedHop(null)} onCopy={copy} copied={copied} />;
  }
  if (selectedWalk) {
    return <WalkDetail walk={selectedWalk} onBack={() => setSelectedWalk(null)} onHop={(h) => { const row = (data?.hops ?? []).find((x) => x.hop === h.id && x.slug === selectedWalk.slug); if (row) setSelectedHop(row); }} />;
  }

  return (
    <div className="w-full h-full bg-olympus-bg overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-olympus-gold">
              <ScrollText size={16} />
              <h1 className="text-[18px] font-semibold tracking-tight">{t('logs.title', language)}</h1>
              <span className="rounded bg-olympus-gold/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-gold ring-1 ring-olympus-gold/20">{t('logs.tagline', language)}</span>
            </div>
            <p className="mt-1 text-[12px] text-olympus-text-dim">
              {t('logs.description', language)}
              {data?.generatedAt && <span className="ml-1 text-olympus-text-dim/70">· {t('logs.updated', language)} {fmtTime(data.generatedAt)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-olympus-text-dim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('logs.search', language)}
                className="h-8 w-56 rounded-md border border-olympus-gold/15 bg-olympus-panel pl-7 pr-2 text-[11px] font-mono text-olympus-text placeholder:text-olympus-text-dim/60 focus:outline-none focus:ring-1 focus:ring-olympus-gold/40"
              />
            </div>
            <select
              value={lane}
              onChange={(e) => setLane(e.target.value)}
              className="h-8 rounded-md border border-olympus-gold/15 bg-olympus-panel px-2 text-[11px] font-mono text-olympus-text-dim focus:outline-none focus:ring-1 focus:ring-olympus-gold/40"
              aria-label="Project lane"
            >
              <option value="">{t('logs.allLanes', language)}</option>
              {lanes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={() => void load()} className="flex h-8 items-center gap-1.5 rounded-md border border-olympus-gold/15 px-2 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold" aria-label="Refresh logs">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> {t('logs.refresh', language)}
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-3 rounded-lg border border-olympus-red/30 bg-olympus-red/5 px-3 py-2 text-[11px] font-mono text-olympus-red">
            {t('logs.unavailable', language)}: {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Card label={t('logs.card.hops', language)} value={summary ? String(summary.hops) : '—'} sub={summary ? `${t('logs.green', language, { n: summary.completed })} · ${t('logs.parked', language, { n: summary.parked })}` : t('logs.reading', language)} />
          <Card label={t('logs.card.tokensOut', language)} value={summary ? fmtTokens(summary.tokensOut) : '—'} sub={summary ? `${fmtTokens(summary.tokensIn)} in` : ''} />
          <Card label={t('logs.card.costStep', language)} value={summary ? fmtCost(summary.costUsd) : '—'} sub={t('logs.invoiceUnknown', language)} tone="text-olympus-gold" />
          <Card label={t('logs.card.parkAttempts', language)} value={summary ? String(summary.parked) : '—'} sub={summary?.parksByClass?.[0] ? `${summary.parksByClass[0].klass} ×${summary.parksByClass[0].count}` : t('logs.none', language)} tone={summary?.parked ? 'text-olympus-red' : 'text-olympus-green'} />
          <Card label={t('logs.card.walks', language)} value={walks.length ? String(walks.length) : '—'} sub={walks[0] ? `${walks[0].slug} · ${walks[0].status}` : t('logs.noCampaign', language)} />
          <Card label={t('logs.card.window', language)} value={economy?.windows?.h5 != null ? `${Math.round(economy.windows.h5)}%` : '—'} sub={t('logs.rolling5h', language)} tone={economy?.windows?.h5 != null && economy.windows.h5 >= 80 ? 'text-olympus-red' : 'text-olympus-green'} />
        </div>

        <nav className="mt-4 flex flex-wrap items-center gap-1 border-b border-olympus-gold/10 pb-1" aria-label="Logs sections">
          {TABS.map((tabDef) => {
            const Icon = tabDef.icon;
            const active = tab === tabDef.id;
            const count = tabDef.id === 'hops' ? hops.length : tabDef.id === 'walks' ? walks.length : tabDef.id === 'blocked' ? blocked.length : tabDef.id === 'recovery' ? recoveries.length : tabDef.id === 'errors' ? realErrors.length : null;
            return (
              <button
                key={tabDef.id}
                onClick={() => setTab(tabDef.id)}
                className={cn('flex h-8 items-center gap-1.5 rounded-t px-3 text-[11px] font-mono transition-colors',
                  active ? 'bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/20' : 'text-olympus-text-dim hover:text-olympus-text')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={11} /> {t(tabDef.labelKey, language)}
                {count != null && <span className="rounded bg-olympus-text-dim/10 px-1 text-[9px] tabular-nums">{count}</span>}
              </button>
            );
          })}
          <div className="flex-1" />
          <button onClick={exportHops} disabled={!hops.length} className="mb-1 rounded border border-olympus-gold/15 px-2 py-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold disabled:opacity-30">{t('logs.export', language)}</button>
        </nav>

        {tab === 'overview' && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-olympus-text">{t('logs.latestHops', language)}</h2>
                <button onClick={() => setTab('hops')} className="text-[10px] font-mono text-olympus-gold hover:underline">{t('logs.viewAll', language)}</button>
              </div>
              <HopsTable rows={hops.slice(0, 8)} onPick={setSelectedHop} compact />
              {!hops.length && <Empty text={t('logs.noHops', language)} />}
            </section>
            <div className="flex flex-col gap-3">
              <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
                <h2 className="mb-2 text-[13px] font-semibold text-olympus-text">{t('logs.parksByClass', language)}</h2>
                {summary?.parksByClass?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {summary.parksByClass.map((p) => (
                      <span key={p.klass} className="rounded-md bg-olympus-red/5 px-2 py-1 text-[10px] font-mono text-olympus-red ring-1 ring-olympus-red/20">
                        {p.klass} <span className="text-olympus-text-dim">×{p.count}</span>
                      </span>
                    ))}
                  </div>
                ) : <Empty text={t('logs.noParks', language)} />}
              </section>
              <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
                <h2 className="mb-2 text-[13px] font-semibold text-olympus-text">{t('logs.campaigns', language)}</h2>
                <div className="space-y-1.5">
                  {walks.slice(0, 5).map((w) => (
                    <button key={w.slug} onClick={() => setSelectedWalk(w)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-olympus-gold/5">
                      <span className="flex-1 truncate text-[11px] font-mono text-olympus-text">{w.slug}</span>
                      <span className="text-[10px] font-mono text-olympus-text-dim">gen {w.generation}</span>
                      <StatusChip status={w.status === 'DONE' ? 'completed' : w.status === 'PARKED' || w.status === 'BLOCKED' ? 'parked' : w.status === 'WAITING' ? 'waiting' : 'running'} />
                      <span className="text-[10px] font-mono tabular-nums text-olympus-text-dim">{w.completed}/{w.total}</span>
                    </button>
                  ))}
                  {!walks.length && <Empty text={t('logs.noCampaign', language)} />}
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === 'hops' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-olympus-text">Hops <span className="text-olympus-text-dim">({hops.length})</span></h2>
              <span className="text-[10px] font-mono text-olympus-text-dim">{t('logs.clickDetail', language)}</span>
            </div>
            <HopsTable rows={hops.slice(0, visible)} onPick={setSelectedHop} />
            {hops.length > visible && (
              <button onClick={() => setVisible((n) => n + 120)} className="mt-3 w-full rounded-md border border-olympus-gold/15 py-2 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold">
                {t('logs.showMore', language, { n: hops.length - visible })}
              </button>
            )}
            {!hops.length && <Empty text={t('logs.noneFound', language)} />}
          </section>
        )}

        {tab === 'walks' && (
          <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {walks.map((w) => (
              <button key={w.slug} onClick={() => setSelectedWalk(w)} className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4 text-left hover:border-olympus-gold/35">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-olympus-text">{w.slug}</span>
                  <StatusChip status={w.status === 'DONE' ? 'completed' : w.status === 'PARKED' || w.status === 'BLOCKED' ? 'parked' : w.status === 'WAITING' ? 'waiting' : 'running'} />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-[24px] font-semibold tabular-nums text-olympus-text">{w.completed}/{w.total}</span>
                  <span className="text-[10px] font-mono text-olympus-text-dim">gen {w.generation} · {w.campaignId ?? 'no campaign'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {w.hops.slice(0, 10).map((h) => (
                    <span key={h.id} data-tip={`${h.id} · ${h.god} · ${h.status}`} className={cn('h-1.5 w-1.5 rounded-full',
                      h.status === 'completed' ? 'bg-olympus-green' : h.status === 'parked' ? 'bg-olympus-red' : h.status === 'running' ? 'bg-olympus-cyan animate-pulse' : 'bg-olympus-text-dim/30')} />
                  ))}
                </div>
                {w.parked && <div className="mt-2 truncate text-[10px] font-mono text-olympus-red">parked: {w.parked}</div>}
                {w.quarantined.length > 0 && <div className="mt-1 truncate text-[10px] font-mono text-olympus-amber-soft">quarantine: {w.quarantined.join(', ')}</div>}
              </button>
            ))}
            {!walks.length && <Empty text={t('logs.noCampaign', language)} />}
          </section>
        )}

        {tab === 'portfolio' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-olympus-cyan">
                  <LayoutGrid size={14} />
                  <h2 className="text-[13px] font-semibold text-olympus-text">Portfolio</h2>
                  <span className="rounded bg-olympus-cyan/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-cyan ring-1 ring-olympus-cyan/20">multi-project</span>
                </div>
                <p className="mt-1 max-w-[820px] text-[11px] text-olympus-text-dim">
                  Todos os projetos em uma leitura: perfil, progresso, first-green (proxy do primeiro hop verde), conclusão, park rate e último sinal.
                </p>
              </div>
              <span className="text-[10px] font-mono text-olympus-text-dim">{portfolio?.totals.projects ?? '—'} project(s)</span>
            </div>
            {!portfolio ? (
              <div className="mt-4 text-[11px] font-mono text-olympus-text-dim">lendo o portfólio…</div>
            ) : portfolio.projects.length === 0 ? (
              <div className="mt-4 rounded-lg border border-olympus-gold/15 bg-olympus-bg/40 px-3 py-3 text-[11px] font-mono text-olympus-text-dim">Nenhum projeto com plano.</div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <Card label="projects" value={String(portfolio.totals.projects)} sub={`${portfolio.totals.running} running`} />
                  <Card label="done" value={String(portfolio.totals.done)} sub={`${portfolio.totals.completed}/${portfolio.totals.hops} hops`} tone="text-olympus-green" />
                  <Card label="parked" value={String(portfolio.totals.parked)} sub="needs a look" tone={portfolio.totals.parked ? 'text-olympus-red' : 'text-olympus-green'} />
                  <Card label="first green" value={portfolio.totals.firstGreenMs != null ? fmtDuration(portfolio.totals.firstGreenMs) : '—'} sub="avg · proxy" />
                  <Card label="park rate" value={portfolio.totals.parkRatePct != null ? `${portfolio.totals.parkRatePct}%` : '—'} sub="avg · rows" />
                  <Card label="profiles" value={String(portfolio.projects.filter((p) => p.profile).length)} sub="selected" />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {portfolio.projects.map((p) => (
                    <div key={p.slug} className="rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12px] font-semibold text-olympus-text">{p.slug}</span>
                        <StatusChip status={p.status === 'DONE' ? 'completed' : p.status === 'PARKED' ? 'parked' : p.status === 'RUNNING' ? 'running' : 'idle'} />
                        <span className="ml-auto text-[9px] font-mono text-olympus-text-dim">gen {p.generation ?? '—'} · {p.profileLabel ?? 'no profile'}</span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-[20px] font-semibold tabular-nums text-olympus-text">{p.completed}/{p.total}</span>
                        <span className="text-[9px] font-mono text-olympus-text-dim">{p.hopsToDonePct}% · {p.attempts} attempts</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-olympus-bg ring-1 ring-olympus-gold/10 overflow-hidden">
                        <div className={cn('h-full rounded-full', p.status === 'DONE' ? 'bg-olympus-green' : p.status === 'PARKED' ? 'bg-olympus-red' : 'bg-olympus-cyan')} style={{ width: `${Math.min(100, p.hopsToDonePct)}%` }} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] font-mono text-olympus-text-dim">
                        <span>first green: <span className="text-olympus-text">{p.firstGreenMs != null ? fmtDuration(p.firstGreenMs) : '—'}</span></span>
                        <span>done: <span className="text-olympus-text">{p.doneMs != null ? fmtDuration(p.doneMs) : '—'}</span></span>
                        <span>park rate: <span className={cn(p.parkRatePct ? 'text-olympus-amber-soft' : 'text-olympus-green')}>{p.parkRatePct != null ? `${p.parkRatePct}%` : '—'}</span></span>
                        <span>tokens out: <span className="text-olympus-text">{fmtTokens(p.tokensOut)}</span></span>
                      </div>
                      {p.parkedHop && <div className="mt-1 text-[9px] font-mono text-olympus-red">parked: {p.parkedHop}</div>}
                      {p.profileCheck && !p.profileCheck.ok && <div className="mt-1 text-[9px] font-mono text-olympus-red">profile check: {p.profileCheck.violations.join('; ')}</div>}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[9px] font-mono text-olympus-text-dim">{p.lastActivity ? fmtTime(p.lastActivity) : 'no signal'}</span>
                        <button onClick={() => { setLane(p.slug); setTab('hops'); }} className="text-[9px] font-mono text-olympus-gold hover:underline">open hops →</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="mt-3 text-[10px] font-mono text-olympus-text-dim/80">first-green = primeiro hop verde desde createdAt do plano (proxy, não é paint do browser). done = último hop verde - createdAt.</p>
          </section>
        )}

        {tab === 'blocked' && (
          <section className="mt-4 rounded-xl border border-olympus-red/20 bg-olympus-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-olympus-red">
                  <ShieldAlert size={14} />
                  <h2 className="text-[13px] font-semibold text-olympus-text">Blocked &amp; Recovery</h2>
                  <span className="rounded bg-olympus-red/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-red ring-1 ring-olympus-red/20">loop guard</span>
                </div>
                <p className="mt-1 max-w-[780px] text-[11px] text-olympus-text-dim">
                  Um hop determinístico que falha duas vezes na mesma geração é <strong className="text-olympus-text">bloqueado</strong>.
                  O walk não gasta outro token nele; “Continue” no mesmo plano é recusado. Corrija o upstream ou escreva uma nova geração.
                </p>
              </div>
              <span className="text-[10px] font-mono text-olympus-text-dim">{blocked.length} hop(s)</span>
            </div>

            {blocked.length === 0 ? (
              <div className="mt-4 rounded-lg border border-olympus-green/20 bg-olympus-green/5 px-3 py-3 text-[11px] font-mono text-olympus-green">
                Nenhum hop bloqueado no recorte. O loop guard está silencioso.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {blocked.map((h) => (
                  <div key={`${h.slug}:${h.hop}:${h.ts}`} className="rounded-lg border border-olympus-red/20 bg-olympus-bg/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={h.status} failureClass={h.failureClass} />
                      <span className="font-mono text-[12px] text-olympus-text">{h.hop}</span>
                      <span className="text-[10px] font-mono text-olympus-text-dim">{h.god} · {h.model || 'lane?'}</span>
                      <span className="ml-auto text-[10px] font-mono text-olympus-text-dim">{fmtTime(h.ts)}</span>
                    </div>
                    <div className="mt-2 text-[10px] font-mono text-olympus-red">
                      {h.failureClass || h.errorClass || 'unclassified'}{h.failedCheck ? ` · ${h.failedCheck}` : ''}
                    </div>
                    {(h.error || h.park?.error) && (
                      <p className="mt-1 line-clamp-3 text-[10px] font-mono text-olympus-text-dim">{h.error || h.park?.error}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {h.recovery?.kind && <span className="rounded bg-olympus-amber-soft/5 px-1.5 py-0.5 text-[9px] font-mono text-olympus-amber-soft ring-1 ring-olympus-amber-soft/20">recovery: {h.recovery.kind}</span>}
                      {h.artifacts.slice(0, 2).map((a) => <span key={a} className="max-w-[220px] truncate rounded bg-olympus-text-dim/10 px-1.5 py-0.5 text-[9px] font-mono text-olympus-text-dim">{a}</span>)}
                      <button onClick={() => setSelectedHop(h)} className="ml-auto flex items-center gap-1 rounded border border-olympus-gold/15 px-2 py-1 text-[10px] font-mono text-olympus-gold hover:bg-olympus-gold/10">
                        <Wrench size={10} /> evidência
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] font-mono text-olympus-text-dim/80">
              Regra: 2 falhas determinísticas → bloqueio; 2 ciclos de repair → BLOCKED com evidência. Falhas de transporte/quota não contam aqui.
            </p>
          </section>
        )}

        {tab === 'boot' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-olympus-gold">
                  <Server size={14} />
                  <h2 className="text-[13px] font-semibold text-olympus-text">Boot Health</h2>
                  <span className="rounded bg-olympus-gold/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-gold ring-1 ring-olympus-gold/20">one server</span>
                </div>
                <p className="mt-1 max-w-[780px] text-[11px] text-olympus-text-dim">
                  A porta e o processo são a prova. O watchdog só respawna quando o socket está livre; o MCP git vive no grupo do serve.
                </p>
              </div>
              <button onClick={() => void loadBoot()} className="flex items-center gap-1 rounded border border-olympus-gold/15 px-2 py-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold">
                <Activity size={10} /> probe
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Card label="app" value={bootHealth ? (bootHealth.app.health.ok ? 'GREEN' : 'DOWN') : '—'} sub={bootHealth ? `${bootHealth.app.health.ms}ms · HTTP ${bootHealth.app.health.status ?? '—'}` : 'lendo…'} tone={bootHealth?.app.health.ok ? 'text-olympus-green' : 'text-olympus-red'} />
              <Card label="port" value={bootHealth ? String(bootHealth.app.port) : '—'} sub={bootHealth ? (bootHealth.app.portAlive ? 'TCP listening' : 'TCP closed') : ''} tone={bootHealth?.app.portAlive ? 'text-olympus-green' : 'text-olympus-red'} />
              <Card label="next pid" value={bootHealth?.boot?.nextPid ? String(bootHealth.boot.nextPid) : (bootHealth?.boot?.nextExternal ? 'external' : '—')} sub={bootHealth?.boot ? `boot ${bootHealth.boot.bootId ?? '?'}` : ''} />
              <Card label="watchdog" value={bootHealth?.boot ? String(bootHealth.boot.watchdogRespawns) : '—'} sub={bootHealth?.boot?.lastRespawnAt ? `last ${fmtTime(bootHealth.boot.lastRespawnAt)}` : 'no respawn'} tone={bootHealth?.boot && bootHealth.boot.watchdogRespawns > 0 ? 'text-olympus-amber-soft' : 'text-olympus-green'} />
              <Card label="opencode" value={bootHealth ? (bootHealth.opencode.alive ? 'UP' : 'DOWN') : '—'} sub={bootHealth ? `:${bootHealth.opencode.port}` : ''} tone={bootHealth?.opencode.alive ? 'text-olympus-green' : 'text-olympus-red'} />
              <Card label="mcp git" value={bootHealth ? String(bootHealth.mcpGit.length) : '—'} sub={bootHealth?.mcpGit.length ? 'children alive' : 'no orphans'} tone={bootHealth?.mcpGit.length ? 'text-olympus-amber-soft' : 'text-olympus-green'} />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 p-3">
                <h3 className="text-[11px] font-semibold text-olympus-text">Process truth</h3>
                <div className="mt-2 space-y-1 text-[10px] font-mono text-olympus-text-dim">
                  <div>app version: <span className="text-olympus-text">{bootHealth?.app.version ?? '—'}</span> · mode: {bootHealth?.app.mode ?? '—'}</div>
                  <div>electron pid: <span className="text-olympus-text">{bootHealth?.boot?.electronPid ?? '—'}</span> · next pid: <span className="text-olympus-text">{bootHealth?.boot?.nextPid ?? (bootHealth?.boot?.nextExternal ? 'external' : '—')}</span></div>
                  <div>last watchdog: {bootHealth?.boot?.lastWatchdogAt ? fmtTime(bootHealth.boot.lastWatchdogAt) : '—'} · last respawn: {bootHealth?.boot?.lastRespawnAt ? fmtTime(bootHealth.boot.lastRespawnAt) : 'none'}</div>
                  <div>error log: {bootHealth ? `${(bootHealth.errorLog.bytes / 1024).toFixed(1)} KB` : '—'} · rotated: {bootHealth?.errorLog.rotated ? 'yes' : 'no'} · last: {bootHealth?.errorLog.lastErrorAt ? fmtTime(bootHealth.errorLog.lastErrorAt) : 'none'}</div>
                </div>
              </div>
              <div className="rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 p-3">
                <h3 className="text-[11px] font-semibold text-olympus-text">MCP git children</h3>
                {bootHealth?.mcpGit.length ? (
                  <div className="mt-2 space-y-1">
                    {bootHealth.mcpGit.slice(0, 8).map((p) => (
                      <div key={p.pid} className="flex items-center gap-2 text-[10px] font-mono text-olympus-amber-soft">
                        <span>pid {p.pid}</span><span className="text-olympus-text-dim">ppid {p.ppid}</span><span className="text-olympus-text-dim">{fmtDuration(p.etimes * 1000)}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="mt-2 text-[10px] font-mono text-olympus-green">none — the serve owns no orphan child.</div>}
                <p className="mt-2 text-[10px] font-mono text-olympus-text-dim">O reaper limpa `uvx mcp-server-git` órfão (ppid 1) acima de 30 min.</p>
              </div>
            </div>
          </section>
        )}

        {tab === 'plan' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-olympus-gold">
                  <ListTree size={14} />
                  <h2 className="text-[13px] font-semibold text-olympus-text">Plan Health</h2>
                  <span className="rounded bg-olympus-gold/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-gold ring-1 ring-olympus-gold/20">guardrails</span>
                </div>
                <p className="mt-1 max-w-[820px] text-[11px] text-olympus-text-dim">
                  O plano antes do walk: tamanho, hops de verificação, budgets apertados e prompts grandes. O walker não bloqueia por isto; ele nomeia o risco.
                </p>
              </div>
            </div>
            {plans.length === 0 ? (
              <div className="mt-4 rounded-lg border border-olympus-gold/15 bg-olympus-bg/40 px-3 py-3 text-[11px] font-mono text-olympus-text-dim">Nenhum plano no recorte.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {plans.map(({ walk: w, health: h }) => (
                  <div key={`plan-${w.slug}`} className="rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-olympus-text">{w.slug}</span>
                      <span className="text-[10px] font-mono text-olympus-text-dim">gen {w.generation} · {w.completed}/{w.total}</span>
                      <StatusChip status={w.status === 'DONE' ? 'completed' : w.status === 'PARKED' || w.status === 'BLOCKED' ? 'parked' : w.status === 'WAITING' ? 'waiting' : 'running'} />
                      {h.oversized && <span className="rounded bg-olympus-red/10 px-1.5 py-0.5 text-[9px] font-mono text-olympus-red ring-1 ring-olympus-red/20">oversized</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                      <Card label="hops" value={String(h.hops)} sub={`${h.pending} pending`} />
                      <Card label="verify" value={String(h.verification)} sub="qa/gate" tone={h.verification > 6 ? 'text-olympus-amber-soft' : undefined} />
                      <Card label="tight budgets" value={String(h.tightBudgets)} sub="below estimate" tone={h.tightBudgets ? 'text-olympus-amber-soft' : 'text-olympus-green'} />
                      <Card label="large hops" value={String(h.largeHops)} sub=">6 checks / >6k" tone={h.largeHops ? 'text-olympus-amber-soft' : 'text-olympus-green'} />
                      <Card label="soft cap" value={String(20)} sub="hops/profile" />
                      <Card label="parked" value={String(w.hops.filter((x) => x.status === 'parked').length)} sub="in plan" tone={w.hops.some((x) => x.status === 'parked') ? 'text-olympus-red' : 'text-olympus-green'} />
                    </div>
                    {h.reasons.length > 0 && (
                      <div className="mt-2 rounded border border-olympus-amber-soft/20 bg-olympus-amber-soft/5 px-2 py-1.5 text-[10px] font-mono text-olympus-amber-soft">
                        {h.reasons.map((r) => <div key={r}>· {r}</div>)}
                      </div>
                    )}
                    {h.recommendation && <div className="mt-1 text-[10px] font-mono text-olympus-text-dim">{h.recommendation}</div>}
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-[10px] font-mono">
                        <thead>
                          <tr className="text-left text-[9px] uppercase tracking-wider text-olympus-text-dim">
                            <th className="py-1 pr-2">hop</th><th className="py-1 pr-2">god</th><th className="py-1 pr-2">status</th><th className="py-1 pr-2">budget</th><th className="py-1 pr-2">estimate</th><th className="py-1 pr-2">checks</th><th className="py-1 pr-2">after</th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.hops.map((x) => {
                            const estimate = estimateHopToolBudget(x);
                            const tight = x.toolBudget != null && x.toolBudget < estimate - 4;
                            return (
                              <tr key={x.id} className="border-t border-olympus-gold/5">
                                <td className="py-1 pr-2 text-olympus-text">{x.id}</td>
                                <td className="py-1 pr-2 text-olympus-text-dim">{x.god}</td>
                                <td className={cn('py-1 pr-2', x.status === 'completed' ? 'text-olympus-green' : x.status === 'parked' ? 'text-olympus-red' : x.status === 'running' ? 'text-olympus-cyan' : 'text-olympus-text-dim')}>{x.status}</td>
                                <td className={cn('py-1 pr-2 tabular-nums', tight ? 'text-olympus-amber-soft' : 'text-olympus-text')}>{x.toolBudget ?? '—'}</td>
                                <td className="py-1 pr-2 tabular-nums text-olympus-text-dim">{estimate}</td>
                                <td className="py-1 pr-2 tabular-nums text-olympus-text-dim">{x.checks?.length ?? 0}</td>
                                <td className="py-1 pr-2 truncate text-olympus-text-dim">{x.after?.join(', ') || 'root'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'recovery' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-olympus-cyan">
                  <RotateCcw size={14} />
                  <h2 className="text-[13px] font-semibold text-olympus-text">Recovery Log</h2>
                  <span className="rounded bg-olympus-cyan/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-cyan ring-1 ring-olympus-cyan/20">atlas actions</span>
                </div>
                <p className="mt-1 max-w-[780px] text-[11px] text-olympus-text-dim">
                  Cada recovery registrado no disco: lane, hop, classe, ação, orçamento aplicado e a mensagem do Atlas.
                </p>
              </div>
              <span className="text-[10px] font-mono text-olympus-text-dim">{recoveries.length} row(s)</span>
            </div>
            {recoveries.length === 0 ? (
              <div className="mt-4 rounded-lg border border-olympus-green/20 bg-olympus-green/5 px-3 py-3 text-[11px] font-mono text-olympus-green">Nenhum recovery no recorte.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {recoveries.map((r) => (
                  <div key={`${r.lane}:${r.hopId}:${r.ts}`} className="rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono text-olympus-text-dim">{fmtTime(r.ts)}</span>
                      <span className="font-mono text-[12px] text-olympus-text">{r.hopId}</span>
                      <span className="text-[10px] font-mono text-olympus-text-dim">{r.slug} · {r.god}</span>
                      <span className="rounded bg-olympus-cyan/5 px-1.5 py-0.5 text-[9px] font-mono text-olympus-cyan ring-1 ring-olympus-cyan/20">{r.kind}</span>
                      {r.failureClass && <span className="rounded bg-olympus-red/5 px-1.5 py-0.5 text-[9px] font-mono text-olympus-red ring-1 ring-olympus-red/20">{r.failureClass}</span>}
                      {r.toolBudget != null && <span className="text-[9px] font-mono text-olympus-text-dim">budget {r.toolBudget}</span>}
                      {r.nextLane && <span className="text-[9px] font-mono text-olympus-text-dim">next {r.nextLane}</span>}
                    </div>
                    {r.message && <p className="mt-1 text-[10px] font-mono text-olympus-text-dim">{r.message}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'errors' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-olympus-red">
                  <TriangleAlert size={14} />
                  <h2 className="text-[13px] font-semibold text-olympus-text">Errors</h2>
                  <span className="rounded bg-olympus-red/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-red ring-1 ring-olympus-red/20">real only</span>
                </div>
                <p className="mt-1 max-w-[820px] text-[11px] text-olympus-text-dim">
                  Preload/CSP/GitHub-stats noise é filtrado. O que sobra é o erro que importa: fonte, versão, mensagem e stack.
                </p>
              </div>
              <span className="text-[10px] font-mono text-olympus-text-dim">{realErrors.length} real error(s)</span>
            </div>
            {realErrors.length === 0 ? (
              <div className="mt-4 rounded-lg border border-olympus-green/20 bg-olympus-green/5 px-3 py-3 text-[11px] font-mono text-olympus-green">Nenhum erro real no recorte — só ruído de console, já filtrado.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {realErrors.map((e, i) => (
                  <div key={`${e.ts}:${i}`} className="rounded-lg border border-olympus-red/15 bg-olympus-bg/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono text-olympus-text-dim">{fmtTime(e.ts)}</span>
                      <span className="rounded bg-olympus-red/5 px-1.5 py-0.5 text-[9px] font-mono text-olympus-red ring-1 ring-olympus-red/20">{e.source}</span>
                      {e.appVersion && <span className="text-[9px] font-mono text-olympus-text-dim">v{e.appVersion}</span>}
                    </div>
                    <p className="mt-1 text-[11px] font-mono text-olympus-text">{e.message}</p>
                    {e.stack && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[9px] font-mono text-olympus-text-dim">stack</summary>
                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[9px] font-mono text-olympus-text-dim">{e.stack}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'hygiene' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-olympus-green">
                  <ShieldCheck size={14} />
                  <h2 className="text-[13px] font-semibold text-olympus-text">Hygiene</h2>
                  <span className="rounded bg-olympus-green/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-green ring-1 ring-olympus-green/20">zero errors</span>
                </div>
                <p className="mt-1 max-w-[820px] text-[11px] text-olympus-text-dim">
                  O gate de release: tsc, lint, docs, privacy, suite manifest e audit-high. HYGIENE.md declara os limites; o battery hermetic é separado.
                </p>
              </div>
              <span className="text-[10px] font-mono text-olympus-text-dim">{hygiene ? `v${hygiene.version} · ${fmtTime(hygiene.generatedAt)}` : 'sem relatório'}</span>
            </div>
            {!hygiene ? (
              <div className="mt-4 rounded-lg border border-olympus-amber-soft/20 bg-olympus-amber-soft/5 px-3 py-3 text-[11px] font-mono text-olympus-amber-soft">
                Nenhum relatório ainda. Rode <code>npm run hygiene</code> e recarregue.
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Card label="gate" value={hygiene.ok ? 'GREEN' : 'RED'} sub={`${hygiene.gates.filter((g) => g.ok).length}/${hygiene.gates.length} checks`} tone={hygiene.ok ? 'text-olympus-green' : 'text-olympus-red'} />
                  <Card label="battery" value={hygiene.battery?.pass != null ? `${hygiene.battery.pass}/${hygiene.battery.suites}` : '—'} sub={hygiene.battery ? 'hermetic' : 'add --battery'} tone={hygiene.battery?.pass != null ? 'text-olympus-green' : 'text-olympus-text-dim'} />
                  <Card label="errors" value={hygiene.ok ? '0' : String(hygiene.gates.filter((g) => !g.ok).length)} sub="deterministic gates" tone={hygiene.ok ? 'text-olympus-green' : 'text-olympus-red'} />
                  <Card label="version" value={hygiene.version} sub="release branch" />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {hygiene.gates.map((g) => (
                    <div key={g.name} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', g.ok ? 'border-olympus-green/20 bg-olympus-green/5' : 'border-olympus-red/20 bg-olympus-red/5')}>
                      {g.ok ? <CircleCheck size={12} className="text-olympus-green" /> : <CircleAlert size={12} className="text-olympus-red" />}
                      <span className="font-mono text-[11px] text-olympus-text">{g.name}</span>
                      <span className="ml-auto text-[9px] font-mono text-olympus-text-dim">{Math.round(g.ms / 1000)}s</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] font-mono text-olympus-text-dim/80">HYGIENE.md: 23 moderate transitive advisories, 132 local suites and the unclaimed drills are declared limits, not hidden errors.</p>
              </>
            )}
          </section>
        )}

        {tab === 'models' && (
          <section className="mt-4 overflow-x-auto rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-olympus-text">Models</h2>
            <table className="w-full min-w-[720px] border-collapse text-[11px] font-mono">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-olympus-text-dim">
                  <th className="py-1.5 pr-3">model</th><th className="py-1.5 pr-3">requests</th><th className="py-1.5 pr-3">tokens out</th><th className="py-1.5 pr-3">step cost</th><th className="py-1.5 pr-3">green</th><th className="py-1.5 pr-3">parked</th><th className="py-1.5">last</th>
                </tr>
              </thead>
              <tbody>
                {(data?.models ?? []).map((m) => (
                  <tr key={m.model} className="border-t border-olympus-gold/5">
                    <td className="py-2 pr-3 text-olympus-text">{m.model}</td>
                    <td className="py-2 pr-3 tabular-nums">{m.requests}</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtTokens(m.tokensOut)}</td>
                    <td className="py-2 pr-3 tabular-nums text-olympus-gold">{fmtCost(m.costUsd)}</td>
                    <td className="py-2 pr-3 tabular-nums text-olympus-green">{m.completed}</td>
                    <td className="py-2 pr-3 tabular-nums text-olympus-red">{m.parked}</td>
                    <td className="py-2 text-olympus-text-dim">{fmtTime(m.lastUsed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.models?.length && <Empty text="Nenhum modelo no recorte." />}
          </section>
        )}

        {tab === 'economy' && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
            <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-olympus-text">Conta GO</h2>
                <span className="text-[10px] font-mono text-olympus-text-dim">
                  {economy?.source ?? 'local'} · anchor {economy?.anchorAgeMs != null ? `${Math.round(economy.anchorAgeMs / 60_000)}m` : '—'}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {([['5h', economy?.windows?.h5, economy?.resets?.h5], ['weekly', economy?.windows?.weekly, economy?.resets?.weekly], ['monthly', economy?.windows?.monthly, economy?.resets?.monthly]] as const).map(([label, pct, reset]) => (
                  <div key={label} className="rounded-lg border border-olympus-gold/10 bg-olympus-panel/50 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-olympus-text-dim">{label}</div>
                    <div className="mt-1 text-[22px] font-semibold tabular-nums text-olympus-text">{pct != null ? `${Math.round(pct)}%` : '—'}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-olympus-text-dim/15">
                      <div className={cn('h-full rounded-full', pct != null && pct >= 80 ? 'bg-olympus-red' : pct != null && pct >= 65 ? 'bg-olympus-amber-soft' : 'bg-olympus-green')} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
                    </div>
                    <div className="mt-1 text-[9px] font-mono text-olympus-text-dim">reset {fmtTime(reset ?? null)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-olympus-gold/10 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-olympus-text-dim">burn policy</div>
                  <div className="mt-1 text-[12px] font-mono text-olympus-text">{economy?.policy?.mode ?? '—'} · target {economy?.policy?.targetPct ?? '—'}%</div>
                  <div className="mt-1 text-[10px] font-mono text-olympus-text-dim">step cost / list / invoice unknown</div>
                </div>
                <div className="rounded-lg border border-olympus-gold/10 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-olympus-text-dim">decision</div>
                  <div className="mt-1 text-[12px] font-mono text-olympus-text">{economy?.decision?.mode ?? '—'} · step {economy?.decision?.step ?? '—'} · {economy?.decision?.blocked ?? 'ok'}</div>
                  <div className="mt-1 text-[10px] font-mono text-olympus-text-dim">projection {economy?.decision?.projectedPct != null ? `${Math.round(economy.decision.projectedPct)}%` : '—'}</div>
                </div>
              </div>
            </section>
            <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
              <h2 className="mb-2 text-[13px] font-semibold text-olympus-text">Últimas decisões</h2>
              <div className="space-y-1.5">
                {(economy?.recent ?? []).slice(0, 10).map((r, i) => (
                  <div key={`${r.at}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-mono odd:bg-olympus-panel/40">
                    <span className="text-olympus-text-dim">{fmtTime(r.at)}</span>
                    <span className="text-olympus-gold">{r.mode}</span>
                    <span className="text-olympus-text">{r.accountPct != null ? `${Math.round(r.accountPct)}%` : '—'}</span>
                    <span className="text-olympus-text-dim">step {r.step}</span>
                    <span className={cn('ml-auto', r.blocked && r.blocked !== 'off' ? 'text-olympus-red' : 'text-olympus-text-dim')}>{r.blocked ?? 'ok'}</span>
                  </div>
                ))}
                {!economy?.recent?.length && <Empty text="Nenhuma decisão de burn registrada." />}
              </div>
            </section>
          </div>
        )}

        <div className="mt-6 pb-6 text-center text-[9px] font-mono text-olympus-text-dim/60">
          step cost = provider estimate · list value = catalog · invoice unknown. Nenhum número é inventado.
        </div>
      </div>
    </div>
  );
}

function HopsTable({ rows, onPick, compact }: { rows: LogHop[]; onPick: (h: LogHop) => void; compact?: boolean }) {
  const language = useLanguage();
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-olympus-gold/10 px-2 pb-1 text-[9px] font-mono uppercase tracking-wider text-olympus-text-dim">
        <span className="w-12 shrink-0">{t('logs.table.time', language)}</span>
        <span className="flex-1">{t('logs.table.hopGodModel', language)}</span>
        <span className="w-[260px] shrink-0 text-right">{t('logs.table.statusTimeCost', language)}</span>
      </div>
      <div className="divide-y divide-olympus-gold/5">
        {rows.map((h) => (
          <button
            key={h.id}
            type="button"
            data-testid={`hop-row-${h.id}`}
            onClick={() => onPick(h)}
            className="flex w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-olympus-gold/5"
          >
            <span className="w-12 shrink-0 text-[10px] font-mono tabular-nums text-olympus-text-dim" data-tip={fmtTime(h.ts)}>{fmtClock(h.ts)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[12px] font-mono text-olympus-text">{h.hop}</span>
                <span className="shrink-0 text-[9px] font-mono text-olympus-text-dim">{h.god}</span>
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-mono text-olympus-text-dim">
                <span className="truncate">{h.model.replace(/^opencode-go\//, '')}</span>
                {!compact && h.build && <span className="shrink-0">· {h.build}</span>}
                {h.status.startsWith('parked') && h.failureClass && <span className="shrink-0 text-olympus-red">· {h.failureClass}</span>}
              </span>
            </span>
            <span className="flex w-[260px] shrink-0 items-center justify-end gap-2">
              <StatusChip status={h.status} failureClass={h.failureClass} />
              <span className="w-10 text-right text-[10px] font-mono tabular-nums text-olympus-text-dim">{fmtDuration(h.durationMs)}</span>
              <span className="w-14 text-right text-[10px] font-mono tabular-nums text-olympus-gold">{h.costSource === 'window' ? '~' : ''}{fmtCost(h.costUsd)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HopDetail({ hop, onBack, onCopy, copied }: { hop: LogHop; onBack: () => void; onCopy: (v: unknown) => void; copied: boolean }) {
  const language = useLanguage();
  return (
    <div className="w-full h-full bg-olympus-bg overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ArrowLeft size={12} /> {t('logs.backHops', language)}</button>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-semibold text-olympus-text">{hop.hop}</h1>
              <StatusChip status={hop.status} failureClass={hop.failureClass} />
            </div>
            <p className="mt-1 text-[11px] font-mono text-olympus-text-dim">
              {hop.slug} · {hop.god} · {hop.model} · {fmtDuration(hop.durationMs)} · {hop.retries} retry(ies)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onCopy(hop)} className="flex items-center gap-1 rounded border border-olympus-gold/15 px-2 py-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold">
              {copied ? <Check size={10} /> : <Copy size={10} />} copiar json
            </button>
          </div>
        </header>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <h2 className="mb-2 text-[12px] font-semibold text-olympus-text">Identidade</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[11px] font-mono">
              <dt className="text-olympus-text-dim">god</dt><dd className="text-olympus-text">{hop.god}</dd>
              <dt className="text-olympus-text-dim">modelo</dt><dd className="truncate text-olympus-text">{hop.model}</dd>
              <dt className="text-olympus-text-dim">build</dt><dd className="text-olympus-text">{hop.build ?? '—'}</dd>
              <dt className="text-olympus-text-dim">transporte</dt><dd className="text-olympus-text">{hop.transport ?? '—'}</dd>
              <dt className="text-olympus-text-dim">sessão</dt><dd className="truncate text-olympus-text-dim">{hop.sessionId ?? '—'}</dd>
              <dt className="text-olympus-text-dim">tok in/out</dt><dd className="text-olympus-text">{fmtTokens(hop.tokensIn)} / {fmtTokens(hop.tokensOut)}</dd>
              <dt className="text-olympus-text-dim">custo</dt><dd className="text-olympus-gold">{hop.costSource === 'window' ? '~' : ''}{fmtCost(hop.costUsd)} <span className="text-olympus-text-dim">{hop.costSource === 'window' ? 'janela estimada' : 'step'} · invoice unknown</span></dd>
              <dt className="text-olympus-text-dim">tool budget</dt><dd className="text-olympus-text">{hop.toolBudget ?? '—'}</dd>
            </dl>
          </section>

          <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <h2 className="mb-2 text-[12px] font-semibold text-olympus-text">Loadout declarado</h2>
            <div className="space-y-2 text-[11px] font-mono">
              <Row label="skills" items={hop.abilities.skills} />
              <Row label="MCPs" items={hop.abilities.mcps} />
              <Row label="demigods" items={hop.abilities.demigods} />
              <Row label="artefatos" items={hop.artifacts} />
              <Row label="checks" items={hop.checks} />
            </div>
            {hop.resonance && (
              <div className="mt-3 rounded-lg border border-olympus-gold/10 bg-olympus-panel/40 p-2 text-[10px] font-mono text-olympus-text-dim">
                resonance: build {hop.resonance.build ?? '—'} · skill {hop.resonance.skill ?? '—'} · mcp {hop.resonance.mcp ?? '—'} · demigod {hop.resonance.demigod ?? '—'} · {hop.resonance.outcome ?? '—'}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <h2 className="mb-2 text-[12px] font-semibold text-olympus-text">Execução e verificação</h2>
            <div className="space-y-2 text-[11px] font-mono">
              {hop.errorClass && <div><span className="text-olympus-text-dim">classe:</span> <span className="text-olympus-red">{hop.errorClass}</span></div>}
              {hop.failedCheck && <div><span className="text-olympus-text-dim">check que falhou:</span> <span className="text-olympus-text">{hop.failedCheck}</span></div>}
              {hop.tools?.length ? (
                <div>
                  <span className="text-olympus-text-dim">tools:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hop.tools.map((t) => <span key={t.tool} className="rounded bg-olympus-bg px-1.5 py-0.5 text-[9px] text-olympus-text-dim ring-1 ring-olympus-gold/10">{t.tool} ×{t.count}</span>)}
                  </div>
                </div>
              ) : null}
              {hop.error && <div className="rounded-md bg-olympus-red/5 p-2 text-[10px] text-olympus-red">{hop.error}</div>}
              {hop.park && <div><span className="text-olympus-text-dim">park:</span> {hop.park.reason} · {fmtTime(hop.park.ts)}</div>}
              {hop.recovery && <div><span className="text-olympus-text-dim">recovery:</span> {hop.recovery.kind} — {hop.recovery.message}</div>}
              {!hop.error && !hop.park && <div className="text-olympus-text-dim">Sem park. O hop concluiu ou está em execução.</div>}
            </div>
          </section>

          <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <h2 className="mb-2 text-[12px] font-semibold text-olympus-text">Prompt (slice)</h2>
            <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-lg bg-olympus-bg/60 p-2 text-[10px] leading-relaxed text-olympus-text-dim">{hop.promptExcerpt || '—'}</pre>
          </section>

          <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4 lg:col-span-2">
            <h2 className="mb-2 text-[12px] font-semibold text-olympus-text">Output (tail)</h2>
            <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap rounded-lg bg-olympus-bg/60 p-2 text-[10px] leading-relaxed text-olympus-text-dim">{hop.outputTail || 'sem output registrado para este hop (linha antiga ou em execução)'}</pre>
          </section>
        </div>
      </div>
    </div>
  );
}

function WalkDetail({ walk, onBack, onHop }: { walk: LogWalk; onBack: () => void; onHop: (h: { id: string }) => void }) {
  const language = useLanguage();
  return (
    <div className="w-full h-full bg-olympus-bg overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ArrowLeft size={12} /> {t('logs.backWalks', language)}</button>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-semibold text-olympus-text">{walk.slug}</h1>
              <StatusChip status={walk.status === 'DONE' ? 'completed' : walk.status === 'PARKED' || walk.status === 'BLOCKED' ? 'parked' : walk.status === 'WAITING' ? 'waiting' : 'running'} />
            </div>
            <p className="mt-1 text-[11px] font-mono text-olympus-text-dim">gen {walk.generation} · {walk.completed}/{walk.total} hops · {walk.campaignId ?? 'no campaign'} · updated {fmtTime(walk.updatedAt)}</p>
          </div>
          <div className="text-right text-[11px] font-mono text-olympus-text-dim">
            <div>report: {walk.report ?? '—'}</div>
            {walk.planCreatedAt && <div>plan: {fmtTime(walk.planCreatedAt)}</div>}
          </div>
        </header>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <h2 className="mb-2 text-[12px] font-semibold text-olympus-text">Hops</h2>
            <div className="space-y-1">
              {walk.hops.map((h) => (
                <button key={h.id} onClick={() => onHop(h)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-olympus-gold/5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', h.status === 'completed' ? 'bg-olympus-green' : h.status === 'parked' ? 'bg-olympus-red' : h.status === 'running' ? 'bg-olympus-cyan animate-pulse' : 'bg-olympus-text-dim/30')} />
                  <span className="flex-1 truncate text-[11px] font-mono text-olympus-text">{h.id}</span>
                  <span className="text-[10px] font-mono text-olympus-text-dim">{h.god}</span>
                  <span className="text-[10px] font-mono text-olympus-text-dim">{h.status}</span>
                </button>
              ))}
            </div>
          </section>
          <div className="flex flex-col gap-3">
            <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
              <h2 className="mb-2 text-[12px] font-semibold text-olympus-text">Parks / quarentena</h2>
              {walk.parked && <div className="mb-1 text-[11px] font-mono text-olympus-red">parked: {walk.parked}</div>}
              {walk.quarantined.length > 0
                ? <div className="flex flex-wrap gap-1.5">{walk.quarantined.map((id) => <span key={id} className="rounded bg-olympus-amber-soft/10 px-1.5 py-0.5 text-[10px] font-mono text-olympus-amber-soft">{id}</span>)}</div>
                : <div className="text-[11px] font-mono text-olympus-text-dim">nenhuma quarentena</div>}
              {Object.entries(walk.parks).slice(0, 8).map(([id, p]) => (
                <div key={id} className="mt-1 text-[10px] font-mono text-olympus-text-dim">{id}: {p.reason} · {p.failureClass ?? '—'}</div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-olympus-text-dim">{label}</span>
      <span className="flex flex-wrap gap-1">
        {items.length ? items.map((x, i) => <span key={`${x}-${i}`} className="rounded bg-olympus-gold/10 px-1.5 py-0.5 text-[10px] text-olympus-gold">{x}</span>) : <span className="text-olympus-text-dim">—</span>}
      </span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-olympus-gold/15 px-3 py-6 text-center text-[11px] font-mono text-olympus-text-dim">{text}</div>;
}
