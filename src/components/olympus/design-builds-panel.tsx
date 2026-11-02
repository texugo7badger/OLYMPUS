/**
 * design-builds-panel.tsx — v0.0.32: the design build registry UI.
 *
 * Simple on the surface (a card per build), complex underneath: each card is
 * the loadout (god + demigods + skills + MCPs + verify) joined with the real
 * arsenal-resonance outcomes. Hot builds glow, warm builds carry the gold,
 * cold builds stay quiet. The user can copy a build prompt into any task or
 * create a new combination — the brain keeps learning from the outcomes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Flame, Loader2, Plus, Snowflake, Sparkles, Sun, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildPrompt, type DesignBuildWithStats } from '@/lib/design-builds';
import BuildTalentPage from './build-talent-page';

const TIER: Record<string, { label: string; className: string; Icon: any }> = {
  hot: { label: 'hot', className: 'border-olympus-green/45 text-olympus-green bg-olympus-green/10', Icon: Flame },
  warm: { label: 'warm', className: 'border-olympus-gold/45 text-olympus-gold bg-olympus-gold/10', Icon: Sun },
  cold: { label: 'cold', className: 'border-olympus-cyan/35 text-olympus-cyan bg-olympus-cyan/10', Icon: Snowflake },
};

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

export default function DesignBuildsPanel() {
  const [builds, setBuilds] = useState<DesignBuildWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [talentOpen, setTalentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: '', signature: '', god: 'athena', demigods: '', skills: '', mcps: '', note: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/olympus/design-builds', { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) { setBuilds(d.builds ?? []); setError(null); }
      else setError(d?.error ?? 'failed to load builds');
    } catch (e: any) {
      setError(e?.message || 'failed to load builds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    hot: builds.filter((b) => b.stats.tier === 'hot').length,
    warm: builds.filter((b) => b.stats.tier === 'warm').length,
    cold: builds.filter((b) => b.stats.tier === 'cold').length,
  }), [builds]);

  const copy = useCallback(async (build: DesignBuildWithStats) => {
    try {
      await navigator.clipboard.writeText(buildPrompt(build));
      setCopiedId(build.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { setError('clipboard blocked'); }
  }, []);

  const create = useCallback(async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch('/api/olympus/design-builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          signature: draft.signature,
          god: draft.god,
          demigods: draft.demigods.split(',').map((s) => s.trim()).filter(Boolean),
          skills: draft.skills.split(',').map((s) => s.trim()).filter(Boolean),
          mcps: draft.mcps.split(',').map((s) => s.trim()).filter(Boolean),
          note: draft.note,
        }),
      });
      const d = await r.json();
      if (d?.ok) {
        setDraft({ name: '', signature: '', god: 'athena', demigods: '', skills: '', mcps: '', note: '' });
        setShowForm(false);
        await load();
      } else setError(d?.error ?? 'save failed');
    } catch (e: any) {
      setError(e?.message || 'save failed');
    } finally {
      setSaving(false);
    }
  }, [draft, saving, load]);

  const field = 'w-full bg-olympus-bg border border-olympus-gold/20 rounded px-2 py-1 text-[10px] font-mono text-olympus-text placeholder:text-[#5A5A5A] outline-none focus:border-olympus-gold/50';

  if (talentOpen) {
    return <BuildTalentPage onClose={() => setTalentOpen(false)} onCreated={() => { void load(); }} />;
  }

  return (
    <div className="absolute inset-0 overflow-auto custom-scroll p-3">
      <header className="flex items-center gap-2 mb-2">
        <Sparkles size={12} className="text-olympus-gold" />
        <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">design builds</span>
        <span className="text-[8px] font-mono text-olympus-text-dim">
          {counts.hot} hot · {counts.warm} warm · {counts.cold} cold — learned from the arsenal-resonance log
        </span>
        <button
          onClick={() => setTalentOpen(true)}
          className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-purple/15 text-olympus-purple ring-1 ring-olympus-purple/30 hover:bg-olympus-purple/25"
        >
          <Sparkles size={10} /> talent editor
        </button>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25"
        >
          {showForm ? <X size={10} /> : <Plus size={10} />} {showForm ? 'cancel' : 'new build'}
        </button>
        <button onClick={() => void load()} aria-label="Refresh builds" className="text-olympus-text-dim hover:text-olympus-gold">
          <Loader2 size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {showForm && (
        <div className="mb-3 rounded border border-olympus-gold/20 bg-olympus-panel/60 p-2.5 grid gap-1.5 sm:grid-cols-2">
          <input className={field} placeholder="name — e.g. Pricing page" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className={field} placeholder="task keywords — pricing plans comparison" value={draft.signature} onChange={(e) => setDraft({ ...draft, signature: e.target.value })} />
          <select className={field} value={draft.god} onChange={(e) => setDraft({ ...draft, god: e.target.value })} aria-label="god">
            {GODS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input className={field} placeholder="demigods — ui-designer, a11y-auditor" value={draft.demigods} onChange={(e) => setDraft({ ...draft, demigods: e.target.value })} />
          <input className={field} placeholder="skills — frontend-design, color-expert" value={draft.skills} onChange={(e) => setDraft({ ...draft, skills: e.target.value })} />
          <input className={field} placeholder="mcps — originkit, context7" value={draft.mcps} onChange={(e) => setDraft({ ...draft, mcps: e.target.value })} />
          <input className={cn(field, 'sm:col-span-2')} placeholder="why this combination" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <button
            onClick={() => void create()}
            disabled={saving || !draft.name.trim()}
            className="sm:col-span-2 flex items-center justify-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25 disabled:opacity-40"
          >
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} add build
          </button>
        </div>
      )}

      {error && <p className="text-[9px] font-mono text-olympus-red mb-2">{error}</p>}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {builds.map((b) => {
          const tier = TIER[b.stats.tier] ?? TIER.cold;
          const Icon = tier.Icon;
          return (
            <article
              key={b.id}
              className={cn(
                'rounded-lg border bg-olympus-panel/60 p-2.5 transition-all hover:-translate-y-0.5',
                b.stats.tier === 'hot' ? 'border-olympus-green/35 shadow-[0_0_18px_rgba(123,174,142,0.08)]'
                  : b.stats.tier === 'warm' ? 'border-olympus-gold/25'
                  : 'border-olympus-gold/10',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-semibold text-olympus-text truncate">{b.name}</span>
                {b.source === 'user' && <span className="text-[8px] font-mono text-olympus-purple uppercase">yours</span>}
                <span className={cn('ml-auto flex items-center gap-1 text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border', tier.className)}>
                  <Icon size={9} className={b.stats.tier === 'hot' ? 'animate-pulse' : ''} /> {tier.label}
                </span>
              </div>
              <div className="mt-1 text-[8px] font-mono text-olympus-text-dim">
                {b.god} · {b.stats.samples} sample{b.stats.samples === 1 ? '' : 's'} · {(b.stats.rate * 100).toFixed(0)}% smoothed
                {b.stats.lastUsed ? ` · last ${b.stats.lastUsed.slice(0, 10)}` : ''}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {[...b.skills, ...b.mcps, ...b.demigods].slice(0, 9).map((chip) => (
                  <span key={chip} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-bg/60 border border-olympus-gold/10 text-olympus-text-dim">{chip}</span>
                ))}
              </div>
              {b.note && <p className="mt-1.5 text-[8px] font-mono text-olympus-text-dim/80 leading-relaxed line-clamp-2">{b.note}</p>}
              <button
                onClick={() => void copy(b)}
                className="mt-2 flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20"
              >
                {copiedId === b.id ? <Check size={9} /> : <Copy size={9} />} {copiedId === b.id ? 'copied' : 'copy build prompt'}
              </button>
            </article>
          );
        })}
      </div>
      {builds.length === 0 && !loading && (
        <p className="text-center py-10 text-[10px] font-mono text-olympus-text-dim">no builds yet — create the first combination</p>
      )}
    </div>
  );
}
