/**
 * design-builds-panel.tsx — v0.0.32: the BUILD HUB.
 *
 * Defaults + organically learned builds + user builds in one place, grouped by
 * sector and filterable by god. Each card carries its auto-description and its
 * evidence; clicking opens the viewer, where "simulate" loads the loadout into
 * the talent carousel. The first visit gets a four-step animated tutorial.
 *
 * 60 FPS: no animated icons in the grid (static twins), transform/opacity
 * transitions, no backdrop blur, capped lists.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Flame, Loader2, Search, Share2, Snowflake, Sparkles, Sun, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildPrompt, describeBuild, type DesignBuildWithStats } from '@/lib/design-builds';
import { BUILD_CATEGORIES } from '@/lib/build-categories';
import BuildTalentPage from './build-talent-page';

const TIER: Record<string, { label: string; className: string; Icon: any }> = {
  hot: { label: 'hot', className: 'border-olympus-green/45 text-olympus-green bg-olympus-green/10', Icon: Flame },
  warm: { label: 'warm', className: 'border-olympus-gold/45 text-olympus-gold bg-olympus-gold/10', Icon: Sun },
  cold: { label: 'cold', className: 'border-olympus-cyan/35 text-olympus-cyan bg-olympus-cyan/10', Icon: Snowflake },
};

const TUTORIAL_KEY = 'olympus:build-tutorial';

const TUTORIAL_STEPS = [
  {
    title: 'A build is a loadout',
    body: 'One god leads. Up to 5 demigods work in parallel, each a specialist. The god also equips up to 3 skills and 3 MCPs — the whole arsenal, narrowed to the task.',
  },
  {
    title: 'The caps keep it honest',
    body: '3 skills · 3 MCPs · 5 agents. Fewer is usually better: a small, proven combination beats a kitchen sink. The editor refuses the fourth skill.',
  },
  {
    title: 'Evidence sets the tier',
    body: 'A combination with 5+ wins at 80%+ becomes HOT. Two wins at 50%+ is WARM. Everything else is COLD until it earns its place — the arsenal-resonance log is the judge.',
  },
  {
    title: 'Now build one',
    body: 'Open the talent page: swipe the sectors, click a slot, search the whole arsenal. Save it and the brain learns from the result — your preference is a first-class signal.',
  },
];

export default function DesignBuildsPanel() {
  const [builds, setBuilds] = useState<DesignBuildWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const [god, setGod] = useState('all');
  const [talent, setTalent] = useState<{ initial?: Partial<DesignBuildWithStats> } | null>(null);
  const [detail, setDetail] = useState<DesignBuildWithStats | null>(null);
  const [tutorial, setTutorial] = useState<{ open: boolean; step: number }>({ open: false, step: 0 });
  const [sharedNote, setSharedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/olympus/design-builds', { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) { setBuilds(d.builds ?? []); setError(null); }
      else setError(d?.error ?? 'failed to load builds');
    } catch (e: any) { setError(e?.message || 'failed to load builds'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TUTORIAL_KEY)) setTutorial({ open: true, step: 0 });
    } catch { /* private mode */ }
  }, []);
  // A global full-screen surface (studio, settings) must never be blocked by
  // the build tutorial sitting underneath it.
  useEffect(() => {
    const close = () => {
      setTutorial({ open: false, step: 0 });
      try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* private */ }
    };
    window.addEventListener('olympus:close-tutorial', close);
    return () => window.removeEventListener('olympus:close-tutorial', close);
  }, []);

  const closeTutorial = useCallback(() => {
    setTutorial({ open: false, step: 0 });
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* private mode */ }
  }, []);

  const cats = useMemo(() => ['all', ...Array.from(new Set(builds.map((b) => b.category ?? 'custom')))], [builds]);
  const gods = useMemo(() => ['all', ...Array.from(new Set(builds.map((b) => b.god)))], [builds]);
  const q = query.trim().toLowerCase();
  const visible = builds.filter((b) => {
    if (cat !== 'all' && (b.category ?? 'custom') !== cat) return false;
    if (god !== 'all' && b.god !== god) return false;
    if (!q) return true;
    return `${b.name} ${b.signature} ${b.god} ${b.skills.join(' ')} ${b.mcps.join(' ')} ${b.demigods.join(' ')}`.toLowerCase().includes(q);
  });
  const grouped = useMemo(() => {
    const map = new Map<string, DesignBuildWithStats[]>();
    for (const b of visible) {
      const key = b.category ?? 'custom';
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()];
  }, [visible]);

  const counts = useMemo(() => ({
    hot: builds.filter((b) => b.stats.tier === 'hot').length,
    warm: builds.filter((b) => b.stats.tier === 'warm').length,
    cold: builds.filter((b) => b.stats.tier === 'cold').length,
  }), [builds]);

  const share = useCallback(async (build: DesignBuildWithStats) => {
    try {
      const r = await fetch('/api/olympus/design-builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...build, shared: true }),
      });
      const d = await r.json();
      setSharedNote(d?.ok ? 'shared — ready for the market base' : (d?.error ?? 'share failed'));
      await load();
    } catch (e: any) { setSharedNote(e?.message || 'share failed'); }
  }, [load]);

  if (talent) {
    return (
      <BuildTalentPage
        initialBuild={talent.initial}
        onClose={() => setTalent(null)}
        onCreated={() => { void load(); }}
      />
    );
  }

  return (
    <div className="absolute inset-0 overflow-auto custom-scroll p-3">
      <header className="flex flex-wrap items-center gap-2 mb-2">
        <Sparkles size={12} className="text-olympus-gold" />
        <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">build hub</span>
        <span className="text-[8px] font-mono text-olympus-text-dim">{counts.hot} hot · {counts.warm} warm · {counts.cold} cold</span>
        <div className="relative ml-auto">
          <Search size={9} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-olympus-text-dim" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search builds…" className="w-40 bg-olympus-bg border border-olympus-gold/20 rounded pl-5 pr-1.5 py-1 text-[9px] font-mono text-olympus-text outline-none focus:border-olympus-gold/50" />
        </div>
        <button onClick={() => setTutorial({ open: true, step: 0 })} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-olympus-gold/25 text-olympus-text-dim hover:text-olympus-text">tutorial</button>
        <button onClick={() => setTalent({})} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-purple/15 text-olympus-purple ring-1 ring-olympus-purple/30 hover:bg-olympus-purple/25">
          <Sparkles size={10} /> talent editor
        </button>
        <button onClick={() => void load()} aria-label="Refresh builds" className="text-olympus-text-dim hover:text-olympus-gold"><Loader2 size={11} className={loading ? 'animate-spin' : ''} /></button>
      </header>

      <div className="flex flex-wrap items-center gap-1 mb-2">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn('text-[8px] font-mono px-1.5 py-0.5 rounded-full border uppercase', cat === c ? 'border-olympus-gold/50 bg-olympus-gold/10 text-olympus-gold' : 'border-olympus-gold/10 text-olympus-text-dim hover:text-olympus-text')}>{c}</button>
        ))}
        <select value={god} onChange={(e) => setGod(e.target.value)} className="ml-auto bg-olympus-bg border border-olympus-gold/20 rounded px-1.5 py-0.5 text-[8px] font-mono text-olympus-text-dim outline-none" aria-label="Filter by god">
          {gods.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {error && <p className="text-[9px] font-mono text-olympus-red mb-2">{error}</p>}

      <div className="space-y-3">
        {grouped.map(([category, list]) => (
          <section key={category}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[9px] font-mono uppercase tracking-wide text-olympus-text">{category}</span>
              <span className="text-[8px] font-mono text-olympus-text-dim">{list.length}</span>
              <span className="h-px flex-1 bg-olympus-gold/10" />
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {list.map((b) => {
                const tier = TIER[b.stats.tier] ?? TIER.cold;
                const Icon = tier.Icon;
                return (
                  <button
                    key={b.id}
                    onClick={() => setDetail(b)}
                    className={cn(
                      'rounded-lg border bg-olympus-panel/60 p-2.5 text-left transition-all duration-150 hover:-translate-y-0.5',
                      b.stats.tier === 'hot' ? 'border-olympus-green/35 shadow-[0_0_18px_rgba(123,174,142,0.08)]'
                        : b.stats.tier === 'warm' ? 'border-olympus-gold/25' : 'border-olympus-gold/10',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono font-semibold text-olympus-text truncate">{b.name}</span>
                      {b.source === 'user' && <span className="text-[8px] font-mono text-olympus-purple uppercase">yours</span>}
                      {b.shared && <Share2 size={9} className="text-olympus-cyan" />}
                      <span className={cn('ml-auto flex items-center gap-1 text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border', tier.className)}>
                        <Icon size={9} /> {tier.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[8px] font-mono text-olympus-text-dim">
                      {b.god} · {b.demigods.length} agent{b.demigods.length === 1 ? '' : 's'} · {b.stats.samples} sample{b.stats.samples === 1 ? '' : 's'} · {(b.stats.rate * 100).toFixed(0)}% smoothed
                    </div>
                    <p className="mt-1 text-[8px] font-mono text-olympus-text-dim/85 leading-relaxed line-clamp-2">{describeBuild(b)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {[...new Set([...b.skills, ...b.mcps, ...b.demigods])].slice(0, 8).map((chip) => (
                        <span key={chip} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-bg/60 border border-olympus-gold/10 text-olympus-text-dim">{chip}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {visible.length === 0 && !loading && (
          <p className="text-center py-10 text-[10px] font-mono text-olympus-text-dim">no builds match — clear the filters or create one</p>
        )}
      </div>

      {/* The detail viewer */}
      {detail && (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/65 p-4" onClick={() => setDetail(null)} role="dialog" aria-modal="true" aria-label={`Build ${detail.name}`}>
          <div className="w-full max-w-xl max-h-[85vh] overflow-auto custom-scroll rounded-xl border border-olympus-gold/25 bg-olympus-bg p-3" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center gap-1.5 mb-2">
              <Sparkles size={12} className="text-olympus-gold" />
              <span className="text-[12px] font-mono font-semibold text-olympus-text">{detail.name}</span>
              {detail.source === 'user' && <span className="text-[8px] font-mono text-olympus-purple uppercase">yours</span>}
              {detail.shared && <span className="text-[8px] font-mono text-olympus-cyan uppercase flex items-center gap-0.5"><Share2 size={8} /> shared</span>}
              <button onClick={() => setDetail(null)} className="ml-auto text-olympus-text-dim hover:text-olympus-red" aria-label="Close build"><X size={13} /></button>
            </header>
            <p className="text-[10px] font-mono text-olympus-text leading-relaxed">{describeBuild(detail)}</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[9px] font-mono">
              <span className="rounded bg-olympus-card px-1.5 py-1">tier <b className="text-olympus-gold">{detail.stats.tier}</b></span>
              <span className="rounded bg-olympus-card px-1.5 py-1">samples <b className="text-olympus-gold">{detail.stats.samples}</b></span>
              <span className="rounded bg-olympus-card px-1.5 py-1">smoothed <b className="text-olympus-gold">{(detail.stats.rate * 100).toFixed(0)}%</b></span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {[...new Set([...detail.skills, ...detail.mcps, ...detail.demigods])].map((chip) => (
                <span key={chip} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-card border border-olympus-gold/15 text-olympus-text-dim">{chip}</span>
              ))}
            </div>
            <pre className="mt-2 max-h-40 overflow-auto custom-scroll rounded bg-olympus-card/60 p-2 text-[8px] font-mono text-olympus-text-dim whitespace-pre-wrap">{buildPrompt(detail)}</pre>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                onClick={() => { setTalent({ initial: detail }); setDetail(null); }}
                className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25"
              >
                <Sparkles size={10} /> simulate in the editor <ArrowRight size={9} />
              </button>
              <button
                onClick={() => void share(detail)}
                className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20"
              >
                <Share2 size={9} /> share
              </button>
              {sharedNote && <span className="text-[8px] font-mono text-olympus-text-dim">{sharedNote}</span>}
            </div>
          </div>
        </div>
      )}

      {/* The first-run tutorial */}
      {tutorial.open && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Build tutorial">
          <div className="w-full max-w-md rounded-xl border border-olympus-gold/30 bg-olympus-bg p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={12} className="text-olympus-gold" />
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wide text-olympus-gold">build tutorial</span>
              <span className="ml-auto text-[8px] font-mono text-olympus-text-dim">{tutorial.step + 1}/{TUTORIAL_STEPS.length}</span>
              <button onClick={closeTutorial} className="text-olympus-text-dim hover:text-olympus-red" aria-label="Close tutorial"><X size={12} /></button>
            </div>
            <h3 className="text-[13px] font-mono font-semibold text-olympus-text">{TUTORIAL_STEPS[tutorial.step].title}</h3>
            <p className="mt-1 text-[10px] font-mono text-olympus-text-dim leading-relaxed">{TUTORIAL_STEPS[tutorial.step].body}</p>
            <div className="mt-3 flex items-center gap-1.5">
              <div className="flex gap-1">
                {TUTORIAL_STEPS.map((_, i) => (
                  <span key={i} className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === tutorial.step ? 'bg-olympus-gold' : 'bg-olympus-gold/25')} />
                ))}
              </div>
              <button onClick={closeTutorial} className="ml-auto text-[9px] font-mono text-olympus-text-dim hover:text-olympus-text">skip</button>
              {tutorial.step < TUTORIAL_STEPS.length - 1 ? (
                <button onClick={() => setTutorial((t) => ({ ...t, step: t.step + 1 }))} className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25">
                  next <ArrowRight size={9} />
                </button>
              ) : (
                <button onClick={() => { closeTutorial(); setTalent({}); }} className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25">
                  <Check size={9} /> build my first
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
