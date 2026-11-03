/**
 * build-talent-page.tsx — v0.0.53: the Talent Studio.
 *
 * A talent is a named loadout: one god, a task signature, up to 3 skills,
 * 3 MCPs and 5 demigods. This is a creation surface, not a carousel: the
 * sigil is generated from the name/god, the slots are editable, the community
 * shelf forks a preset, and publish exports the loadout as JSON.
 *
 * Interaction: transform/opacity only; the sigil animates on its own (static
 * in stable mode); the slot search is keyboard-friendly and capped.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Copy, Download, Loader2, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILD_CATEGORIES, BUILD_LIMITS } from '@/lib/build-categories';
import { TALENT_PRESETS } from '@/lib/talent-presets';
import TalentSigil from './talent-sigil';
import { toast } from 'sonner';

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];
type Slot = 'skills' | 'mcps' | 'demigods';
const SLOT_META: Record<Slot, { label: string; cap: number; tone: string; placeholder: string }> = {
  skills: { label: 'skills', cap: BUILD_LIMITS.skills, tone: 'text-olympus-cyan', placeholder: 'search the whole skill arsenal…' },
  mcps: { label: 'MCPs', cap: BUILD_LIMITS.mcps, tone: 'text-olympus-gold', placeholder: 'search MCP servers…' },
  demigods: { label: 'agents', cap: BUILD_LIMITS.demigods, tone: 'text-olympus-purple', placeholder: 'search demigods…' },
};
const field = 'bg-olympus-bg border border-olympus-gold/20 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-olympus-text placeholder:text-olympus-text-dim outline-none focus:border-olympus-gold/50';

function initials(value: string): string {
  return value.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function BuildTalentPage({
  onClose,
  onCreated,
  initialBuild,
}: {
  onClose: () => void;
  onCreated: () => void;
  initialBuild?: { name?: string; god?: string; signature?: string; skills?: string[]; mcps?: string[]; demigods?: string[] };
}) {
  const [name, setName] = useState(initialBuild?.name ? `${initialBuild.name} v2` : '');
  const [god, setGod] = useState(initialBuild?.god ?? 'athena');
  const [signature, setSignature] = useState(initialBuild?.signature ?? '');
  const [skills, setSkills] = useState<Set<string>>(new Set(initialBuild?.skills ?? []));
  const [mcps, setMcps] = useState<Set<string>>(new Set(initialBuild?.mcps ?? []));
  const [demigods, setDemigods] = useState<Set<string>>(new Set(initialBuild?.demigods ?? []));
  const [picker, setPicker] = useState<Slot | null>(null);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [arsenal, setArsenal] = useState<Record<Slot, string[]>>({ skills: [], mcps: [], demigods: [] });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const sets: Record<Slot, [Set<string>, (s: Set<string>) => void]> = {
    skills: [skills, setSkills], mcps: [mcps, setMcps], demigods: [demigods, setDemigods],
  };

  useEffect(() => {
    fetch('/api/olympus/arsenal', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setArsenal({ skills: d.skills ?? [], mcps: d.mcps ?? [], demigods: d.demigods ?? [] }); })
      .catch(() => { /* curated presets still work */ });
  }, []);

  const toggle = useCallback((slot: Slot, value: string) => {
    const [set, apply] = sets[slot];
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else if (next.size >= SLOT_META[slot].cap) { setNote(`${SLOT_META[slot].label}: ${SLOT_META[slot].cap} max`); return; }
    else next.add(value);
    setNote(null); apply(next);
  }, [sets]);

  const options = useMemo(() => {
    if (!picker) return [];
    const curated = BUILD_CATEGORIES.flatMap((c) => c[picker]);
    const all = [...new Set([...curated, ...arsenal[picker]])];
    const q = query.trim().toLowerCase();
    return (q ? all.filter((o) => o.toLowerCase().includes(q)) : all).slice(0, 160);
  }, [picker, arsenal, query]);

  const applyPreset = (preset: typeof TALENT_PRESETS[number]) => {
    setName(preset.name); setGod(preset.god); setSignature(preset.signature);
    setSkills(new Set(preset.skills.slice(0, BUILD_LIMITS.skills)));
    setMcps(new Set(preset.mcps.slice(0, BUILD_LIMITS.mcps)));
    setDemigods(new Set(preset.demigods.slice(0, BUILD_LIMITS.demigods)));
    setNote(`forked ${preset.name} — change anything`);
  };

  const clear = () => { setName(''); setSignature(''); setSkills(new Set()); setMcps(new Set()); setDemigods(new Set()); setNote(null); };
  const power = skills.size * 2 + mcps.size * 2 + demigods.size;
  const selected = [...skills, ...mcps, ...demigods];

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/design-builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, god, signature, skills: [...skills], mcps: [...mcps], demigods: [...demigods], note: `Talent Studio · ${power} points` }),
      });
      const d = await r.json();
      if (d?.ok) { onCreated(); onClose(); }
      else setNote(d?.error ?? 'save failed');
    } catch (e: any) { setNote(e?.message || 'save failed'); }
    finally { setBusy(false); }
  };

  const exportTalent = async () => {
    const payload = { kind: 'olympus-talent', version: 1, name, god, signature, skills: [...skills], mcps: [...mcps], demigods: [...demigods], note };
    try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); toast.success('talent JSON copied — share it'); }
    catch { toast.error('clipboard blocked'); }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-olympus-bg overflow-hidden">
      <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-olympus-gold/15 bg-[linear-gradient(180deg,rgba(212,165,116,0.06),transparent)]">
        <button onClick={onClose} className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ChevronLeft size={11} /> builds</button>
        <Sparkles size={12} className="text-olympus-gold" />
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-olympus-gold">talent studio</span>
        <span className="text-[8px] font-mono text-olympus-text-dim hidden sm:inline">name a combination · fork a shelf preset · publish it</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => void exportTalent()} disabled={!name.trim()} className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded border border-olympus-gold/20 text-olympus-text-dim hover:text-olympus-gold disabled:opacity-40"><Copy size={10} /> export</button>
          <button onClick={clear} className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded border border-olympus-gold/10 text-olympus-text-dim hover:text-olympus-red"><Trash2 size={10} /> new</button>
          <button onClick={() => void save()} disabled={busy || !name.trim()} className="flex items-center gap-1 text-[9px] font-mono px-2.5 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/35 hover:bg-olympus-gold/25 disabled:opacity-40">
            {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} save talent
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto custom-scroll p-3 grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_300px] gap-3">
        {/* Identity */}
        <section className="rounded-xl border border-olympus-gold/15 bg-olympus-panel/50 p-3 flex flex-col gap-2.5 h-fit">
          <div className="flex flex-col items-center gap-1">
            <TalentSigil name={name || 'untitled'} god={god} size={168} />
            <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-olympus-text-dim">{god} · {power} points</span>
          </div>
          <label className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">talent name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Launch Architect" className={field} />
          <label className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">lead god</label>
          <select value={god} onChange={(e) => setGod(e.target.value)} className={field} aria-label="Lead god">
            {GODS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <label className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">task signature</label>
          <textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={3} placeholder="landing hero pricing auth migration…" className={cn(field, 'resize-none leading-relaxed')} />
          <div className="grid grid-cols-3 gap-1.5">
            {(['skills', 'mcps', 'demigods'] as Slot[]).map((slot) => {
              const [set] = sets[slot];
              return (
                <div key={slot} className="rounded-lg bg-olympus-bg/60 border border-olympus-gold/10 px-1.5 py-1 text-center">
                  <span className={cn('block text-[15px] font-mono font-bold', set.size >= SLOT_META[slot].cap ? 'text-olympus-green' : 'text-olympus-gold')}>{set.size}<span className="text-[9px] text-olympus-text-dim">/{SLOT_META[slot].cap}</span></span>
                  <span className="block text-[7px] font-mono uppercase text-olympus-text-dim">{SLOT_META[slot].label}</span>
                </div>
              );
            })}
          </div>
          {note && <p className="text-[8px] font-mono text-olympus-amber-soft">{note}</p>}
        </section>

        {/* Slots */}
        <section className="flex flex-col gap-2.5 min-w-0">
          {(['skills', 'mcps', 'demigods'] as Slot[]).map((slot) => {
            const [set] = sets[slot];
            return (
              <div key={slot} className="rounded-xl border border-olympus-gold/15 bg-olympus-panel/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('text-[9px] font-mono font-semibold uppercase tracking-[0.16em]', SLOT_META[slot].tone)}>{SLOT_META[slot].label}</span>
                  <span className="text-[8px] font-mono text-olympus-text-dim">{set.size}/{SLOT_META[slot].cap}</span>
                  <button onClick={() => { setPicker(slot); setQuery(''); }} className="ml-auto flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/25 hover:bg-olympus-gold/20"><Plus size={9} /> add</button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[34px]">
                  {[...set].map((v) => (
                    <button key={v} onClick={() => toggle(slot, v)} data-tip="Remove" className="group flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded-full bg-olympus-bg/70 border border-olympus-gold/20 text-olympus-text hover:border-olympus-red/50">
                      <span className="w-4 h-4 rounded-full bg-olympus-gold/10 text-olympus-gold text-[6px] flex items-center justify-center">{initials(v)}</span>
                      {v}
                      <X size={8} className="opacity-0 group-hover:opacity-100 text-olympus-red" />
                    </button>
                  ))}
                  {set.size === 0 && <span className="text-[9px] font-mono text-olympus-text-dim self-center">empty — add from the arsenal or fork a preset →</span>}
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-olympus-gold/10 bg-olympus-gradient p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-olympus-gold"><Sparkles size={10} /> how the brain uses it</div>
            <p className="text-[9px] font-mono text-olympus-text-dim leading-relaxed mt-1">
              A saved talent is a preference, not a promise: every dispatch still verifies its artifacts. Five wins at 80%+ promote the combination to a hot build; your edits teach the brain what fits your projects.
            </p>
          </div>
        </section>

        {/* Community shelf */}
        <aside className="rounded-xl border border-olympus-gold/15 bg-olympus-panel/50 p-3 h-fit">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.16em] text-olympus-green">community shelf</span>
            <span className="text-[8px] font-mono text-olympus-text-dim ml-auto">fork freely</span>
          </div>
          <div className="space-y-1.5 max-h-[62vh] overflow-auto custom-scroll pr-0.5">
            {TALENT_PRESETS.map((p) => (
              <button key={p.id} onClick={() => applyPreset(p)} className="w-full text-left rounded-lg border border-olympus-gold/10 bg-olympus-card/50 p-2 hover:border-olympus-gold/35 hover:-translate-y-0.5 transition-transform">
                <div className="flex items-center gap-2">
                  <TalentSigil name={p.name} god={p.god} size={34} animated={false} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono text-olympus-text truncate">{p.name}</div>
                    <div className="text-[8px] font-mono text-olympus-text-dim truncate">{p.god} · {p.skills.length + p.mcps.length + p.demigods.length} slots</div>
                  </div>
                  <Download size={9} className="text-olympus-gold/60 shrink-0" />
                </div>
                <p className="text-[8px] font-mono text-olympus-text-dim leading-relaxed mt-1 line-clamp-2">{p.note}</p>
              </button>
            ))}
          </div>
          <p className="text-[8px] font-mono text-olympus-text-dim leading-relaxed mt-2">
            The shelf is local and inspectable. Use <b className="text-olympus-gold">export</b> to share a talent as JSON; the community marketplace will consume this format.
          </p>
        </aside>
      </div>

      {/* Slot picker */}
      {picker && (
        <div className="absolute inset-0 z-30 bg-olympus-bg/97 flex flex-col" role="dialog" aria-modal="true" aria-label={`Search ${SLOT_META[picker].label}`}>
          <header className="flex items-center gap-2 px-3 py-2 border-b border-olympus-gold/15">
            <Search size={12} className="text-olympus-gold" />
            <span className={cn('text-[10px] font-mono font-semibold uppercase', SLOT_META[picker].tone)}>{SLOT_META[picker].label}</span>
            <span className="text-[8px] font-mono text-olympus-text-dim">{sets[picker][0].size}/{SLOT_META[picker].cap} equipped</span>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={SLOT_META[picker].placeholder} className={cn(field, 'ml-auto w-72')} />
            <button onClick={() => setPicker(null)} aria-label="Close search" className="text-olympus-text-dim hover:text-olympus-red"><X size={13} /></button>
          </header>
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-olympus-gold/10">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { toggle(picker, custom.trim().toLowerCase().replace(/\s+/g, '-')); setCustom(''); } }} placeholder="add your own (Enter)" className={cn(field, 'w-56')} />
            <button onClick={() => { if (custom.trim()) { toggle(picker, custom.trim().toLowerCase().replace(/\s+/g, '-')); setCustom(''); } }} className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/25"><Plus size={9} /> add</button>
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
