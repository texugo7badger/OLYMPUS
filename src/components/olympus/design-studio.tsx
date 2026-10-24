/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Palette, Sparkles, Box, Check, Loader2, X, ExternalLink, Save, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DesignStudio — Athena's design decision surface (#208).
 *
 * At design decision moments Athena PROPOSES: reference cards (OriginKit /
 * UX patterns), visual palettes, and logo concepts (SVG + 3D preview).
 * Everything is in the user's control; a chosen proposal is SAVED to the
 * project record (design-decisions.jsonl) and re-renders in later sessions.
 */

interface ReferenceCard {
  id: string; title: string; source: string; url: string;
  pattern: string; description: string; tags: string[]; accent: string;
}
interface PaletteOption {
  id: string; name: string; mood: string;
  colors: Array<{ role: string; hex: string }>;
}
interface LogoConcept {
  id: string; name: string; style: string; monogram: string; paletteId: string;
}
interface SavedDecision {
  ts: string; project: string; kind: string; decision: any;
}

interface DesignStudioProps {
  open: boolean;
  project?: { slug: string; name?: string } | null;
  conversationId: string;
  /** The turn text — filters the reference cards toward the task. */
  query?: string;
  onClose: () => void;
  /** Called after a decision is persisted (the chat appends the record). */
  onSaved?: (record: SavedDecision) => void;
}

type Tab = 'references' | 'palettes' | 'logos';

