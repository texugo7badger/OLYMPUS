/**
 * atelier-panel.tsx — #152 ATELIER-UI-1 (v0.0.5): the Atelier tab — the
 * Media Vault gallery. Drop ANY AI image (or your own) → Argos describes +
 * tags it; generate via the free Pollinations lane; search the vault.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Palette, Search, Sparkles, Upload, Image as ImageIcon, Tag, X, Loader2, PenTool, ExternalLink, Box } from 'lucide-react';
import Forge2D from './forge-2d';
import Forge3D from './forge-3d';
import { cn } from '@/lib/utils';

interface Asset {
  id: string;
  mime: string;
  size: number;
  createdAt: string;
  description?: string;
  tags?: string[];
  dominantColors?: string[];
  suggestedUse?: string;
  source?: string;
}

export default function AtelierPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [forging, setForging] = useState<string | null>(null);
  // #163 FORGE-3D: the GLB viewport (the t2-3D lane's output viewer).
  const [viewing3d, setViewing3d] = useState<{ src: string; label: string } | null>(null);
  const open3d = (a: Asset) => {
    // GLB/GLTF assets open the viewport; images fall back to a 2D look.
    const src = `/api/olympus/atelier/assets?id=${a.id}`;
    setViewing3d({ src, label: a.description?.slice(0, 60) ?? a.id });
  };
  // #154: the ArtCraft deeplink (web fallback carries Linux until desktop
  // binaries ship — the detector decides at click time).
  const openInArtcraft = async (id: string) => {
    try {
      const r = await fetch('/api/olympus/atelier/deeplink', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'artcraft', assetId: id }),
      }).then((x) => x.json());
      if (r?.result === 'web' && r.url) { window.open(r.url, '_blank'); flash(`ArtCraft web studio opened — the asset is in your vault path`); }
      else if (r?.result === 'spawned') flash(`ArtCraft launched with the asset`);
      else flash(`ArtCraft not detected: ${r?.hint ?? 'install it or use the web lane'}`);
    } catch (e: any) { flash(`DEEPLINK FAILED: ${e?.message || e}`); }
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q?: string) => {
    try {
      const r = await fetch(`/api/olympus/atelier/assets${q ? `?q=${encodeURIComponent(q)}` : '?limit=200'}`, { cache: 'no-store' });
      const d = await r.json();
      setAssets(Array.isArray(d?.assets) ? d.assets : []);
    } catch { setAssets([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4200); };

  /** Drop ANY image → the vault + the Argos describe. */
  const ingest = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      setBusy(`upload ${f.name}`);
      try {
        const fd = new FormData();
        fd.append('image', f);
        fd.append('source', f.name.match(/midjourney|dalle|firefly|flux|stable/i)?.[0]?.toLowerCase() ?? 'user');
        const up = await fetch('/api/olympus/atelier/upload', { method: 'POST', body: fd }).then((r) => r.json());
        if (!up?.ok) throw new Error(up?.error || 'upload failed');
        flash(`vaulted ${f.name} — Argos is looking…`);
        const desc = await fetch('/api/olympus/atelier/describe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: up.asset.id }),
        }).then((r) => r.json());
        if (desc?.ok) flash(`Argos: "${(desc.asset.description || '').slice(0, 80)}…"`);
        else flash(`vaulted, but Argus could not describe (${desc?.error || 'unknown'})`);
      } catch (e: any) { flash(`FAILED: ${e?.message || e}`); }
      finally { setBusy(null); load(query); }
    }
  };

  /** The free generation lane. */
  const generate = async () => {
    if (!genPrompt.trim()) return;
    setBusy('generate');
    try {
      const r = await fetch('/api/olympus/atelier/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: genPrompt.trim(), width: 768, height: 768 }),
      }).then((r) => r.json());
      if (!r?.ok) throw new Error(r?.error || 'generation failed');
      flash(`Pygmalion (free lane): ${r.model} — in the vault`);
      // Give the new asset the Argos pass too (the full loop).
      void fetch('/api/olympus/atelier/describe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.asset.id }),
      }).then(() => load(query));
    } catch (e: any) { flash(`GEN FAILED: ${e?.message || e}`); }
    finally { setBusy(null); }
  };

  return (
    <div
      className="h-full overflow-y-auto overscroll-contain custom-scroll bg-olympus-bg p-4"
      onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => { e.preventDefault(); setDropping(false); if (e.dataTransfer?.files?.length) ingest(e.dataTransfer.files); }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Palette size={16} className="text-olympus-gold" />
        <h2 className="text-sm font-semibold text-olympus-gold">Atelier</h2>
        <span className="text-[9px] text-olympus-text-dim font-mono ml-auto">{assets.length} assets · Hephaestus · Argos · Pygmalion</span>
      </div>

      {/* The drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        className={cn(
          'rounded-lg border-2 border-dashed p-5 mb-4 text-center cursor-pointer transition-colors',
          dropping ? 'border-olympus-gold bg-olympus-gold/10' : 'border-olympus-gold/25 hover:border-olympus-gold/50 hover:bg-olympus-gold/5',
        )}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && ingest(e.target.files)} />
        <Upload size={18} className="mx-auto mb-1.5 text-olympus-gold/70" />
        <p className="text-[11px] text-olympus-text font-mono">Drop ANY image here — from any AI or your own</p>
        <p className="text-[9px] text-olympus-text-dim mt-0.5">Argos will describe + tag it into the Media Vault</p>
      </div>

      {/* The generation lane */}
      <div className="rounded-lg border border-olympus-cyan/20 bg-olympus-card p-2.5 mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles size={11} className="text-olympus-cyan" />
          <span className="text-[10px] font-mono font-semibold text-olympus-cyan uppercase">pygmalion · free lane</span>
          <span className="text-[8px] text-olympus-text-dim ml-auto">pollinations/flux · $0</span>
        </div>
        <div className="flex gap-1.5">
          <input
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="a gold-and-dark robot mascot, studio lighting…"
            className="flex-1 bg-olympus-bg border border-olympus-gold/20 rounded px-2 py-1.5 text-[11px] font-mono text-olympus-text placeholder:text-[#5A5A5A] outline-none focus:border-olympus-cyan/50"
          />
          <button onClick={generate} disabled={busy === 'generate'}
            className="px-3 py-1.5 rounded bg-olympus-cyan/15 text-olympus-cyan ring-1 ring-olympus-cyan/30 text-[10px] font-mono hover:bg-olympus-cyan/25 disabled:opacity-40">
            {busy === 'generate' ? <Loader2 size={11} className="animate-spin" /> : 'forge'}
          </button>
        </div>
      </div>

      {/* The search */}
      <div className="flex items-center gap-1.5 mb-3">
        <Search size={12} className="text-olympus-text-dim shrink-0" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); load(e.target.value || undefined); }}
          placeholder="search the vault — style, subject, mood…"
          className="flex-1 bg-olympus-card border border-olympus-gold/15 rounded px-2 py-1 text-[11px] font-mono text-olympus-text placeholder:text-[#5A5A5A] outline-none focus:border-olympus-gold/40"
        />
      </div>

      {/* The gallery */}
      {loading && <div className="text-center py-10 text-olympus-text-dim text-xs font-mono">loading the vault…</div>}
      {!loading && assets.length === 0 && (
        <div className="text-center py-12">
          <ImageIcon size={22} className="mx-auto mb-2 text-olympus-gold/40" />
          <p className="text-olympus-text text-xs font-mono">The vault is empty</p>
          <p className="text-olympus-text-dim text-[10px] font-mono mt-1">Drop an image above or forge one</p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {assets.map((a) => (
          <button key={a.id} onClick={() => setSelected(a)}
            className="group rounded-lg overflow-hidden border border-olympus-gold/15 bg-olympus-card hover:border-olympus-gold/40 transition-all hover:-translate-y-0.5">
            <div className="aspect-square bg-olympus-bg overflow-hidden relative">
              <img src={`/api/olympus/atelier/assets?id=${a.id}`} alt={a.description ?? a.id}
                className="w-full h-full object-cover" loading="lazy" />
              {a.tags?.length ? (
                <div className="absolute bottom-0 inset-x-0 flex flex-wrap gap-0.5 p-1 bg-black/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity">
                  {a.tags.slice(0, 4).map((t) => (
                    <span key={t} className="text-[7px] font-mono px-1 py-0.5 rounded bg-olympus-gold/20 text-olympus-gold">{t}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="p-1.5 text-left">
              <p className="text-[8px] text-olympus-text-dim font-mono truncate">{new Date(a.createdAt).toLocaleString('en-US', { hour12: false })}</p>
              <p className="text-[9px] text-olympus-text font-mono line-clamp-2 leading-tight mt-0.5">{a.description ?? '— pending Argus —'}</p>
            </div>
          </button>
        ))}
      </div>

      {/* The busy + toast rows */}
      {busy && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-olympus-gold/15 ring-1 ring-olympus-gold/30 text-olympus-gold text-[10px] font-mono flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> {busy}…
        </div>
      )}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 max-w-md px-3 py-1.5 rounded bg-olympus-panel ring-1 ring-olympus-cyan/30 text-olympus-text text-[10px] font-mono text-center z-40">
          {toast}
        </div>
      )}

      {forging && <Forge2D assetId={forging} onClose={() => setForging(null)} />}
      {viewing3d && <Forge3D src={viewing3d.src} label={viewing3d.label} onClose={() => setViewing3d(null)} />}

      {/* The asset sheet */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-6" onClick={() => setSelected(null)}>
          <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-olympus-gold/20 bg-olympus-bg overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-olympus-gold/10 bg-olympus-panel">
              <Palette size={13} className="text-olympus-gold" />
              <span className="text-[12px] font-mono text-olympus-gold">{selected.id.slice(0, 24)}</span>
              <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/20 uppercase">{selected.source ?? 'vault'}</span>
              <button onClick={() => open3d(selected)} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-1 rounded bg-olympus-purple/15 text-olympus-purple ring-1 ring-olympus-purple/30 hover:bg-olympus-purple/25"><Box size={10} /> 3d</button>
              <button onClick={() => setForging(selected.id)} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-1 rounded bg-olympus-cyan/15 text-olympus-cyan ring-1 ring-olympus-cyan/30 hover:bg-olympus-cyan/25"><PenTool size={10} /> forge</button>
              <button onClick={() => openInArtcraft(selected.id)} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25"><ExternalLink size={10} /> artcraft</button>
              <button onClick={() => setSelected(null)} className="ml-auto text-olympus-text-dim hover:text-olympus-red"><X size={14} /></button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              <div className="md:w-1/2 bg-black/30 flex items-center justify-center">
                <img src={`/api/olympus/atelier/assets?id=${selected.id}`} className="max-h-[60vh] object-contain" alt={selected.description ?? ''} />
              </div>
              <div className="md:w-1/2 p-4 space-y-3 overflow-y-auto overscroll-contain custom-scroll">
                <div>
                  <div className="text-[9px] font-mono text-olympus-text-dim uppercase mb-1">argos says</div>
                  <p className="text-[11px] text-olympus-text leading-relaxed">{selected.description ?? '— pending —'}</p>
                </div>
                {selected.tags?.length ? (
                  <div>
                    <div className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim uppercase mb-1.5"><Tag size={9} /> tags</div>
                    <div className="flex flex-wrap gap-1">
                      {selected.tags.map((t) => (
                        <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/25">#{t}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selected.dominantColors?.length ? (
                  <div>
                    <div className="text-[9px] font-mono text-olympus-text-dim uppercase mb-1.5">dominant colors</div>
                    <div className="flex gap-1.5">
                      {selected.dominantColors.map((c, i) => (
                        <div key={i} className="w-8 h-8 rounded ring-1 ring-white/15" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  </div>
                ) : null}
                {selected.suggestedUse ? (
                  <div>
                    <div className="text-[9px] font-mono text-olympus-text-dim uppercase mb-1">suggested use</div>
                    <p className="text-[10px] text-olympus-cyan font-mono">{selected.suggestedUse}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
