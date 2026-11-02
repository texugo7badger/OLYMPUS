/**
 * olympus-loader.tsx — v0.0.32: the branded boot animation, THEME-AWARE.
 *
 * The first version rendered public/olympus-loader.svg as an <img>: an image
 * cannot see the CSS variables, so the animation stayed gold while the user
 * picked another palette. This component renders the same geometry inline and
 * takes every color from the active theme (accent, purple, cyan, green,
 * amber); the Electron splash gets the same palette through theme.json.
 *
 * Pure SVG + CSS keyframes (no JS animation); `stable` motion renders a static
 * peak instead. Respects prefers-reduced-motion.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { cn } from '@/lib/utils';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';

export interface OlympusLoaderProps {
  size?: number;
  label?: string;
  fullscreen?: boolean;
  leaving?: boolean;
  /** Render only the SVG (the status bar / brain corner). */
  bare?: boolean;
  className?: string;
}

export default function OlympusLoader({
  size = 168,
  label,
  fullscreen = false,
  leaving = false,
  bare = false,
  className,
}: OlympusLoaderProps) {
  const [theme] = useTheme();
  const c = resolvePalette(theme);
  const stable = theme.motion === 'stable';
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="OLYMPUS"
      className="select-none"
    >
      <defs>
        <radialGradient id="ol-shade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={c.gold} stopOpacity="0.16" />
          <stop offset="45%" stopColor={c.purple} stopOpacity="0.07" />
          <stop offset="100%" stopColor={c.bg} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ol-core" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor={c.gold} stopOpacity="0.20" />
          <stop offset="100%" stopColor={c.gold} stopOpacity="0" />
        </radialGradient>
        <filter id="ol-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <style>{`
        .ol-orbit-a { transform-origin: 256px 256px; animation: ol-spin 18s linear infinite; }
        .ol-orbit-b { transform-origin: 256px 256px; animation: ol-spin-rev 26s linear infinite; }
        .ol-orbit-c { transform-origin: 256px 256px; animation: ol-spin 40s linear infinite; }
        .ol-mark { animation: ol-breathe 4.6s ease-in-out infinite; transform-origin: 256px 256px; }
        .ol-ring { animation: ol-ring 4.6s ease-in-out infinite; transform-origin: 256px 256px; }
        .ol-tw-a,.ol-tw-b,.ol-tw-c,.ol-tw-d,.ol-tw-e,.ol-tw-f { animation: ol-twinkle 3.2s ease-in-out infinite; }
        .ol-tw-b { animation-delay: .5s; } .ol-tw-c { animation-delay: 1.1s; }
        .ol-tw-d { animation-delay: 1.7s; } .ol-tw-e { animation-delay: 2.2s; } .ol-tw-f { animation-delay: 2.7s; }
        @keyframes ol-spin { to { transform: rotate(360deg); } }
        @keyframes ol-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes ol-breathe { 0%,100% { transform: scale(1); opacity: .92; } 50% { transform: scale(1.035); opacity: 1; } }
        @keyframes ol-ring { 0%,100% { opacity: .18; } 50% { opacity: .42; } }
        @keyframes ol-twinkle { 0%,100% { opacity: .15; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ol-orbit-a,.ol-orbit-b,.ol-orbit-c,.ol-mark,.ol-ring,
          .ol-tw-a,.ol-tw-b,.ol-tw-c,.ol-tw-d,.ol-tw-e,.ol-tw-f { animation: none; }
        }
        ${stable ? '.ol-orbit-a,.ol-orbit-b,.ol-orbit-c,.ol-mark,.ol-ring,.ol-tw-a,.ol-tw-b,.ol-tw-c,.ol-tw-d,.ol-tw-e,.ol-tw-f { animation: none; }' : ''}
      `}</style>
      <circle cx="256" cy="256" r="250" fill="url(#ol-shade)" />
      <circle cx="256" cy="256" r="150" fill="url(#ol-core)" />
      <g className="ol-mark" filter="url(#ol-glow)">
        <g transform="translate(256 256) scale(1.6) translate(-128 -128)">
          <circle className="ol-ring" cx="128" cy="128" r="112" stroke={c.gold} strokeWidth="1.6" fill="none" opacity="0.4" />
          <circle cx="128" cy="128" r="96" stroke={c.gold} strokeWidth="1" fill="none" opacity="0.22" />
          <path d="M 128 76 L 168 168 L 144 168 L 128 132 L 112 168 L 88 168 Z" fill={c.gold} />
          <circle cx="128" cy="60" r="3" fill={c.purple} />
          <circle cx="128" cy="168" r="3" fill={c.gold} />
        </g>
      </g>
      <g className="ol-orbit-a">
        <circle className="ol-tw-a" cx="256" cy="58" r="3.6" fill={c.gold} />
        <circle className="ol-tw-c" cx="427" cy="256" r="2.8" fill={c.cyan} />
        <circle className="ol-tw-e" cx="256" cy="454" r="3.2" fill={c.purple} />
      </g>
      <g className="ol-orbit-b">
        <circle className="ol-tw-b" cx="147" cy="147" r="2.6" fill={c.green} />
        <circle className="ol-tw-d" cx="365" cy="365" r="3" fill={c.amberSoft} />
      </g>
      <g className="ol-orbit-c">
        <circle className="ol-tw-f" cx="256" cy="24" r="1.7" fill={c.gold} opacity="0.6" />
        <circle className="ol-tw-a" cx="470" cy="312" r="1.5" fill={c.cyan} opacity="0.6" />
        <circle className="ol-tw-c" cx="188" cy="470" r="1.8" fill={c.purple} opacity="0.6" />
        <circle className="ol-tw-e" cx="42" cy="200" r="1.5" fill={c.green} opacity="0.6" />
      </g>
      <g stroke={c.gold} strokeWidth="0.5" opacity="0.10">
        <line x1="256" y1="256" x2="256" y2="58" />
        <line x1="256" y1="256" x2="427" y2="256" />
        <line x1="256" y1="256" x2="256" y2="454" />
        <line x1="256" y1="256" x2="85" y2="256" />
      </g>
      <text x="256" y="486" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="13" letterSpacing="7" fill={c.gold} opacity="0.85">OLYMPUS</text>
    </svg>
  );

  if (bare) return <span className={className}>{mark}</span>;
  if (!fullscreen) {
    return (
      <div
        className={cn('h-full w-full flex flex-col items-center justify-center gap-1.5 bg-olympus-bg/60', className)}
        role="status"
        aria-live="polite"
        aria-label={label ? `Loading ${label}` : 'Loading'}
      >
        <div className="opacity-80">{mark}</div>
        {label && <span className="text-[9px] font-mono tracking-[0.18em] uppercase text-olympus-text-dim">{label}</span>}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'fixed inset-0 z-[200] flex flex-col items-center justify-center bg-olympus-bg transition-opacity duration-500',
        leaving ? 'opacity-0 pointer-events-none' : 'opacity-100',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="OLYMPUS is loading"
    >
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${c.gold}1a, transparent 60%)` }} aria-hidden="true" />
      {mark}
      <div className="mt-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-olympus-gold/80">
        <span>loading the pantheon</span>
        <span className="inline-flex gap-1" aria-hidden="true">
          <i className="w-1 h-1 rounded-full bg-olympus-gold/80 animate-pulse" />
          <i className="w-1 h-1 rounded-full bg-olympus-cyan/80 animate-pulse [animation-delay:150ms]" />
          <i className="w-1 h-1 rounded-full bg-olympus-purple/80 animate-pulse [animation-delay:300ms]" />
        </span>
      </div>
      <p className="mt-1 text-[9px] font-mono text-olympus-text-dim/70">10 gods · 122 demigods · the vault is waking</p>
    </div>
  );
}
