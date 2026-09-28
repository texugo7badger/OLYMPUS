/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { useOlympus, GOD_ICONS } from '@/lib/olympus-store';
import {
  History, Activity, Clock, AlertCircle, CheckCircle2, GitBranch, Wrench, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedNumber from './animated-number';

interface Episode {
  id: string;
  god: string;
  /** Lucide icon key (matches GOD_ICONS in store). */
  icon?: string;
  ts: string;
  impact: string;
  confidence: number;
  summary: string;
  outcome: string;
  tools: string[];
  source: 'vault' | 'simulated';
}

const IMPACT_COLORS: Record<string, string> = {
  high: 'text-olympus-red bg-olympus-red/10 ring-olympus-red/20',
  medium: 'text-olympus-amber-soft bg-olympus-amber-soft/10 ring-olympus-amber-soft/20',
  low: 'text-olympus-text-dim bg-olympus-text-dim/10 ring-olympus-text-dim/20',
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ------------------------------------------------------------------ */
/* Activity Timeline.                                                  */
/*                                                                     */
/* Features:                                                           */
/*  - Empty state when no episodes.                                    */
/*  - Uses GOD_ICONS instead of emoji glyphs.                          */
/*  - Pastel palette throughout.                                       */
/* ------------------------------------------------------------------ */
export default function ActivityTimeline() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterGod, setFilterGod] = useState<string | null>(null);
  const setActiveGod = useOlympus(s => s.setActiveGod);
  const pushEvent = useOlympus(s => s.pushEvent);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch('/api/olympus/episodes', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(timeout);
        if (!r.ok) throw new Error(`API ${r.status}`);
        const d = await r.json();
        if (cancelled) return;
        setEpisodes(Array.isArray(d?.episodes) ? d.episodes : []);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        // On error, stop loading and show empty state (no infinite spinner).
        setEpisodes([]);
        setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const filtered = filterGod ? episodes.filter(e => e.god === filterGod) : episodes;
  const highImpact = filtered.filter(e => e.impact === 'high').length;
  // Count delegations — episodes where the outcome mentions "delegated" or the type field is delegation.
  // (The Activity Timeline now absorbs the Delegation History view — user request.)
  const delegations = filtered.filter(e =>
    e.outcome?.toLowerCase().includes('delegat') ||
    (e as any).type === 'delegation'
  ).length;

  return (
    <div className="h-full overflow-y-auto custom-scroll bg-olympus-bg p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <History size={16} className="text-olympus-cyan" />
        <h2 className="text-sm font-semibold text-olympus-cyan">Recent Activity</h2>
        <span className="text-[9px] text-olympus-text-dim font-mono ml-auto">last 24h · refresh 15s</span>
      </div>

      {/* Summary stats — replaced "avg conf" (overused everywhere) with "delegations" */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-cyan/15">
          <div className="flex items-center gap-1 mb-0.5">
            <Clock size={10} className="text-olympus-cyan" />
            <span className="text-[8px] font-mono text-olympus-text-dim uppercase">episodes</span>
          </div>
          <div className="text-base font-bold font-mono text-olympus-cyan">
            <AnimatedNumber value={filtered.length} />
          </div>
        </div>
        <div className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-red/15">
          <div className="flex items-center gap-1 mb-0.5">
            <AlertCircle size={10} className="text-olympus-red" />
            <span className="text-[8px] font-mono text-olympus-text-dim uppercase">high impact</span>
          </div>
          <div className="text-base font-bold font-mono text-olympus-red">
            <AnimatedNumber value={highImpact} />
          </div>
        </div>
        <div className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-gold/15">
          <div className="flex items-center gap-1 mb-0.5">
            <ArrowRight size={10} className="text-olympus-gold" />
            <span className="text-[8px] font-mono text-olympus-text-dim uppercase">delegations</span>
          </div>
          <div className="text-base font-bold font-mono text-olympus-gold">
            <AnimatedNumber value={delegations} />
          </div>
        </div>
      </div>

      {/* God filter chips (uses GOD_ICONS, not emoji) */}
      <div className="flex flex-wrap gap-1 mb-3">
        <FilterChip label="all" active={!filterGod} onClick={() => setFilterGod(null)} />
        {(Array.from(new Set(episodes.map(e => e.god))) as string[]).map((g) => {
          const Icon = GOD_ICONS[g];
          return (
            <FilterChip
              key={g}
              icon={Icon}
              label={g}
              active={filterGod === g}
              onClick={() => setFilterGod(filterGod === g ? null : g)}
            />
          );
        })}
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-linear-to-b from-olympus-gold/30 via-olympus-gold/10 to-transparent" />
        {loading && (
          <div className="text-center py-8 text-olympus-text-dim text-xs font-mono">loading episodes…</div>
        )}
        {/* Issue 4 — clean empty state on first load */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-olympus-gold/10 border border-olympus-gold/20 mb-3">
              <Activity size={18} className="text-olympus-gold" />
            </div>
            <p className="text-olympus-text text-xs font-mono mb-1">No activity yet.</p>
            <p className="text-olympus-text-dim text-[11px] font-mono max-w-xs mx-auto leading-relaxed">
              Dispatch a task to Apollo to see real-time events.
            </p>
          </div>
        )}
        {filtered.map((ep, i) => (
          <TimelineItem
            key={ep.id}
            ep={ep}
            isLast={i === filtered.length - 1}
            onClick={() => {
              setActiveGod(ep.god);
              pushEvent({ type: 'timeline_select', god: ep.god, msg: `Focused ${ep.god} from timeline`, ts: new Date().toISOString() });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineItem({ ep, isLast, onClick }: { ep: Episode; isLast: boolean; onClick: () => void }) {
  const Icon = GOD_ICONS[ep.god] || GOD_ICONS[ep.icon || ''];
  return (
    <button
      onClick={onClick}
      className="relative w-full text-left pl-8 pr-2 py-2.5 hover:bg-olympus-gold/5 rounded-lg transition-colors group"
    >
      <div className={cn(
        'absolute left-2 top-3.5 w-3 h-3 rounded-full border-2 border-olympus-bg z-10',
        ep.impact === 'high' ? 'bg-olympus-red shadow-[0_0_8px_rgba(196,117,106,0.6)]' :
        ep.impact === 'medium' ? 'bg-olympus-amber-soft shadow-[0_0_6px_rgba(196,162,101,0.5)]' :
        'bg-olympus-text-dim',
      )} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {Icon ? <Icon size={13} className="text-olympus-gold" /> : null}
            <span className="text-[11px] font-mono text-olympus-gold capitalize">{ep.god}</span>
            <span className={cn('text-[8px] font-mono px-1 py-0.5 rounded ring-1', IMPACT_COLORS[ep.impact])}>
              {ep.impact}
            </span>
            {ep.source === 'vault' && (
              <span className="text-[8px] font-mono text-olympus-green flex items-center gap-0.5">
                <CheckCircle2 size={8} /> vault
              </span>
            )}
          </div>
          <div className="text-[11px] text-olympus-text leading-snug mb-1">{ep.summary}</div>
          <div className="text-[10px] text-olympus-text-dim leading-snug flex items-start gap-1">
            <GitBranch size={9} className="text-olympus-text-dim mt-0.5 shrink-0" />
            <span>{ep.outcome}</span>
          </div>
          {ep.tools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {ep.tools.slice(0, 4).map(t => (
                <span key={t} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-card/50 text-olympus-text-dim flex items-center gap-0.5">
                  <Wrench size={7} /> {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] font-mono text-olympus-text-dim">{formatTime(ep.ts)}</div>
          <div className="text-[9px] font-mono text-[#5A5A5A]">{timeAgo(ep.ts)}</div>
          <div className={cn('text-[9px] font-mono font-bold mt-0.5',
            ep.confidence >= 0.85 ? 'text-olympus-green' : ep.confidence >= 0.7 ? 'text-olympus-amber-soft' : 'text-olympus-text-dim')}>
            {ep.confidence.toFixed(2)}
          </div>
        </div>
      </div>
    </button>
  );
}

function FilterChip({ label, icon: Icon, active, onClick }: { label: string; icon?: any; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-[9px] font-mono px-2 py-0.5 rounded-full transition-all capitalize flex items-center gap-1',
        active
          ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/40'
          : 'bg-olympus-card/50 text-olympus-text-dim hover:bg-olympus-card hover:text-olympus-text',
      )}
    >
      {Icon ? <Icon size={9} /> : null}
      {label}
    </button>
  );
}
