/**
 * build-talent-page.tsx — v0.0.32: the talent carousel.
 *
 * One sector per screen, large and animated; drag/swipe horizontally for the
 * next. Clicking a node opens the WHOLE arsenal (321 skills · 28 MCPs · 122
 * demigods from /api/olympus/arsenal) filtered by slot, with search; the user
 * can also type a value the catalog does not know. Caps: 3 skills, 3 MCPs,
 * 5 demigods. Stored as a user build, so the brain learns the preference.
 *
 * Performance: only the active slide animates its category icon; the others
 * use the static twin. Transitions are transform/opacity only.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Search, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILD_CATEGORIES, BUILD_LIMITS } from '@/lib/build-categories';

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];
type Slot = 'skills' | 'mcps' | 'demigods';

const SLOT_META: Record<Slot, { label: string; cap: number; tone: string }> = {
  skills: { label: 'skills', cap: BUILD_LIMITS.skills, tone: 'text-olympus-cyan' },
  mcps: { label: 'MCPs', cap: BUILD_LIMITS.mcps, tone: 'text-olympus-gold' },
  demigods: { label: 'agents', cap: BUILD_LIMITS.demigods, tone: 'text-olympus-purple' },
};

function initials(value: string): string {
  return value.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

interface Arsenal { skills: string[]; mcps: string[]; demigods: string[] }

export default function BuildTalentPage({
  onClose,
  onCreated,
  initialBuild,
}: {
  onClose: () => void;
  onCreated: () => void;
  /** Simulate: prefill from an existing build (the viewer's "simulate"). */
  initialBuild?: { name?: string; god?: string; signature?: string; skills?: string[]; mcps?: string[]; demigods?: string[] };
}) {
  const [active, setActive] = useState(0);
  const [name, setName] = useState(initialBuild?.name ? `${initialBuild.name} v2` : '');
  const [god, setGod] = useState(initialBuild?.god ?? 'athena');
  const [signature, setSignature] = useState(initialBuild?.signature ?? '');
  const [skills, setSkills] = useState<Set<string>>(new Set(initialBuild?.skills ?? []));
  const [mcps, setMcps] = useState<Set<string>>(new Set(initialBuild?.mcps ?? []));
  const [demigods, setDemigods] = useState<Set<string>>(new Set(initialBuild?.demigods ?? []));
  const [picker, setPicker] = useState<Slot | null>(null);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [arsenal, setArsenal] = useState<Arsenal>({ skills: [], mcps: [], demigods: [] });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const sets: Record<Slot, [Set<string>, (s: Set<string>) => void]> = {
    skills: [skills, setSkills],
    mcps: [mcps, setMcps],
    demigods: [demigods, setDemigods],
  };

  useEffect(() => {
    fetch('/api/olympus/arsenal', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setArsenal({ skills: d.skills ?? [], mcps: d.mcps ?? [], demigods: d.demigods ?? [] }); })
      .catch(() => { /* the curated options still work */ });
  }, []);

  const goTo = useCallback((index: number) => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.max(0, Math.min(BUILD_CATEGORIES.length - 1, index));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setActive(next);
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setActive((prev) => (prev === next ? prev : next));
  }, []);

  const toggle = (slot: Slot, value: string) => {
    const [set, apply] = sets[slot];
    const cap = SLOT_META[slot].cap;
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else if (next.size >= cap) { setNote(`${SLOT_META[slot].label}: ${cap} max`); return; }
    else next.add(value);
    setNote(null);
    apply(next);
  };

  const addCustom = () => {
    if (!picker) return;
    const value = custom.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
    if (!value) return;
    toggle(picker, value);
    if (!arsenal[picker].includes(value)) setArsenal((prev) => ({ ...prev, [picker]: [value, ...prev[picker]] }));
    setCustom('');
  };

  const options = useMemo(() => {
    if (!picker) return [];
    const catalog = arsenal[picker];
    const curated = BUILD_CATEGORIES.flatMap((c) => c[picker]);
    const all = [...new Set([...curated, ...catalog])];
    const q = query.trim().toLowerCase();
    return (q ? all.filter((o) => o.includes(q)) : all).slice(0, 120);
  }, [picker, arsenal, query]);

  const total = skills.size * 2 + mcps.size * 2 + demigods.size;
  const selected = useMemo(() => [...skills, ...mcps, ...demigods], [skills, mcps, demigods]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/design-builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, god, signature, skills: [...skills], mcps: [...mcps], demigods: [...demigods], note: `Talent carousel · ${total} points` }),
      });
      const d = await r.json();
      if (d?.ok) { onCreated(); onClose(); }
      else setNote(d?.error ?? 'save failed');
    } catch (e: any) { setNote(e?.message || 'save failed'); }
    finally { setBusy(false); }
  };

  const field = 'bg-olympus-bg border border-olympus-gold/20 rounded px-2 py-1 text-[10px] font-mono text-olympus-text placeholder:text-olympus-text-dim outline-none focus:border-olympus-gold/50';
  const cat = BUILD_CATEGORIES[active];

  return (
    <div className="absolute inset-0 flex flex-col bg-olympus-bg overflow-hidden">
      <header className="shrink-0 border-b border-olympus-gold/15 bg-[linear-gradient(180deg,rgba(212,165,116,0.06),transparent)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onClose} className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ChevronLeft size={11} /> builds</button>
          <span className="text-[11px] font-mono font-semibold text-olympus-gold uppercase tracking-wider">talent page</span>
          <input className={cn(field, 'w-48 h-7')} placeholder="build name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={cn(field, 'h-7')} value={god} onChange={(e) => setGod(e.target.value)} aria-label="god">
            {GODS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input className={cn(field, 'flex-1 h-7')} placeholder="task keywords — landing hero, pricing, auth…" value={signature} onChange={(e) => setSignature(e.target.value)} />
          <div className="flex items-center gap-3 px-2">
            {(['skills', 'mcps', 'demigods'] as Slot[]).map((slot) => {
              const [set] = sets[slot];
              const cap = SLOT_META[slot].cap;
              return (
                <span key={slot} className="text-center">
                  <span className={cn('block text-[15px] font-mono font-bold', set.size >= cap ? 'text-olympus-green' : 'text-olympus-gold')}>{set.size}<span className="text-[9px] text-olympus-text-dim">/{cap}</span></span>
                  <span className="block text-[7px] font-mono text-olympus-text-dim uppercase">{SLOT_META[slot].label}</span>
                </span>
              );
            })}
          </div>
          <button onClick={() => void save()} disabled={busy || !name.trim()} className="flex items-center gap-1 text-[9px] font-mono px-2.5 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/35 hover:bg-olympus-gold/25 disabled:opacity-40">
            {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} save
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 pb-1.5">
          <Sparkles size={9} className="text-olympus-gold" />
          <span className="text-[8px] font-mono text-olympus-text-dim truncate">
            {selected.length === 0 ? 'swipe the sectors, click a slot to search the whole arsenal' : `${total} points · ${selected.slice(0, 9).join(' · ')}`}
          </span>
          {note && <span className="ml-auto text-[8px] font-mono text-olympus-amber-soft">{note}</span>}
        </div>
      </header>

      {/* Carousel: one sector per screen */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="h-full flex overflow-x-auto snap-x snap-mandatory custom-scroll"
          style={{ scrollbarWidth: 'none' }}
        >
          {BUILD_CATEGORIES.map((c, index) => (
            <section key={c.id} className="snap-center shrink-0 w-full h-full flex flex-col items-center justify-center gap-5 px-6 py-4">
              <div className="flex flex-col items-center gap-1">
                <img src={index === active ? c.icon : c.iconStatic} alt="" width={112} height={112} draggable={false} />
                <span className="text-[15px] font-mono font-semibold uppercase tracking-[0.22em]" style={{ color: c.color }}>{c.name}</span>
                <span className="text-[9px] font-mono text-olympus-text-dim">sector {index + 1} of {BUILD_CATEGORIES.length}</span>
              </div>

              <div className="grid grid-cols-3 gap-6 sm:gap-10">
                {(['skills', 'mcps', 'demigods'] as Slot[]).map((slot) => {
                  const [set] = sets[slot];
                  const cap = SLOT_META[slot].cap;
                  return (
                    <div key={slot} className="flex flex-col items-center gap-2">
                      <span className={cn('text-[9px] font-mono uppercase tracking-[0.18em]', SLOT_META[slot].tone)}>
                        {SLOT_META[slot].label} {set.size}/{cap}
                      </span>
                      <button
                        onClick={() => { setPicker(slot); setQuery(''); }}
                        className="w-16 h-16 rounded-full border border-olympus-gold/30 bg-olympus-card/70 flex items-center justify-center text-olympus-gold hover:scale-105 hover:border-olympus-gold/60 transition-transform"
                        aria-label={`Choose ${SLOT_META[slot].label} for ${c.name}`}
                        data-tip={`Search the whole arsenal — ${SLOT_META[slot].label}`}
                      >
                        <Search size={18} />
                      </button>
                      <div className="flex flex-wrap justify-center gap-1 max-w-[190px]">
                        {[...set].slice(0, 6).map((v) => (
                          <span key={v} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-bg/70 border border-olympus-gold/15 text-olympus-text-dim">{v}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[9px] font-mono text-olympus-text-dim text-center max-w-md">{c.skills[0]} · {c.mcps[0]} · {c.demigods[0]} — the sector’s defaults; search adds anything from the arsenal.</p>
            </section>
          ))}
        </div>

        <button onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous sector" className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-olympus-gold/25 bg-olympus-panel/80 text-olympus-gold disabled:opacity-25 hover:bg-olympus-gold/10"><ChevronLeft size={16} className="mx-auto" /></button>
        <button onClick={() => goTo(active + 1)} disabled={active === BUILD_CATEGORIES.length - 1} aria-label="Next sector" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-olympus-gold/25 bg-olympus-panel/80 text-olympus-gold disabled:opacity-25 hover:bg-olympus-gold/10"><ChevronRight size={16} className="mx-auto" /></button>

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1">
          {BUILD_CATEGORIES.map((c, i) => (
            <button key={c.id} onClick={() => goTo(i)} aria-label={`Go to ${c.name}`} className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === active ? 'bg-olympus-gold' : 'bg-olympus-gold/25 hover:bg-olympus-gold/50')} />
          ))}
        </div>
      </div>

      <footer className="shrink-0 border-t border-olympus-gold/10 px-3 py-1 text-[8px] font-mono text-olympus-text-dim flex items-center gap-2">
        <Sparkles size={9} className="text-olympus-gold" />
        Hot builds come from evidence: the registry promotes a combination after 5 wins at 80%+. Your saved preferences teach the brain.
      </footer>

      {/* The arsenal search */}
      {picker && (
        <div className="absolute inset-0 z-30 bg-olympus-bg/97 flex flex-col" role="dialog" aria-modal="true" aria-label={`Search ${SLOT_META[picker].label}`}>
          <header className="flex items-center gap-2 px-3 py-2 border-b border-olympus-gold/15">
            <Search size={12} className="text-olympus-gold" />
            <span className={cn('text-[10px] font-mono font-semibold uppercase', SLOT_META[picker].tone)}>{SLOT_META[picker].label}</span>
            <span className="text-[8px] font-mono text-olympus-text-dim">{sets[picker][0].size}/{SLOT_META[picker].cap} equipped</span>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`search ${arsenal[picker].length} ${SLOT_META[picker].label}…`} className={cn(field, 'ml-auto w-64 h-7')} />
            <button onClick={() => setPicker(null)} aria-label="Close search" className="text-olympus-text-dim hover:text-olympus-red"><X size={13} /></button>
          </header>
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-olympus-gold/10">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }} placeholder="add your own (Enter)" className={cn(field, 'w-56 h-6')} />
            <button onClick={addCustom} className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/25"><Plus size={9} /> add</button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto custom-scroll p-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
            {options.map((opt) => {
              const on = sets[picker][0].has(opt);
              return (
                <button key={opt} onClick={() => toggle(picker, opt)} aria-pressed={on} className={cn('flex items-center gap-1.5 text-left px-2 py-1 rounded border transition-colors', on ? 'border-olympus-gold/60 bg-olympus-gold/10' : 'border-olympus-gold/10 hover:border-olympus-gold/35')}>
                  <span className="w-5 h-5 rounded-full border border-olympus-gold/30 flex items-center justify-center text-[7px] font-mono text-olympus-gold shrink-0">{initials(opt)}</span>
                  <span className="text-[9px] font-mono text-olympus-text truncate">{opt}</span>
                  {on && <Check size={10} className="ml-auto text-olympus-green shrink-0" />}
                </button>
              );
            })}
            {options.length === 0 && <p className="col-span-full text-center py-6 text-[9px] font-mono text-olympus-text-dim">no match — add it as a custom value above</p>}
          </div>
        </div>
      )}
    </div>
  );
}
