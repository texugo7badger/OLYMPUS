/**
 * forge-2d.tsx — #153 FORGE-2D (v0.0.5): the embedded Excalidraw canvas
 * (MIT). The LIGHT 2D editor inside the Atelier: sketch over/annotate a
 * vault asset, export the scene as a PNG back into the vault. The HEAVY
 * compositing (posing/staging/depth) deep-links to ArtCraft — the
 * embedded scope stays light BY DESIGN.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Excalidraw, THEME, exportToBlob } from '@excalidraw/excalidraw';

/** The imperative API surface we use (the package does not re-export the
 *  type; declared loosely — the runtime passes it via excalidrawAPI). */
type ExcalidrawImperativeAPI = any;
import { Loader2, Save, X } from 'lucide-react';

export default function Forge2D({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setToast(null);
  }, [assetId]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  const save = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    setSaving(true);
    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true },
        files: api.getFiles(),
        mimeType: 'image/png',
      });
      const buf = Buffer.from(await blob.arrayBuffer());
      const fd = new FormData();
      fd.append('image', new File([new Uint8Array(buf)], `forge-${assetId}.png`, { type: 'image/png' }));
      fd.append('source', 'forge-2d');
      const r = await fetch('/api/olympus/atelier/upload', { method: 'POST', body: fd }).then((x) => x.json());
      if (!r?.ok) throw new Error(r?.error || 'save failed');
      flash('Canvas saved into the Media Vault');
    } catch (e: any) {
      flash(`SAVE FAILED: ${e?.message || e}`);
    } finally { setSaving(false); }
  }, [assetId]);

  return (
    <div className="fixed inset-0 z-50 bg-olympus-bg flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-olympus-gold/10 bg-olympus-panel">
        <span className="text-[12px] font-mono font-semibold text-olympus-gold">FORGE-2D</span>
        <span className="text-[9px] text-olympus-text-dim font-mono truncate">excalidraw · MIT · editing {assetId.slice(0, 20)}</span>
        <div className="ml-auto flex items-center gap-2">
          {toast && <span className="text-[10px] font-mono text-olympus-cyan">{toast}</span>}
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 text-[10px] font-mono hover:bg-olympus-gold/25 disabled:opacity-40">
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} save to vault
          </button>
          <button onClick={onClose} className="text-olympus-text-dim hover:text-olympus-red"><X size={14} /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {/* The reference asset as a background hint (drop it INTO the scene
            via the toolbar's image tool for full annotation). */}
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-olympus-text-dim text-xs font-mono">
            loading the canvas…
          </div>
        )}
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api; setImgLoaded(true); }}
          theme={THEME.DARK}
          initialData={{
            appState: { viewBackgroundColor: '#07090f' },
          }}
          UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false, export: false, saveAsImage: false } }}
        />
      </div>
    </div>
  );
}
