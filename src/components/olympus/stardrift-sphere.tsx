'use client';

/**
 * stardrift-sphere.tsx — v0.0.64: the default OLYMPUS loader.
 *
 * A sphere of stars drifts around the peak mark; as the load advances the
 * stars are drawn into the mark and the mark FILLS with the theme's light.
 * Every color comes from the live palette (gold / purple / cyan / green), so
 * the loader is the theme's logo, not a fixed gold image.
 *
 * Reference: OriginKit "Stardrift Sphere" (catalogued in ui-references).
 * ORIGINAL implementation — the never-vendor doctrine; no upstream code.
 *
 * 60 FPS: one canvas (~110 particles, DPR ≤ 2, RAF only while mounted, paused
 * when the tab is hidden), transform-free math; stable/reduced motion renders
 * a static constellation. No blur on large surfaces.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useEffect, useRef } from 'react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';

type Star = {
  /** unit sphere */
  x: number; y: number; z: number;
  size: number;
  tw: number;
  color: number;
};

function buildStars(count: number): Star[] {
  const out: Star[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out.push({
      x: Math.cos(theta) * r,
      y,
      z: Math.sin(theta) * r,
      size: 0.7 + Math.random() * 1.5,
      tw: Math.random() * Math.PI * 2,
      color: Math.floor(Math.random() * 4),
    });
  }
  return out;
}

export default function StarDriftSphere({
  size = 168,
  progress,
  className = '',
}: {
  size?: number;
  /** 0..1 — when omitted the loader is indeterminate (a calm breathing fill). */
  progress?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const stable = theme.motion === 'stable';
  const progressRef = useRef<number | null>(progress ?? null);
  const stableRef = useRef(stable);
  const colorsRef = useRef<string[]>([]);

  useEffect(() => {
    progressRef.current = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null;
  }, [progress]);
  useEffect(() => { stableRef.current = stable; }, [stable]);
  useEffect(() => {
    colorsRef.current = [palette.gold, palette.purple, palette.cyan, palette.green];
  }, [palette.gold, palette.purple, palette.cyan, palette.green]);

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

    const stars = buildStars(110);
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.36;
    let raf = 0;
    let angle = 0;
    let t0 = 0;
    let alive = true;

    const draw = (now: number) => {
      if (!alive) return;
      if (!t0) t0 = now;
      const time = (now - t0) / 1000;
      const p = progressRef.current ?? (0.18 + 0.62 * (0.5 + 0.5 * Math.sin(time * 0.9)));
      const spin = stableRef.current || reduce ? 0 : time * 0.22;
      ctx.clearRect(0, 0, size, size);
      const colors = colorsRef.current;

      // the core light — grows with the fill
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (0.9 + p * 0.3));
      core.addColorStop(0, `${colors[0]}${Math.round((0.10 + p * 0.16) * 255).toString(16).padStart(2, '0')}`);
      core.addColorStop(0.55, `${colors[1]}10`);
      core.addColorStop(1, 'transparent');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, size, size);

      for (const s of stars) {
        // rotate around Y, then a gentle X tilt
        const cos = Math.cos(spin), sin = Math.sin(spin);
        const x = s.x * cos - s.z * sin;
        const z = s.x * sin + s.z * cos;
        const tilt = 0.34;
        const y = s.y * Math.cos(tilt) - z * Math.sin(tilt);
        const zz = s.y * Math.sin(tilt) + z * Math.cos(tilt);
        // perspective
        const persp = 1 / (1.9 - zz * 0.55);
        const px = cx + x * radius * persp;
        const py = cy + y * radius * persp;
        // as the load advances, the sphere is drawn INTO the mark
        const pull = p * 0.42;
        const dx = px + (cx - px) * pull;
        const dy = py + (cy - py) * pull;
        const tw = stableRef.current || reduce ? 1 : 0.55 + 0.45 * Math.sin(time * 1.8 + s.tw);
        const alpha = Math.max(0.05, Math.min(0.9, (0.18 + (zz + 1) * 0.22) * tw * (0.55 + p * 0.45)));
        ctx.beginPath();
        ctx.fillStyle = colors[s.color % colors.length];
        ctx.globalAlpha = alpha;
        ctx.arc(dx, dy, Math.max(0.4, s.size * persp * (size / 168)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!stableRef.current && !reduce) raf = requestAnimationFrame(draw);
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
  }, [size]);

  // The mark: the OLYMPUS peak, filled from the bottom with the theme light.
  const p = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : 0.58;
  const fillTop = 512 - 512 * p;
  const clipId = `sd-fill-${Math.round(size)}`;
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <canvas ref={canvasRef} style={{ width: size, height: size }} className="absolute inset-0" />
      <svg viewBox="0 0 512 512" width={size} height={size} className="relative" role="presentation">
        <defs>
          <linearGradient id={`${clipId}-g`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={palette.gold} />
            <stop offset="52%" stopColor={palette.purple} />
            <stop offset="100%" stopColor={palette.cyan} />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x="0" y={fillTop} width="512" height={512 - fillTop} />
          </clipPath>
        </defs>
        {/* the unfilled peak: a quiet outline */}
        <path
          d="M256 96 L372 372 L316 372 L256 236 L196 372 L140 372 Z"
          fill="none"
          stroke={palette.gold}
          strokeOpacity="0.22"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        {/* the filled peak: the theme's light rising */}
        <path
          d="M256 96 L372 372 L316 372 L256 236 L196 372 L140 372 Z"
          fill={`url(#${clipId}-g)`}
          fillOpacity="0.92"
          clipPath={`url(#${clipId})`}
        />
        {/* the horizon: a thin line where the fill stands */}
        {typeof progress === 'number' && p > 0.02 && p < 0.98 && (
          <line x1="120" y1={fillTop} x2="392" y2={fillTop} stroke={palette.cyan} strokeOpacity="0.55" strokeWidth="3" />
        )}
      </svg>
    </div>
  );
}
