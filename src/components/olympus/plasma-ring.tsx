'use client';

/**
 * plasma-ring.tsx — v0.0.64: the voice ring, one component everywhere.
 *
 * Reference: OriginKit "Plasma Ring" (catalogued in ui-references; a border
 * that frames a surface with motion). ORIGINAL implementation — the
 * never-vendor doctrine, no upstream code.
 *
 * The ring is the studio's center: the gods' TTS level and the user's mic
 * level drive the plasma filaments; `recording` pulls the ring inward and
 * warms it to red; `speaking` expands it. The children (the god mark or the
 * mic) sit inside.
 *
 * 60 FPS: one canvas, ~72 segments, DPR ≤ 2, RAF only while mounted, paused
 * when hidden; stable/reduced motion draws a static ring.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';

export default function PlasmaRing({
  tint,
  level = 0,
  speaking = false,
  recording = false,
  size = 208,
  children,
  className = '',
}: {
  tint: string;
  level?: number;
  speaking?: boolean;
  recording?: boolean;
  size?: number;
  children?: ReactNode;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(level);
  const speakingRef = useRef(speaking);
  const recordingRef = useRef(recording);
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const stable = theme.motion === 'stable';

  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.scale(dpr, dpr);
    const cx = size / 2;
    const cy = size / 2;
    const base = size * 0.42;
    const segs = 72;
    let raf = 0;
    let t0 = 0;
    let alive = true;

    const draw = (now: number) => {
      if (!alive) return;
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      const lv = Math.max(0, Math.min(1, levelRef.current));
      const rec = recordingRef.current;
      const spk = speakingRef.current;
      const active = stable || reduce ? 0 : t;
      const energy = rec ? 0.55 + lv * 0.9 : spk ? 0.4 + lv * 0.7 : 0.16 + lv * 0.4;
      const color = rec ? palette.red : tint;
      ctx.clearRect(0, 0, size, size);

      // the aura
      const aura = ctx.createRadialGradient(cx, cy, base * 0.55, cx, cy, base * 1.28);
      aura.addColorStop(0, `${color}00`);
      aura.addColorStop(0.72, `${color}${Math.round(0.10 * 255).toString(16).padStart(2, '0')}`);
      aura.addColorStop(1, `${color}00`);
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, size, size);

      // the base ring: the frame is always visible, in the god's tint
      ctx.beginPath();
      ctx.arc(cx, cy, base, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // three filaments, each with its own phase — the plasma braid
      for (let layer = 0; layer < 3; layer += 1) {
        ctx.beginPath();
        for (let i = 0; i <= segs; i += 1) {
          const a = (i / segs) * Math.PI * 2;
          const wob = Math.sin(a * (3 + layer) + active * (1.1 + layer * 0.35) + layer * 2.1) * (2 + energy * 6);
          const r = base + layer * 2.4 + wob + Math.sin(a * 7 + active * 0.8) * energy * 2.6;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = layer === 0 ? color : layer === 1 ? palette.cyan : palette.purple;
        ctx.globalAlpha = layer === 0 ? 0.9 : layer === 1 ? 0.38 : 0.24;
        ctx.lineWidth = layer === 0 ? 2.2 + energy * 2.2 : 1.1;
        ctx.stroke();
        if (layer === 0) {
          // a soft second pass: the plasma glow without a canvas shadowBlur
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 6 + energy * 4;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // the recording ticks: a dashed inner ring that turns while you speak
      if (rec && !stable && !reduce) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(active * 1.8);
        ctx.beginPath();
        ctx.setLineDash([3, 9]);
        ctx.arc(0, 0, base * 0.86, 0, Math.PI * 2);
        ctx.strokeStyle = palette.red;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      if (!stable && !reduce) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    const onVis = () => {
      if (document.visibilityState === 'hidden') { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [size, tint, palette.red, palette.cyan, palette.purple, stable]);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} className="absolute inset-0" aria-hidden="true" />
      <div className="relative flex items-center justify-center" style={{ width: size * 0.62, height: size * 0.62 }}>
        {children}
      </div>
    </div>
  );
}
