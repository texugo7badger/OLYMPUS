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
  CircleCheck, CircleAlert, Clock3, Coins, Cpu, Route, Boxes, Gauge, ShieldAlert, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogHop, LogWalk, LogsPayload } from '@/lib/logs-index';

type Tab = 'overview' | 'hops' | 'walks' | 'blocked' | 'models' | 'economy';

const TABS: Array<{ id: Tab; label: string; icon: any }> = [
  { id: 'overview', label: 'Visão geral', icon: Gauge },
  { id: 'hops', label: 'Hops', icon: Route },
  { id: 'walks', label: 'Walks', icon: Boxes },
  { id: 'blocked', label: 'Blocked', icon: ShieldAlert },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'economy', label: 'Economy', icon: Coins },
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
  const [data, setData] = useState<LogsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [lane, setLane] = useState<string>('');
  const [query, setQuery] = useState('');
  const [selectedHop, setSelectedHop] = useState<LogHop | null>(null);
  const [selectedWalk, setSelectedWalk] = useState<LogWalk | null>(null);
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

  useEffect(() => {
    void load();
    const iv = setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 15_000);
    return () => clearInterval(iv);
  }, [load]);

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
              <h1 className="text-[18px] font-semibold tracking-tight">Logs</h1>
              <span className="rounded bg-olympus-gold/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-olympus-gold ring-1 ring-olympus-gold/20">flight recorder</span>
            </div>
            <p className="mt-1 text-[12px] text-olympus-text-dim">
              Cada hop, token, park e modelo — a verdade do walk, não uma estimativa.
              {data?.generatedAt && <span className="ml-1 text-olympus-text-dim/70">· atualizado {fmtTime(data.generatedAt)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-olympus-text-dim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="hop, god, modelo, erro…"
                className="h-8 w-56 rounded-md border border-olympus-gold/15 bg-olympus-panel pl-7 pr-2 text-[11px] font-mono text-olympus-text placeholder:text-olympus-text-dim/60 focus:outline-none focus:ring-1 focus:ring-olympus-gold/40"
              />
            </div>
            <select
              value={lane}
              onChange={(e) => setLane(e.target.value)}
              className="h-8 rounded-md border border-olympus-gold/15 bg-olympus-panel px-2 text-[11px] font-mono text-olympus-text-dim focus:outline-none focus:ring-1 focus:ring-olympus-gold/40"
              aria-label="Project lane"
            >
              <option value="">todas as lanes</option>
              {lanes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={() => void load()} className="flex h-8 items-center gap-1.5 rounded-md border border-olympus-gold/15 px-2 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold" aria-label="Refresh logs">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-3 rounded-lg border border-olympus-red/30 bg-olympus-red/5 px-3 py-2 text-[11px] font-mono text-olympus-red">
            Logs indisponível: {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Card label="hops" value={summary ? String(summary.hops) : '—'} sub={summary ? `${summary.completed} green · ${summary.parked} parked` : 'lendo…'} />
          <Card label="tokens out" value={summary ? fmtTokens(summary.tokensOut) : '—'} sub={summary ? `${fmtTokens(summary.tokensIn)} in` : ''} />
          <Card label="custo (step)" value={summary ? fmtCost(summary.costUsd) : '—'} sub="invoice unknown" tone="text-olympus-gold" />
          <Card label="park attempts" value={summary ? String(summary.parked) : '—'} sub={summary?.parksByClass?.[0] ? `${summary.parksByClass[0].klass} ×${summary.parksByClass[0].count}` : 'nenhum'} tone={summary?.parked ? 'text-olympus-red' : 'text-olympus-green'} />
          <Card label="walks" value={walks.length ? String(walks.length) : '—'} sub={walks[0] ? `${walks[0].slug} · ${walks[0].status}` : 'sem campanha'} />
          <Card label="window" value={economy?.windows?.h5 != null ? `${Math.round(economy.windows.h5)}%` : '—'} sub="5h rolling" tone={economy?.windows?.h5 != null && economy.windows.h5 >= 80 ? 'text-olympus-red' : 'text-olympus-green'} />
        </div>

        <nav className="mt-4 flex flex-wrap items-center gap-1 border-b border-olympus-gold/10 pb-1" aria-label="Logs sections">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const count = t.id === 'hops' ? hops.length : t.id === 'walks' ? walks.length : t.id === 'blocked' ? blocked.length : null;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn('flex h-8 items-center gap-1.5 rounded-t px-3 text-[11px] font-mono transition-colors',
                  active ? 'bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/20' : 'text-olympus-text-dim hover:text-olympus-text')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={11} /> {t.label}
                {count != null && <span className="rounded bg-olympus-text-dim/10 px-1 text-[9px] tabular-nums">{count}</span>}
              </button>
            );
          })}
          <div className="flex-1" />
          <button onClick={exportHops} disabled={!hops.length} className="mb-1 rounded border border-olympus-gold/15 px-2 py-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold disabled:opacity-30">export json</button>
        </nav>

        {tab === 'overview' && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-olympus-text">Últimos hops</h2>
                <button onClick={() => setTab('hops')} className="text-[10px] font-mono text-olympus-gold hover:underline">ver todos →</button>
              </div>
              <HopsTable rows={hops.slice(0, 8)} onPick={setSelectedHop} compact />
              {!hops.length && <Empty text="Nenhum hop no recorte. Rode um walk ou amplie a lane." />}
            </section>
            <div className="flex flex-col gap-3">
              <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
                <h2 className="mb-2 text-[13px] font-semibold text-olympus-text">Parks por classe</h2>
                {summary?.parksByClass?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {summary.parksByClass.map((p) => (
                      <span key={p.klass} className="rounded-md bg-olympus-red/5 px-2 py-1 text-[10px] font-mono text-olympus-red ring-1 ring-olympus-red/20">
                        {p.klass} <span className="text-olympus-text-dim">×{p.count}</span>
                      </span>
                    ))}
                  </div>
                ) : <Empty text="Nenhum park no recorte. Bom sinal." />}
              </section>
              <section className="rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
                <h2 className="mb-2 text-[13px] font-semibold text-olympus-text">Campanhas</h2>
                <div className="space-y-1.5">
                  {walks.slice(0, 5).map((w) => (
                    <button key={w.slug} onClick={() => setSelectedWalk(w)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-olympus-gold/5">
                      <span className="flex-1 truncate text-[11px] font-mono text-olympus-text">{w.slug}</span>
                      <span className="text-[10px] font-mono text-olympus-text-dim">gen {w.generation}</span>
                      <StatusChip status={w.status === 'DONE' ? 'completed' : w.status === 'PARKED' || w.status === 'BLOCKED' ? 'parked' : w.status === 'WAITING' ? 'waiting' : 'running'} />
                      <span className="text-[10px] font-mono tabular-nums text-olympus-text-dim">{w.completed}/{w.total}</span>
                    </button>
                  ))}
                  {!walks.length && <Empty text="Nenhuma campanha com plano." />}
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === 'hops' && (
          <section className="mt-4 rounded-xl border border-olympus-gold/15 bg-olympus-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-olympus-text">Hops <span className="text-olympus-text-dim">({hops.length})</span></h2>
              <span className="text-[10px] font-mono text-olympus-text-dim">clique para abrir o detalhe</span>
            </div>
            <HopsTable rows={hops.slice(0, visible)} onPick={setSelectedHop} />
            {hops.length > visible && (
              <button onClick={() => setVisible((n) => n + 120)} className="mt-3 w-full rounded-md border border-olympus-gold/15 py-2 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold">
                mostrar mais ({hops.length - visible} restantes)
              </button>
            )}
            {!hops.length && <Empty text="Nenhum hop encontrado." />}
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
            {!walks.length && <Empty text="Nenhuma campanha com plano." />}
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
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-olympus-gold/10 px-2 pb-1 text-[9px] font-mono uppercase tracking-wider text-olympus-text-dim">
        <span className="w-12 shrink-0">hora</span>
        <span className="flex-1">hop · god · modelo</span>
        <span className="w-[260px] shrink-0 text-right">status · tempo · custo</span>
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
  return (
    <div className="w-full h-full bg-olympus-bg overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ArrowLeft size={12} /> voltar para Hops</button>
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
  return (
    <div className="w-full h-full bg-olympus-bg overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[11px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ArrowLeft size={12} /> voltar para Walks</button>
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
