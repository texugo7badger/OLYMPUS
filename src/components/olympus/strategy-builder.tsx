'use client';

/**
 * StrategyBuilder — the interactive strategy screen (v0.0.23).
 *
 * The user picks a model per god from the models REGISTERED IN OPENCODE
 * (GET /api/olympus/models). One search box filters by id, display name or
 * provider; the per-god rows show context, output and price; a fit hint
 * suggests the role each model suits. Save & apply posts to
 * /api/olympus/strategy/custom, which validates and applies the config.
 *
 * Design: Olympus palette, mono 10-11px, one gold accent, no glow.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useEffect, useMemo, useState } from 'react';
import { Search, X, Check, Loader2, Cpu, DollarSign } from 'lucide-react';
import { GOD_IDS, GOD_ICONS } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';

interface ModelEntry {
  id: string;
  provider: string;
  name: string;
  context: number | null;
  output: number | null;
  inputCost: number | null;
  outputCost: number | null;
  free: boolean;
  fits: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Starting map (e.g. the active strategy's roster). */
  initial?: Record<string, string>;
  onApplied?: (strategy: string) => void;
}

const GOD_LABEL: Record<string, string> = {
  apollo: 'Planner', atlas: 'Orchestrator', hephaestus: 'Backend', athena: 'Frontend',
  artemis: 'Security', dionysus: 'QA', hermes: 'Integrations', persephone: 'Database',
  prometheus: 'DevOps', callimachus: 'Vault',
};

function compact(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function price(m: ModelEntry): string {
  if (m.free) return 'free';
  if (m.inputCost == null && m.outputCost == null) return '—';
  return `$${m.inputCost ?? 0}/$${m.outputCost ?? 0}`;
}

export default function StrategyBuilder({ open, onClose, initial, onApplied }: Props) {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('My strategy');
  const [query, setQuery] = useState('');
  const [activeGod, setActiveGod] = useState<string>('apollo');
  const [gods, setGods] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/olympus/models', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setModels(Array.isArray(d?.models) ? d.models : []))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
    if (initial && Object.keys(initial).length === 10) setGods(initial);
  }, [open, initial]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
  }, [models, query]);

  const activeModel = gods[activeGod] ?? '';
  const lanes = new Set(Object.values(gods).filter(Boolean));
  const estimated = useMemo(() => {
    let input = 0, output = 0;
    for (const id of lanes) {
      const m = models.find((x) => x.id === id);
      input += m?.inputCost ?? 0;
      output += m?.outputCost ?? 0;
    }
    return `${lanes.size} lane(s) · $${input.toFixed(2)}/$${output.toFixed(2)} per 1M`;
  }, [lanes, models]);

  if (!open) return null;

  const assign = (id: string) => setGods((g) => ({ ...g, [activeGod]: id }));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const r = await fetch('/api/olympus/strategy/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gods }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      onApplied?.(d.strategy);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-md border border-olympus-gold/20 bg-olympus-bg shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-olympus-gold/10 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Cpu size={13} className="text-olympus-gold" />
            <span className="text-[11px] font-mono text-olympus-text">Strategy Builder</span>
            <span className="text-[9px] font-mono text-olympus-text-dim">pick a model per god — from the providers registered in OpenCode</span>
          </div>
          <button onClick={onClose} className="text-olympus-text-dim hover:text-olympus-text"><X size={14} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left: gods */}
          <div className="w-64 shrink-0 border-r border-olympus-gold/10 overflow-y-auto">
            <div className="px-3 py-2 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wider">Gods</div>
            {GOD_IDS.map((god) => {
              const Icon = GOD_ICONS[god];
              const model = gods[god];
              return (
                <button
                  key={god}
                  onClick={() => { setActiveGod(god); setQuery(''); }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 flex items-center gap-2 border-l-2 transition-colors',
                    activeGod === god ? 'border-olympus-gold bg-olympus-gold/5' : 'border-transparent hover:bg-white/[0.02]',
                  )}
                >
                  {Icon && <Icon size={11} className="text-olympus-gold/70 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-mono text-olympus-text capitalize">{god}</span>
                    <span className="block text-[8.5px] font-mono text-olympus-text-dim truncate">{model || GOD_LABEL[god]}</span>
                  </span>
                  {model && <Check size={9} className="text-olympus-green shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Right: search + list */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-olympus-gold/10 px-3 py-2">
              <Search size={11} className="text-olympus-text-dim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`search a model for ${activeGod} — name, provider, id…`}
                className="flex-1 bg-transparent text-[10px] font-mono text-olympus-text placeholder:text-olympus-text-dim/60 outline-none"
                autoFocus
              />
              {loading && <Loader2 size={11} className="animate-spin text-olympus-gold" />}
              <span className="text-[9px] font-mono text-olympus-text-dim">{filtered.length}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/[0.03]">
              {filtered.map((m) => {
                const selected = activeModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => assign(m.id)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/[0.02] transition-colors',
                      selected && 'bg-olympus-gold/5',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-mono text-olympus-text truncate">{m.id}</span>
                      <span className="block text-[8.5px] font-mono text-olympus-text-dim truncate">
                        {m.name} · ctx {compact(m.context)} · out {compact(m.output)} · {m.fits.join(' / ')}
                      </span>
                    </span>
                    <span className={cn('text-[8.5px] font-mono shrink-0', m.free ? 'text-olympus-green' : 'text-olympus-text-dim')}>
                      {price(m)}
                    </span>
                    {selected && <Check size={10} className="text-olympus-green shrink-0" />}
                  </button>
                );
              })}
              {!filtered.length && !loading && (
                <div className="px-3 py-6 text-center text-[10px] font-mono text-olympus-text-dim">
                  No model matches “{query}”. Register the provider in OpenCode first, then reopen.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-olympus-gold/10 px-4 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-olympus-text-dim uppercase">name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-olympus-card/40 border border-olympus-gold/15 rounded px-2 py-1 text-[10px] font-mono text-olympus-text outline-none focus:border-olympus-gold/40"
            />
            <span className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim">
              <DollarSign size={9} /> {estimated}
            </span>
            <button
              onClick={save}
              disabled={saving || Object.keys(gods).length < 10}
              className="flex items-center gap-1 rounded border border-olympus-gold/30 bg-olympus-gold/10 px-2.5 py-1 text-[10px] font-mono text-olympus-gold hover:bg-olympus-gold/20 disabled:opacity-40"
            >
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              Save & apply
            </button>
          </div>
          {error && <div className="text-[9.5px] font-mono text-olympus-red">{error}</div>}
          {Object.keys(gods).length < 10 && (
            <div className="text-[9px] font-mono text-olympus-text-dim">
              {10 - Object.keys(gods).length} god(s) still need a model.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
