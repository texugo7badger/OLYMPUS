/**
 * forge-3d.tsx — #163 FORGE-3D (v0.0.6): the embedded 3D viewport. Renders
 * GLB assets (the t2-3D generation lane's output) with @google/model-viewer
 * (Apache-2.0) — orbit/zoom/CameraOrbit out of the box, the honest fallback
 * for non-GLB assets (an image preview). The heavy 3D WORK stays a deep-link
 * (Blender/ArtCraft) — this is the VIEWER, by design.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { Box, X, Loader2, RotateCcw } from 'lucide-react';

export default function Forge3D({ src, label, kind = 'model', onClose }: { src: string; label: string; kind?: 'model' | 'image'; onClose: () => void }) {
  const ref = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // model-viewer is a custom element — the types are stubs in the package;
    // declare it for React when needed (the SSR guard).
    if (typeof window !== 'undefined' && !customElements.get('model-viewer')) {
      import('@google/model-viewer').catch(() => setErr('the 3D module failed to load'));
    }
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, []);

  const reset = () => {
    try { ref.current?.resetTurntableRotation?.(); ref.current?.resetInteraction?.(); } catch { /* best-effort */ }
  };

  return (
    <div className="fixed inset-0 z-50 bg-olympus-bg flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-olympus-gold/10 bg-olympus-panel">
        <Box size={13} className="text-olympus-cyan" />
        <span className="text-[12px] font-mono font-semibold text-olympus-cyan">FORGE-3D</span>
        <span className="text-[9px] text-olympus-text-dim font-mono truncate max-w-40">{label}</span>
        <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/20 uppercase">model-viewer · Apache-2.0</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={reset} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-1 rounded bg-olympus-cyan/15 text-olympus-cyan ring-1 ring-olympus-cyan/30 hover:bg-olympus-cyan/25"><RotateCcw size={10} /> reset view</button>
          <button onClick={onClose} className="text-olympus-text-dim hover:text-olympus-red"><X size={14} /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {/* W-C: the MIME DISPATCH — a 2D asset gets the honest labeled 2D
            LOOK (the same dark stage; never model-viewer's error card). */}
        {kind === 'image' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#07090f]">
            <img src={src} alt={label} className="max-h-[75%] max-w-[85%] object-contain rounded ring-1 ring-olympus-gold/15" />
            <span className="text-[9px] font-mono text-olympus-text-dim">
              the 2D look — GLB/GLTF assets orbit in 3D; images preview here
            </span>
          </div>
        ) : (
        <>
        {!ready && !err && (
          <div className="absolute inset-0 flex items-center justify-center text-olympus-text-dim text-xs font-mono gap-2">
            <Loader2 size={13} className="animate-spin" /> loading the viewport…
          </div>
        )}
        {err ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-8">
            <Box size={24} className="text-olympus-red/60" />
            <p className="text-olympus-text text-xs font-mono">{err}</p>
            <p className="text-olympus-text-dim text-[10px] font-mono">the asset stays in the vault — the viewer is the light lane; heavy 3D deep-links to forge-2d/forge-3d (Blender/ArtCraft), the TRELLIS local lane needs an NVIDIA GPU (docs/research/3d-lanes.md)</p>
          </div>
        ) : (
          <model-viewer
            ref={ref}
            src={src}
            alt={label}
            camera-controls
            auto-rotate
            rotation-per-second="12deg"
            environment-image="neutral"
            shadow-intensity="1"
            exposure="1"
            style={{ width: '100%', height: '100%', background: '#07090f' }}
            onError={() => setErr('this asset is not a viewable 3D model (GLB/GLTF expected)')}
          />
        )}
        </>
        )}
      </div>
    </div>
  );
}
