/**
 * build-talent-page.tsx — v0.0.32: the LoL-style talent page.
 *
 * Three counters (skills 3 · MCPs 3 · demigods 5), five columns, each column a
 * sector whose tiers are the arsenal: skills, MCPs, demigods. Click a rune to
 * equip it; the ring lights in the sector color. Simple to read, exponential
 * in combinations, and the result is a real build the brain learns from.
 *
 * Performance: no animated icons in the grid (the static twins), transitions
 * on transform/opacity only, no backdrop blur — 60fps even with five columns.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronLeft, Hammer, Loader2, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILD_CATEGORIES, BUILD_LIMITS } from '@/lib/build-categories';

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];
const DEFAULT_COLUMNS = ['design', 'code', 'qa', 'data', 'infra'];

function initials(value: string): string {
  return value.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

type Slot = 'skills' | 'mcps' | 'demigods';

export default function BuildTalentPage({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [name, setName] = useState('');
  const [god, setGod] = useState('athena');
  const [signature, setSignature] = useState('');
  const [skills, setSkills] = useState<Set<string>>(new Set());
  const [mcps, setMcps] = useState<Set<string>>(new Set());
  const [demigods, setDemigods] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const sets: Record<Slot, [Set<string>, (s: Set<string>) => void, number]> = {
    skills: [skills, setSkills, BUILD_LIMITS.skills],
    mcps: [mcps, setMcps, BUILD_LIMITS.mcps],
    demigods: [demigods, setDemigods, BUILD_LIMITS.demigods],
  };

  const toggle = (slot: Slot, value: string) => {
    const [set, apply, cap] = sets[slot];
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else if (next.size >= cap) { setNote(`${slot}: ${cap} max`); return; }
    else next.add(value);
    setNote(null);
    apply(next);
  };

  const total = skills.size * 2 + mcps.size * 2 + demigods.size;
  const chosen = useMemo(() => [...skills, ...mcps, ...demigods], [skills, mcps, demigods]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/design-builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, god, signature, skills: [...skills], mcps: [...mcps], demigods: [...demigods], note: `Talent page · ${total} points` }),
      });
      const d = await r.json();
      if (d?.ok) { onCreated(); onClose(); }
      else setNote(d?.error ?? 'save failed');
    } catch (e: any) { setNote(e?.message || 'save failed'); }
    finally { setBusy(false); }
  };

  const field = 'bg-olympus-bg border border-olympus-gold/20 rounded px-2 py-1 text-[10px] font-mono text-olympus-text placeholder:text-[#5A5A5A] outline-none focus:border-olympus-gold/50';

  return (
    <div className="absolute inset-0 flex flex-col bg-olympus-bg overflow-hidden">
      {/* Header — the LoL page chrome */}
      <header className="shrink-0 border-b border-olympus-gold/15 bg-[linear-gradient(180deg,rgba(212,165,116,0.06),transparent)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onClose} className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ChevronLeft size={11} /> builds</button>
          <span className="text-[11px] font-mono font-semibold text-olympus-gold uppercase tracking-wider">talent page</span>
          <input className={cn(field, 'w-52 h-7')} placeholder="build name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={cn(field, 'h-7')} value={god} onChange={(e) => setGod(e.target.value)} aria-label="god">
            {GODS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input className={cn(field, 'flex-1 h-7')} placeholder="task keywords — landing hero, pricing, auth…" value={signature} onChange={(e) => setSignature(e.target.value)} />
          <div className="flex items-center gap-3 px-2">
            {([
              ['skills', skills.size, BUILD_LIMITS.skills],
              ['mcps', mcps.size, BUILD_LIMITS.mcps],
              ['demigods', demigods.size, BUILD_LIMITS.demigods],
            ] as const).map(([label, n, cap]) => (
              <span key={label} className="text-center">
                <span className={cn('block text-[15px] font-mono font-bold', n >= cap ? 'text-olympus-green' : 'text-olympus-gold')}>{n}<span className="text-[9px] text-olympus-text-dim">/{cap}</span></span>
                <span className="block text-[7px] font-mono text-olympus-text-dim uppercase">{label}</span>
              </span>
            ))}
          </div>
          <button
            onClick={() => void save()}
            disabled={busy || !name.trim()}
            className="flex items-center gap-1 text-[9px] font-mono px-2.5 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/35 hover:bg-olympus-gold/25 disabled:opacity-40"
          >
            {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} save build
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 pb-1.5">
          <Search size={9} className="text-olympus-text-dim" />
          <span className="text-[8px] font-mono text-olympus-text-dim">
            {chosen.length === 0 ? 'click a rune in any column — the counters cap the build' : `${total} points · ${chosen.slice(0, 8).join(' · ')}${chosen.length > 8 ? ' …' : ''}`}
          </span>
          {note && <span className="ml-auto text-[8px] font-mono text-olympus-amber-soft">{note}</span>}
        </div>
      </header>

      {/* Columns */}
      <div className="flex-1 min-h-0 overflow-auto custom-scroll px-2 py-2">
        <div className="grid grid-cols-5 gap-2 min-w-[860px]">
          {columns.map((catId, colIndex) => {
            const cat = BUILD_CATEGORIES.find((c) => c.id === catId) ?? BUILD_CATEGORIES[0];
            const tier = (label: string, slot: Slot, options: string[]) => {
              const [set] = sets[slot];
              return (
                <div className="mt-3">
                  <div className="flex items-center gap-1 mb-1.5">
                    <span className="h-px flex-1 bg-olympus-gold/15" />
                    <span className="text-[7px] font-mono uppercase tracking-[0.18em] text-olympus-text-dim">{label}</span>
                    <span className="h-px flex-1 bg-olympus-gold/15" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {options.map((opt) => {
                      const on = set.has(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => toggle(slot, opt)}
                          data-tip={opt}
                          aria-pressed={on}
                          className={cn(
                            'group relative w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-150',
                            on
                              ? 'border-olympus-gold/70 bg-olympus-gold/15 text-olympus-gold scale-105'
                              : 'border-olympus-gold/20 bg-olympus-card/70 text-olympus-text-dim hover:border-olympus-gold/50 hover:text-olympus-text hover:scale-105',
                          )}
                          style={on ? { boxShadow: `0 0 14px ${cat.color}55` } : undefined}
                        >
                          <span className="text-[10px] font-mono font-bold tracking-tight">{initials(opt)}</span>
                          {on && <span className="absolute -inset-0.5 rounded-full ring-1" style={{ borderColor: cat.color, boxShadow: `0 0 8px ${cat.color}66` }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            };
            return (
              <section key={`${cat.id}-${colIndex}`} className="relative rounded-lg border border-olympus-gold/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent)] px-2 pb-3 min-h-[540px] flex flex-col">
                <div className="flex items-center gap-1 pt-2">
                  <img src={cat.iconStatic} alt="" width={20} height={20} className="opacity-90" />
                  <span className="text-[9px] font-mono font-semibold uppercase tracking-wide" style={{ color: cat.color }}>{cat.name}</span>
                </div>
                <select
                  value={cat.id}
                  onChange={(e) => setColumns((prev) => prev.map((c, i) => (i === colIndex ? e.target.value : c)))}
                  className="mt-0.5 w-full bg-transparent border-0 text-[7px] font-mono text-olympus-text-dim uppercase outline-none cursor-pointer"
                  aria-label={`Column ${colIndex + 1} sector`}
                >
                  {BUILD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {tier('skills', 'skills', cat.skills)}
                {tier('mcps', 'mcps', cat.mcps)}
                {tier('agents', 'demigods', cat.demigods)}
                <div className="mt-auto pt-3 flex items-center justify-center gap-1 text-[7px] font-mono text-olympus-text-dim/70">
                  <Hammer size={8} /> runes equip the build
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <footer className="shrink-0 border-t border-olympus-gold/10 px-3 py-1 text-[8px] font-mono text-olympus-text-dim flex items-center gap-2">
        <Sparkles size={9} className="text-olympus-gold" />
        Hot builds come from evidence: the registry promotes a combination after 5 wins at 80%+. The gods pick from this page and the brain keeps the score.
      </footer>
    </div>
  );
}
