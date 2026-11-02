/**
 * build-talent-editor.tsx — v0.0.32: the LoL-style build editor.
 *
 * Left: the ten animated category nodes (public/build-icons). Click one to
 * open its arsenal; toggle skills (≤3), MCPs (≤3) and demigods (≤5). Right:
 * the live build summary and the name. Simple to read, many combinations,
 * and the result is a real user build in the registry (the brain learns from
 * its outcomes).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILD_CATEGORIES, BUILD_LIMITS, buildIconUrl } from '@/lib/build-categories';
import { useTheme } from '@/lib/theme-store';
import { resolvePalette } from '@/lib/theme';

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

export default function BuildTalentEditor({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const iconVersion = `${palette.gold}${palette.bg}`;
  const [activeId, setActiveId] = useState(BUILD_CATEGORIES[0]?.id ?? 'design');
  const [name, setName] = useState('');
  const [god, setGod] = useState('athena');
  const [signature, setSignature] = useState('');
  const [skills, setSkills] = useState<Set<string>>(new Set());
  const [mcps, setMcps] = useState<Set<string>>(new Set());
  const [demigods, setDemigods] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const active = useMemo(() => BUILD_CATEGORIES.find((c) => c.id === activeId) ?? BUILD_CATEGORIES[0], [activeId]);

  const toggle = (set: Set<string>, apply: (s: Set<string>) => void, value: string, cap: number) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else if (next.size >= cap) { setNote(`limit reached: ${cap} for this slot`); return; }
    else next.add(value);
    setNote(null);
    apply(next);
  };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/design-builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, god, signature,
          skills: [...skills], mcps: [...mcps], demigods: [...demigods],
          note: `Composed in the talent editor from ${new Set([...skills, ...mcps, ...demigods]).size} nodes.`,
        }),
      });
      const d = await r.json();
      if (d?.ok) {
        setName(''); setSignature(''); setSkills(new Set()); setMcps(new Set()); setDemigods(new Set());
        onCreated();
        onClose();
      } else setNote(d?.error ?? 'save failed');
    } catch (e: any) {
      setNote(e?.message || 'save failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const field = 'w-full bg-olympus-bg border border-olympus-gold/20 rounded px-2 py-1 text-[10px] font-mono text-olympus-text placeholder:text-olympus-text-dim outline-none focus:border-olympus-gold/50';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Build talent editor">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-xl border border-olympus-gold/25 bg-olympus-bg shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-4 py-2.5 border-b border-olympus-gold/10 bg-olympus-panel">
          <Sparkles size={13} className="text-olympus-gold" />
          <span className="text-[11px] font-mono font-semibold text-olympus-gold uppercase">build talent editor</span>
          <span className="text-[8px] font-mono text-olympus-text-dim">nodes → combinations → a real build</span>
          <button onClick={onClose} className="ml-auto text-olympus-text-dim hover:text-olympus-red" aria-label="Close"><X size={14} /></button>
        </header>

        <div className="flex-1 min-h-0 overflow-auto custom-scroll p-3 grid gap-3 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="grid grid-cols-5 gap-1.5">
              {BUILD_CATEGORIES.map((cat) => {
                const selected = activeId === cat.id;
                const count = [...cat.skills, ...cat.mcps, ...cat.demigods].filter((v) => skills.has(v) || mcps.has(v) || demigods.has(v)).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveId(cat.id)}
                    className={cn('relative rounded-lg border p-1.5 flex flex-col items-center gap-0.5 transition-all', selected ? 'border-olympus-gold/60 bg-olympus-gold/10 -translate-y-0.5' : 'border-olympus-gold/10 hover:border-olympus-gold/35')}
                    aria-pressed={selected}
                  >
                    <img src={buildIconUrl(cat, cat.id === activeId, iconVersion)} alt="" width={34} height={34} loading="lazy" />
                    <span className="text-[8px] font-mono text-olympus-text-dim uppercase">{cat.name}</span>
                    {count > 0 && <span className="absolute top-0.5 right-0.5 text-[7px] font-mono px-1 rounded-full bg-olympus-gold/20 text-olympus-gold">{count}</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-lg border border-olympus-gold/15 bg-olympus-panel/50 p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <img src={buildIconUrl(active, true, iconVersion)} alt="" width={18} height={18} />
                <span className="text-[10px] font-mono font-semibold text-olympus-text uppercase">{active.name}</span>
                <span className="ml-auto text-[8px] font-mono text-olympus-text-dim">{active.skills.length + active.mcps.length + active.demigods.length} options</span>
              </div>
              {([
                ['skills', active.skills, skills, setSkills, BUILD_LIMITS.skills],
                ['mcps', active.mcps, mcps, setMcps, BUILD_LIMITS.mcps],
                ['demigods', active.demigods, demigods, setDemigods, BUILD_LIMITS.demigods],
              ] as const).map(([label, options, set, apply, cap]) => (
                <div key={label} className="mb-1.5">
                  <div className="text-[8px] font-mono text-olympus-text-dim uppercase mb-1">{label} · {set.size}/{cap}</div>
                  <div className="flex flex-wrap gap-1">
                    {options.map((opt) => {
                      const on = set.has(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => toggle(set, apply as (s: Set<string>) => void, opt, cap)}
                          className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors', on ? 'border-olympus-gold/60 bg-olympus-gold/15 text-olympus-gold' : 'border-olympus-gold/15 text-olympus-text-dim hover:text-olympus-text')}
                          aria-pressed={on}
                        >
                          {on ? '✓ ' : ''}{opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-olympus-gold/15 bg-olympus-panel/50 p-2.5 flex flex-col gap-1.5">
            <span className="text-[9px] font-mono font-semibold text-olympus-gold uppercase">the build</span>
            <input className={field} placeholder="build name — e.g. Editorial hero v2" value={name} onChange={(e) => setName(e.target.value)} />
            <select className={field} value={god} onChange={(e) => setGod(e.target.value)} aria-label="god">
              {GODS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <input className={field} placeholder="task keywords — landing hero, pricing…" value={signature} onChange={(e) => setSignature(e.target.value)} />
            <div className="text-[8px] font-mono text-olympus-text-dim leading-relaxed">
              <div>skills: {[...skills].join(', ') || '—'}</div>
              <div>mcps: {[...mcps].join(', ') || '—'}</div>
              <div>demigods: {[...demigods].join(', ') || '—'}</div>
            </div>
            {note && <p className="text-[8px] font-mono text-olympus-amber-soft">{note}</p>}
            <button
              onClick={() => void create()}
              disabled={busy || !name.trim()}
              className="mt-auto flex items-center justify-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25 disabled:opacity-40"
            >
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} create build
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
