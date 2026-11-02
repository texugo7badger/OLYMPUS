/**
 * olympus-loader.tsx — v0.0.32: the branded boot animation.
 *
 * The app used to show a bare spinner and a list of chunk labels while
 * Turbopack compiled. The loader (public/olympus-loader.svg, pure SVG: the
 * mark breathes, two star belts orbit, the dots twinkle over a soft shade)
 * covers the wait — full-screen on the cold boot, mini-sized in every panel's
 * dynamic-import fallback.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { cn } from '@/lib/utils';

export interface OlympusLoaderProps {
  /** Rendered size in px (the SVG scales cleanly). */
  size?: number;
  /** Small caption under the mark. */
  label?: string;
  /** Cover the whole viewport (the cold-boot overlay). */
  fullscreen?: boolean;
  /** Fade-out state, driven by the parent. */
  leaving?: boolean;
  className?: string;
}

export default function OlympusLoader({
  size = 168,
  label,
  fullscreen = false,
  leaving = false,
  className,
}: OlympusLoaderProps) {
  const mark = (
    <img
      src="/olympus-loader.svg"
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="select-none"
    />
  );
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(212,165,116,0.10),transparent_60%)]" aria-hidden="true" />
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
