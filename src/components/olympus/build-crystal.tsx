'use client';

/**
 * build-crystal.tsx — v0.0.64: every build is a crystal.
 *
 * The Talent Studio's builds are not rows in a table — each one is a gem with
 * its own cut. The form is deterministic (build name + god) so the same build
 * always looks the same; the editor can pick a cut explicitly. Colors come
 * from the live theme palette + the god's tint, never invented hexes.
 *
 * Reference: OriginKit "Refract Gem" (catalogued in ui-references). This is an
 * ORIGINAL implementation — the never-vendor doctrine; no upstream code.
 *
 * 60 FPS: pure SVG, transform/opacity only, no canvas, no blur on large
 * surfaces; the float/shimmer stops in stable mode and under reduced motion.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useId, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme-store';
import { resolvePalette } from '@/lib/theme';
import { godTintHex } from '@/lib/god-tint';

export type CrystalForm = 'octa' | 'shards' | 'prism' | 'star' | 'teardrop' | 'twin';
export const CRYSTAL_FORMS: CrystalForm[] = ['octa', 'shards', 'prism', 'star', 'teardrop', 'twin'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic cut from the build's identity (stable across sessions). */
export function crystalFormFor(build: { name?: string; id?: string; god?: string; crystal?: string }): CrystalForm {
  if (build.crystal && (CRYSTAL_FORMS as string[]).includes(build.crystal)) return build.crystal as CrystalForm;
  return CRYSTAL_FORMS[hash(`${build.id || ''}:${build.name || ''}:${build.god || ''}`) % CRYSTAL_FORMS.length];
}

const SHAPES: Record<CrystalForm, { crown: string[]; table: string[] }> = {
  octa: {
    crown: ['50,6 78,38 50,50 22,38', '50,6 78,38 50,50', '50,6 22,38 50,50'],
    table: ['22,38 78,38 50,94', '22,38 50,50 50,94', '78,38 50,50 50,94'],
  },
  shards: {
    crown: ['50,4 66,30 50,44 34,30', '18,26 30,46 22,74 12,50', '82,26 88,52 78,76 70,46'],
    table: ['34,30 66,30 50,44', '12,50 22,74 18,26', '70,46 78,76 88,52', '50,44 66,30 50,94 34,30'],
  },
  prism: {
    crown: ['50,6 74,20 86,48 50,58 14,48 26,20', '50,6 74,20 50,58', '50,6 26,20 50,58'],
    table: ['14,48 50,58 86,48 50,96', '14,48 50,58 50,96', '86,48 50,58 50,96'],
  },
  star: {
    crown: ['50,4 61,34 92,30 68,52 78,84 50,66 22,84 32,52 8,30 39,34'],
    table: ['50,4 61,34 50,66 39,34', '92,30 68,52 50,66 61,34', '8,30 32,52 50,66 39,34', '78,84 50,66 68,52', '22,84 50,66 32,52'],
  },
  teardrop: {
    crown: ['50,4 70,34 74,58 50,50 26,58 30,34', '50,4 70,34 50,50', '50,4 30,34 50,50'],
    table: ['26,58 50,50 74,58 50,96', '26,58 50,50 50,96', '74,58 50,50 50,96'],
  },
  twin: {
    crown: ['30,10 52,40 30,54 10,40', '70,18 90,44 70,58 50,44', '30,54 52,40 50,70 30,72'],
    table: ['10,40 30,54 30,94', '30,54 52,40 50,70 30,72', '50,44 70,58 70,94 50,96', '70,18 90,44 70,58'],
  },
};

export default function BuildCrystal({
  build,
  size = 72,
  form,
  interactive = false,
  className = '',
}: {
  build: { name?: string; id?: string; god?: string; crystal?: string; tier?: string };
  size?: number;
  form?: CrystalForm;
  interactive?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [theme] = useTheme();
  const palette = useMemo(() => resolvePalette(theme), [theme]);
  const tint = godTintHex(palette, build.god || 'athena');
  const cut = form || crystalFormFor(build);
  const shape = SHAPES[cut];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const stable = theme.motion === 'stable';
  const tier = String(build.tier || '').toLowerCase();
  const glow = tier === 'hot' ? 0.55 : tier === 'warm' ? 0.38 : 0.26;

  const onMove = (e: React.PointerEvent) => {
    if (!interactive) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: py * -14, y: px * 16 });
  };
  const reset = () => setTilt({ x: 0, y: 0 });

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size, perspective: 420 }}
      onPointerMove={onMove}
      onPointerLeave={reset}
      aria-hidden="true"
    >
      <div
        className={stable ? '' : 'olympus-crystal-float'}
        style={{
          width: '100%',
          height: '100%',
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: 'transform 160ms ease-out',
          transformStyle: 'preserve-3d',
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" role="presentation">
          <defs>
            <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={tint} stopOpacity="0.95" />
              <stop offset="52%" stopColor={palette.gold} stopOpacity="0.75" />
              <stop offset="100%" stopColor={palette.purple} stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id={`g2-${uid}`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.cyan} stopOpacity="0.7" />
              <stop offset="100%" stopColor={tint} stopOpacity="0.35" />
            </linearGradient>
            <radialGradient id={`glow-${uid}`} cx="50%" cy="42%" r="60%">
              <stop offset="0%" stopColor={tint} stopOpacity={glow} />
              <stop offset="100%" stopColor={tint} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill={`url(#glow-${uid})`} />
          {shape.crown.map((points, i) => (
            <polygon
              key={`c${i}`}
              points={points}
              fill={i === 0 ? `url(#g-${uid})` : `url(#g2-${uid})`}
              fillOpacity={i === 0 ? 0.95 : 0.55}
              stroke={tint}
              strokeOpacity="0.35"
              strokeWidth="0.6"
            />
          ))}
          {shape.table.map((points, i) => (
            <polygon
              key={`t${i}`}
              points={points}
              fill={i === 0 ? `url(#g-${uid})` : `url(#g2-${uid})`}
              fillOpacity={i === 0 ? 0.82 : 0.42}
              stroke={tint}
              strokeOpacity="0.28"
              strokeWidth="0.5"
            />
          ))}
          {/* the light table: a thin highlight across the crown */}
          <polyline
            points={shape.crown[0]}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={stable ? 0.18 : 0.34}
            strokeWidth="0.7"
            strokeLinecap="round"
          />
          {!stable && (
            <circle cx="50" cy="50" r="2.2" fill="#FFFFFF" fillOpacity="0.55" className="olympus-crystal-shimmer" />
          )}
        </svg>
      </div>
    </div>
  );
}
