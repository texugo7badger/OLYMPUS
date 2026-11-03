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
import StarDriftSphere from './stardrift-sphere';
import { t, useLanguage } from '@/lib/i18n';

export interface OlympusLoaderProps {
  size?: number;
  label?: string;
  fullscreen?: boolean;
  leaving?: boolean;
  /** Render only the mark (the status bar / brain corner). */
  bare?: boolean;
  /** 0..1 — the real boot fill; omitted = indeterminate. */
  progress?: number;
  className?: string;
}

export default function OlympusLoader({
  size = 168,
  label,
  fullscreen = false,
  leaving = false,
  bare = false,
  progress,
  className,
}: OlympusLoaderProps) {
  const [theme] = useTheme();
  const language = useLanguage();
  const c = resolvePalette(theme);
  const stable = theme.motion === 'stable';
  if (bare) return <span className={className}><StarDriftSphere size={size} progress={progress} /></span>;
  if (!fullscreen) {
    return (
      <div
        className={cn('h-full w-full flex flex-col items-center justify-center gap-1.5 bg-olympus-bg/60', className)}
        role="status"
        aria-live="polite"
        aria-label={label ? `Loading ${label}` : 'Loading'}
      >
        <div className="opacity-80"><StarDriftSphere size={size} progress={progress} /></div>
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
      <StarDriftSphere size={size} progress={progress} />
      <div className="mt-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-olympus-gold/80">
        <span>{t('common.loadingPantheon', language)}</span>
        <span className="inline-flex gap-1" aria-hidden="true">
          <i className="w-1 h-1 rounded-full bg-olympus-gold/80 animate-pulse" />
          <i className="w-1 h-1 rounded-full bg-olympus-cyan/80 animate-pulse [animation-delay:150ms]" />
          <i className="w-1 h-1 rounded-full bg-olympus-purple/80 animate-pulse [animation-delay:300ms]" />
        </span>
      </div>
      <p className="mt-1 text-[9px] font-mono text-olympus-text-dim/70">{t('common.loadingSubtitle', language)}</p>
    </div>
  );
}