export default function DesignStudio({ open, project, conversationId, query, onClose, onSaved }: DesignStudioProps) {
  const [tab, setTab] = useState<Tab>('references');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<ReferenceCard[]>([]);
  const [palettes, setPalettes] = useState<PaletteOption[]>([]);
  const [logos, setLogos] = useState<LogoConcept[]>([]);
  const [saved, setSaved] = useState<SavedDecision[]>([]);
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [pickedPalette, setPickedPalette] = useState<string | null>(null);
  const [pickedLogo, setPickedLogo] = useState<string | null>(null);
  const [logo3d, setLogo3d] = useState(true);
  const projectSlug = project?.slug ?? null;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (projectSlug) qs.set('project', projectSlug);
      if (query) qs.set('query', query);
      const r = await fetch(`/api/olympus/design-studio?${qs.toString()}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setReferences(d.references || []);
      setPalettes(d.palettes || []);
      setLogos(d.logos || []);
      setSaved(d.saved || []);
      // Default the selection to the first option of each tab so a single
      // click can save — the user can override freely.
      setPickedRef((prev) => prev ?? d.references?.[0]?.id ?? null);
      setPickedPalette((prev) => prev ?? d.palettes?.[0]?.id ?? null);
      setPickedLogo((prev) => prev ?? d.logos?.[0]?.id ?? null);
    } catch (e: any) {
      setError(e?.message || 'failed to load proposals');
    } finally {
      setLoading(false);
    }
  }, [projectSlug, query]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const paletteById = useMemo(() => new Map(palettes.map((p) => [p.id, p])), [palettes]);
  const pickedPaletteObj = pickedPalette ? paletteById.get(pickedPalette) : undefined;
  const pickedLogoObj = pickedLogo ? logos.find((l) => l.id === pickedLogo) : undefined;
  const pickedRefObj = pickedRef ? references.find((r) => r.id === pickedRef) : undefined;

  const save = useCallback(async () => {
    if (!projectSlug) { setError('Select an active project first — decisions are saved to the project record.'); return; }
    const kind: 'palette' | 'reference' | 'logo' | 'combo' =
      tab === 'references' ? 'reference' : tab === 'palettes' ? 'palette' : 'logo';
    const decision =
      kind === 'reference' ? pickedRefObj
      : kind === 'palette' ? pickedPaletteObj
      : pickedLogoObj;
    if (!decision) { setError('Pick a proposal first.'); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/olympus/design-studio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectSlug, conversationId, kind, decision }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setSaved((prev) => [...prev, d.saved].slice(-20));
      onSaved?.(d.saved);
    } catch (e: any) {
      setError(e?.message || 'save failed');
    } finally {
      setSaving(false);
    }
  }, [projectSlug, tab, pickedRefObj, pickedPaletteObj, pickedLogoObj, conversationId, onSaved]);

  if (!open) return null;

  const tabBtn = (id: Tab, label: string, Icon: typeof Palette) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono transition-colors',
        tab === id ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30' : 'text-olympus-text-dim hover:text-olympus-text',
      )}
    >
      <Icon size={11} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[82vh] flex flex-col rounded-xl border border-olympus-gold/25 bg-olympus-panel shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-olympus-gold/15">
          <Sparkles size={13} className="text-olympus-gold" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-mono font-semibold text-olympus-gold">Athena · Design Studio</div>
            <div className="text-[9px] font-mono text-olympus-text-dim truncate">
              {projectSlug ? `saving to ${projectSlug}/design-decisions.jsonl` : 'no active project — selections cannot be saved'}
            </div>
          </div>
          <button onClick={onClose} className="text-olympus-text-dim hover:text-olympus-text p-1" data-tip="Close">
            <X size={13} />
          </button>
        </div>

        <div className="flex items-center gap-1 px-3 py-2 border-b border-olympus-gold/10">
          {tabBtn('references', 'References', ExternalLink)}
          {tabBtn('palettes', 'Palettes', Palette)}
          {tabBtn('logos', 'Logo', Type)}
          <div className="flex-1" />
          {tab === 'logos' && (
            <button
              onClick={() => setLogo3d((v) => !v)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border transition-colors',
                logo3d ? 'border-olympus-cyan/40 text-olympus-cyan' : 'border-olympus-gold/20 text-olympus-text-dim',
              )}
            >
              <Box size={10} /> 3D
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-olympus-text-dim py-6 justify-center">
              <Loader2 size={12} className="animate-spin" /> loading Athena's proposals…
            </div>
          )}
          {error && <div className="text-[10px] font-mono text-olympus-red py-2">{error}</div>}

          {!loading && tab === 'references' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {references.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setPickedRef(r.id)}
                  className={cn(
                    'text-left rounded-lg border p-2.5 transition-all group',
                    pickedRef === r.id
                      ? 'border-olympus-gold/50 bg-olympus-gold/5 ring-1 ring-olympus-gold/30'
                      : 'border-olympus-gold/10 bg-olympus-card/40 hover:border-olympus-gold/25',
                  )}
                >
                  <div className="h-14 rounded-md mb-2 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${r.accent}22, ${r.accent}05 60%, transparent)` }}>
                    <div className="absolute inset-2 rounded border border-white/10" style={{ background: `linear-gradient(120deg, ${r.accent}30, transparent)` }} />
                    <div className="absolute left-3 top-2.5 h-1.5 w-10 rounded-full" style={{ background: r.accent }} />
                    <div className="absolute left-3 top-5 h-1 w-16 rounded-full bg-white/20" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-semibold text-olympus-text">{r.title}</span>
                    {pickedRef === r.id && <Check size={10} className="text-olympus-gold" />}
                  </div>
                  <div className="text-[8px] font-mono text-olympus-text-dim mt-0.5">{r.source} · {r.pattern}</div>
                  <div className="text-[9px] font-mono text-olympus-text/80 mt-1 leading-relaxed line-clamp-3">{r.description}</div>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {r.tags.slice(0, 4).map((t) => (
                      <span key={t} className="text-[7px] font-mono px-1 py-0.5 rounded bg-olympus-bg/60 text-olympus-text-dim">{t}</span>
                    ))}
                    <a
                      href={r.url} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto text-[8px] font-mono text-olympus-cyan hover:underline flex items-center gap-0.5"
                    >
                      open <ExternalLink size={8} />
                    </a>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && tab === 'palettes' && (
            <div className="flex flex-col gap-2">
              {palettes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPickedPalette(p.id)}
                  className={cn(
                    'text-left rounded-lg border p-2.5 transition-all',
                    pickedPalette === p.id
                      ? 'border-olympus-gold/50 bg-olympus-gold/5 ring-1 ring-olympus-gold/30'
                      : 'border-olympus-gold/10 bg-olympus-card/40 hover:border-olympus-gold/25',
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-mono font-semibold text-olympus-text">{p.name}</span>
                    <span className="text-[8px] font-mono text-olympus-text-dim">{p.mood}</span>
                    {pickedPalette === p.id && <Check size={10} className="text-olympus-gold ml-auto" />}
                  </div>
                  <div className="flex rounded-md overflow-hidden h-10 border border-black/20">
                    {p.colors.map((c) => (
                      <div key={c.role} className="flex-1 relative group/sw" style={{ background: c.hex }} data-tip={`${c.role} · ${c.hex}`}>
                        <span className="absolute inset-x-0 bottom-0 text-[6px] font-mono text-center opacity-0 group-hover/sw:opacity-100 bg-black/50 text-white">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {p.colors.map((c) => (
                      <span key={c.role} className="text-[7px] font-mono text-olympus-text-dim">{c.role}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && tab === 'logos' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {logos.map((l) => {
                const pal = paletteById.get(l.paletteId) || palettes[0];
                const bg = pal?.colors.find((c) => c.role === 'bg')?.hex || '#0B0B10';
                const accent = pal?.colors.find((c) => c.role === 'accent')?.hex || '#8B7CF6';
                const accent2 = pal?.colors.find((c) => c.role === 'accent-2')?.hex || '#5FB0B8';
                return (
                  <button
                    key={l.id}
                    onClick={() => setPickedLogo(l.id)}
                    className={cn(
                      'rounded-lg border p-2.5 transition-all text-left',
                      pickedLogo === l.id
                        ? 'border-olympus-gold/50 bg-olympus-gold/5 ring-1 ring-olympus-gold/30'
                        : 'border-olympus-gold/10 bg-olympus-card/40 hover:border-olympus-gold/25',
                    )}
                  >
                    <div
                      className="h-24 rounded-md mb-2 flex items-center justify-center border border-white/5"
                      style={{ background: bg, perspective: '600px' }}
                    >
                      <div
                        className="transition-transform duration-500 ease-out"
                        style={{
                          transform: logo3d ? 'rotateY(18deg) rotateX(6deg)' : 'none',
                          transformStyle: 'preserve-3d',
                        }}
                      >
                        <svg width="72" height="72" viewBox="0 0 72 72" aria-label={`${l.name} logo preview`}>
                          {l.id === 'logo-orbit' && (
                            <ellipse cx="36" cy="36" rx="30" ry="14" fill="none" stroke={accent2} strokeWidth="1.5" opacity="0.8" transform="rotate(-24 36 36)" />
                          )}
                          <rect x="14" y="14" width="44" height="44" rx={l.id === 'logo-split' ? 2 : 10} fill={accent} opacity={l.id === 'logo-split' ? 0.14 : 0.9} />
                          <text
                            x="36" y="45" textAnchor="middle"
                            fontFamily="ui-monospace, SFMono-Regular, monospace"
                            fontSize="24" fontWeight="700"
                            fill={l.id === 'logo-split' ? accent : bg}
                          >
                            {l.monogram}
                          </text>
                        </svg>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono font-semibold text-olympus-text">{l.name}</span>
                      {pickedLogo === l.id && <Check size={10} className="text-olympus-gold ml-auto" />}
                    </div>
                    <div className="text-[8px] font-mono text-olympus-text-dim mt-0.5">{l.style}</div>
                  </button>
                );
              })}
            </div>
          )}

          {saved.length > 0 && (
            <div className="mt-3 border-t border-olympus-gold/10 pt-2">
              <div className="text-[8px] font-mono text-olympus-text-dim mb-1">SAVED DECISIONS (this project)</div>
              <div className="flex flex-col gap-1">
                {saved.slice(-5).reverse().map((s, i) => (
                  <div key={`${s.ts}-${i}`} className="text-[8px] font-mono text-olympus-text/80 flex items-center gap-1.5">
                    <span className="text-olympus-gold/70">{s.kind}</span>
                    <span className="truncate">{s.decision?.name || s.decision?.title || s.decision?.id}</span>
                    <span className="text-olympus-text-dim ml-auto shrink-0">{new Date(s.ts).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border-t border-olympus-gold/15">
          <div className="text-[8px] font-mono text-olympus-text-dim flex-1">
            {pickedPaletteObj ? `palette: ${pickedPaletteObj.name}` : 'no palette selected'}
          </div>
          <button
            onClick={save}
            disabled={saving || !projectSlug}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-mono transition-colors',
              saving || !projectSlug
                ? 'bg-olympus-card/50 text-olympus-text-dim cursor-not-allowed'
                : 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25',
            )}
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save to project
          </button>
        </div>
      </div>
    </div>
  );
}
