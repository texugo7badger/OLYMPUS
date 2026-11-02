/**
 * themed-logo.tsx — v0.0.32: the OLYMPUS mark in the active theme.
 *
 * The static /logo.svg is gold; the status bar must show the palette the user
 * picked (and the icon family: classic, orbit, peak, monogram). Inline SVG,
 * four shapes, zero requests.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';

export default function ThemedLogo({ iconId, size = 20 }: { iconId: string; size?: number }) {
  const [theme] = useTheme();
  const c = resolvePalette(theme);
  const common = { width: size, height: size, viewBox: '0 0 128 128', role: 'img' as const, 'aria-label': 'OLYMPUS' };
  if (iconId === 'peak') {
    return (
      <svg {...common}>
        <circle cx="64" cy="64" r="52" fill="none" stroke={c.gold} strokeWidth="1.4" opacity=".35" />
        <path d="M 64 30 L 98 98 L 78 98 L 64 66 L 50 98 L 30 98 Z" fill={c.gold} />
        <circle cx="64" cy="22" r="3.2" fill={c.purple} />
      </svg>
    );
  }
  if (iconId === 'orbit') {
    return (
      <svg {...common}>
        <g fill="none" stroke={c.gold}>
          <ellipse cx="64" cy="64" rx="56" ry="22" strokeWidth="1.2" opacity=".45" transform="rotate(-24 64 64)" />
          <ellipse cx="64" cy="64" rx="56" ry="22" strokeWidth="1" opacity=".28" transform="rotate(38 64 64)" />
          <circle cx="64" cy="64" r="34" strokeWidth="1" opacity=".35" />
        </g>
        <path d="M 64 42 L 84 88 L 71 88 L 64 70 L 57 88 L 44 88 Z" fill={c.gold} />
        <circle cx="64" cy="34" r="2.6" fill={c.purple} />
        <circle cx="112" cy="48" r="3" fill={c.cyan} />
        <circle cx="20" cy="86" r="2.6" fill={c.green} />
      </svg>
    );
  }
  if (iconId === 'monogram') {
    return (
      <svg {...common}>
        <circle cx="64" cy="64" r="50" fill="none" stroke={c.gold} strokeWidth="2" opacity=".55" />
        <path d="M 64 22 L 92 96 L 36 96 Z" fill="none" stroke={c.gold} strokeWidth="4" strokeLinejoin="round" />
        <path d="M 64 54 L 76 82 L 52 82 Z" fill={c.gold} opacity=".8" />
        <circle cx="64" cy="22" r="4" fill={c.purple} />
      </svg>
    );
  }
  // classic
  return (
    <svg {...common}>
      <circle cx="64" cy="64" r="56" stroke={c.gold} strokeWidth="1.5" fill="none" opacity=".4" />
      <circle cx="64" cy="64" r="48" stroke={c.gold} strokeWidth="1" fill="none" opacity=".25" />
      <path d="M 64 38 L 84 84 L 72 84 L 64 66 L 56 84 L 44 84 Z" fill={c.gold} />
      <circle cx="64" cy="30" r="2.6" fill={c.purple} />
      <circle cx="64" cy="84" r="2.6" fill={c.gold} />
    </svg>
  );
}
