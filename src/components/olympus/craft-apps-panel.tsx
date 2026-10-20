/**
 * craft-apps-panel.tsx — W-G CRAFT-EMBED (v0.0.7): the thirteen ArtCraft
 * Crafting Apps (Apache-2.0, github.com/storytold/*) INSIDE OLYMPUS — a
 * grid of the apps, each click embedding the live web build in the panel
 * (the Live Preview pattern). The probe layer is the truth: a
 * frame-blocking upstream honestly falls back to the external-open chip,
 * never a dead frame. The STUDIO rides the same surface (the asset
 * sheet's artcraft button lands here).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Boxes, ExternalLink, RefreshCw, X, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CraftApp {
  id: string;
  name: string;
  category: string;
  status: string;
  url: string;
  repo: string;
  license: string;
}

interface Probe {
  id: string;
  url: string;
  ok: boolean;
  frameable: boolean;
  httpStatus: number | null;
  note?: string;
}

type View = { kind: 'grid' } | { kind: 'app'; app: CraftApp; probe: Probe | null };

export default function CraftAppsPanel({ initialApp }: { initialApp?: string | null }) {
  const [apps, setApps] = useState<CraftApp[]>([]);
  const [studio, setStudio] = useState<CraftApp | null>(null);
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: 'grid' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/olympus/craft-apps', { cache: 'no-store' });
      const d = await r.json();
      setApps(d.apps || []);
      setStudio(d.studio || null);
      const map: Record<string, Probe> = {};
      for (const p of d.probes || []) map[new URL(p.url).pathname.split('/').filter(Boolean).pop() || p.url] = p;
      setProbes(map);
    } catch { /* the honest empty grid */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The asset sheet's artcraft button opens the STUDIO here directly.
  useEffect(() => {
    if (!initialApp) return;
    (async () => {
      const r = await fetch(`/api/olympus/craft-apps?app=${encodeURIComponent(initialApp)}`, { cache: 'no-store' }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      if (d?.ok && d.probe) {
        const target: CraftApp = initialApp === 'artcraft-studio'
          ? { id: 'artcraft-studio', name: 'ArtCraft Studio', category: 'AI image & video crafting', status: 'Live', url: d.probe.url, repo: 'storytold/artcraft', license: 'MIT / Apache-2.0' }
          : apps.find((a) => a.id === initialApp) ?? { id: initialApp, name: initialApp, category: '', status: '', url: d.probe.url, repo: '', license: '' };
        setView({ kind: 'app', app: target, probe: d.probe });
      }
    })();
  }, [initialApp]);

  const openApp = async (app: CraftApp) => {
    setView({ kind: 'app', app, probe: null });
    const r = await fetch(`/api/olympus/craft-apps?app=${encodeURIComponent(app.id)}`, { cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    if (d?.ok && d.probe) setView((v) => (v.kind === 'app' && v.app.id === app.id ? { kind: 'app', app, probe: d.probe } : v));
  };

  const probeFor = (id: string, url: string): Probe | null => {
    const key = new URL(url).pathname.split('/').filter(Boolean).pop() || url;
    return probes[key] ?? probes[id] ?? null;
  };

  const letterMark = (name: string) => name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();

  return (
    <div className="w-full h-full flex flex-col bg-olympus-bg">
      {/* Header */}
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-olympus-gold/10 bg-olympus-panel">
        <Boxes size={13} className="text-olympus-gold" />
        <span className="text-[11px] font-mono font-semibold text-olympus-gold">Craft Apps</span>
        <span className="text-[9px] text-olympus-text-dim font-mono ml-1">13 open-source apps · inside OLYMPUS</span>
        <div className="ml-auto flex items-center gap-1.5">
          {view.kind === 'app' && (
            <button onClick={() => setView({ kind: 'grid' })} className="flex items-center gap-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold px-1.5 py-1 rounded hover:bg-olympus-gold/10">
              <ChevronLeft size={11} /> grid
            </button>
          )}
          <button onClick={load} aria-label="Refresh probes" className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {view.kind === 'grid' ? (
          <div className="absolute inset-0 overflow-y-auto custom-scroll p-3">
            {loading && apps.length === 0 && (
              <div className="text-center py-10 text-olympus-text-dim text-xs font-mono">
                <RefreshCw size={14} className="animate-spin inline mr-2" />probing the apps…
              </div>
            )}
            {/* The STUDIO card first — the AI crafting engine. */}
            {studio && (
              <button
                onClick={() => openApp(studio)}
                className="w-full mb-3 rounded-lg p-3 flex items-center gap-3 bg-olympus-card border border-olympus-gold/25 ring-1 ring-olympus-gold/15 hover:border-olympus-gold/50 transition-colors text-left"
              >
                <span className="w-10 h-10 rounded-lg bg-olympus-gold/15 ring-1 ring-olympus-gold/30 flex items-center justify-center text-olympus-gold font-mono font-bold text-[13px] shrink-0">AC</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-mono font-semibold text-olympus-gold">{studio.name}</span>
                  <span className="block text-[9px] font-mono text-olympus-text-dim truncate">{studio.category} · {studio.license} · {studio.repo}</span>
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-green/15 text-olympus-green ring-1 ring-olympus-green/25 shrink-0">live</span>
              </button>
            )}
            {/* The 13 apps grid */}
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
              {apps.map((a) => {
                const p = probeFor(a.id, a.url);
                return (
                  <button
                    key={a.id}
                    onClick={() => openApp(a)}
                    className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 hover:border-olympus-gold/40 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-md bg-olympus-cyan/10 ring-1 ring-olympus-cyan/25 flex items-center justify-center text-olympus-cyan font-mono font-bold text-[11px] shrink-0">{letterMark(a.name)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-mono font-semibold text-olympus-text truncate group-hover:text-olympus-gold">{a.name}</span>
                        <span className="block text-[8px] font-mono text-olympus-text-dim truncate">{a.category}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={cn('text-[8px] font-mono px-1 py-px rounded ring-1 shrink-0',
                        p?.frameable ? 'bg-olympus-green/10 text-olympus-green ring-olympus-green/25'
                        : p?.ok ? 'bg-olympus-amber-soft/10 text-olympus-amber-soft ring-olympus-amber-soft/25'
                        : 'bg-olympus-red/10 text-olympus-red ring-olympus-red/25')}>
                        {p?.frameable ? 'embeddable' : p?.ok ? 'external only' : 'offline'}
                      </span>
                      <span className="text-[8px] font-mono text-[#5A5A5A] truncate">{a.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] font-mono text-[#5A5A5A] mt-3 leading-relaxed">
              All apps are Apache-2.0 (github.com/storytold/*) — the panel embeds their live web builds; probes refresh every open. The agents drive the locally-installed apps via their CLI/JSON control channel (docs/research/craft-apps.md).
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col">
            {/* The app bar */}
            <div className="h-8 shrink-0 flex items-center gap-2 px-3 border-b border-olympus-gold/10 bg-olympus-panel/80">
              <span className="text-[10px] font-mono font-semibold text-olympus-gold truncate">{view.app.name}</span>
              <span className="text-[8px] font-mono text-olympus-text-dim truncate hidden md:block">{view.app.category} · {view.app.license}</span>
              {view.probe && !view.probe.frameable && view.probe.ok && (
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-amber-soft/10 text-olympus-amber-soft ring-1 ring-olympus-amber-soft/25">
                  {view.probe.note ?? 'the upstream blocks embedding'}
                </span>
              )}
              <a href={view.app.url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold px-1.5">
                <ExternalLink size={10} /> open externally
              </a>
            </div>
            {/* The embed — or the honest non-frameable fallback */}
            {view.probe === null ? (
              <div className="flex-1 flex items-center justify-center text-olympus-text-dim text-xs font-mono">
                <RefreshCw size={13} className="animate-spin mr-2" />probing {view.app.name}…
              </div>
            ) : view.probe.frameable ? (
              <iframe
                src={view.app.url}
                className="flex-1 w-full bg-white"
                title={view.app.name}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
                <X size={22} className="text-olympus-amber-soft/60" />
                <p className="text-olympus-text text-xs font-mono">{view.app.name} {view.probe.ok ? 'blocks embedding (an upstream frame policy)' : 'is unreachable right now'}</p>
                <p className="text-olympus-text-dim text-[10px] font-mono max-w-md">
                  The app stays in the catalog — open it externally with one click, or install it locally
                  (the craft-launcher) and the agents drive it via the CLI/JSON control channel.
                </p>
                <a href={view.app.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-mono px-2.5 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25">
                  <ExternalLink size={10} /> open {view.app.name} externally
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
