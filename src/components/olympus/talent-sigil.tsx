/**
 * talent-sigil.tsx — v0.0.53: every talent gets its own mark.
 *
 * A deterministic SVG generation from the talent's name + god: three orbits,
 * a faceted peak, eight nodes and a monogram. The mark is stable for the same
 * talent (no random flicker), follows the active theme, and only animates on
 * hover/active — the static twin is the default. Stable motion mode renders a
 * single frame.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useMemo, useId } from 'react';
import { useTheme } from '@/lib/theme-store';
import { resolvePalette } from '@/lib/theme';

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default function TalentSigil({
  name,
  god,
  size = 168,
  animated = true,
  className,
}: {
  name: string;
  god: string;
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const seed = useMemo(() => hash(`${name}|${god}`), [name, god]);
  const stable = theme.motion === 'stable' || !animated;
  const colors = [palette.gold, palette.purple, palette.cyan, palette.green, palette.red, palette.blue, palette.teal, palette.amberSoft];
  const nodes = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + (seed % 17) / 17;
    const radius = 42 + ((seed >> (i * 3)) & 7);
    return { x: 64 + Math.cos(angle) * radius, y: 64 + Math.sin(angle) * radius, c: colors[(i + (seed % 4)) % colors.length], r: 1.3 + ((seed >> i) & 3) * 0.45 };
  });
  const peak = `M 64 ${30 + (seed % 7)} L ${84 + (seed % 5)} 94 L ${72 + (seed % 3)} 94 L 64 68 L ${56 - (seed % 3)} 94 L ${44 - (seed % 5)} 94 Z`;
  const initials = name.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'OL';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role="img"
      aria-label={`${name || 'talent'} sigil`}
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`ts-peak-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.gold} />
          <stop offset="48%" stopColor={palette.purple} />
          <stop offset="100%" stopColor={palette.cyan} />
        </linearGradient>
        <radialGradient id={`ts-glow-${uid}`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor={palette.gold} stopOpacity="0.18" />
          <stop offset="100%" stopColor={palette.bg} stopOpacity="0" />
        </radialGradient>
        <style>{`
          @keyframes ts-spin-${uid} { to { transform: rotate(360deg); } }
          @keyframes ts-spin-rev-${uid} { to { transform: rotate(-360deg); } }
          @keyframes ts-breathe-${uid} { 0%,100% { opacity:.55; transform:scale(.98); } 50% { opacity:1; transform:scale(1.03); } }
          .ts-a-${uid} { transform-origin: 64px 64px; animation: ts-spin-${uid} 22s linear infinite; }
          .ts-b-${uid} { transform-origin: 64px 64px; animation: ts-spin-rev-${uid} 34s linear infinite; }
          .ts-c-${uid} { transform-origin: 64px 64px; animation: ts-breathe-${uid} 5.5s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) { .ts-a-${uid}, .ts-b-${uid}, .ts-c-${uid} { animation: none; } }
        `}</style>
      </defs>
      <circle cx="64" cy="64" r="58" fill={`url(#ts-glow-${uid})`} />
      <g className={stable ? undefined : `ts-a-${uid}`} opacity="0.45">
        <circle cx="64" cy="64" r="48" fill="none" stroke={palette.cyan} strokeWidth="0.7" strokeDasharray="2 5" />
        <circle cx="64" cy="64" r="35" fill="none" stroke={palette.gold} strokeWidth="0.6" />
      </g>
      <g className={stable ? undefined : `ts-b-${uid}`} opacity="0.75">
        <ellipse cx="64" cy="64" rx="55" ry="24" fill="none" stroke={palette.purple} strokeWidth="0.7" transform={`rotate(${18 + (seed % 20)} 64 64)`} />
      </g>
      <g className={stable ? undefined : `ts-c-${uid}`}>
        <path d={peak} fill={`url(#ts-peak-${uid})`} />
        <circle cx="64" cy="64" r="2.2" fill={palette.bg} opacity="0.85" />
      </g>
      <g fontFamily="ui-monospace, monospace" fontSize="5" fontWeight="700" textAnchor="middle" fill={palette.text} opacity="0.8">
        <text x="64" y="118">{initials}</text>
      </g>
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.c} opacity={stable ? 0.8 : 0.55 + ((i + seed) % 4) * 0.1}>
          {!stable && <animate attributeName="opacity" values="0.45;0.95;0.45" dur={`${3 + (i % 4)}s`} repeatCount="indefinite" />}
        </circle>
      ))}
      <g stroke={palette.gold} strokeWidth="0.25" opacity="0.16">
        {nodes.map((n, i) => <line key={i} x1="64" y1="64" x2={n.x} y2={n.y} />)}
      </g>
    </svg>
  );
}
