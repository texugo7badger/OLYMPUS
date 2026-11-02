/**
 * reference-preview.tsx — v0.0.34: the component-only preview.
 *
 * The reference cards NEVER embed the vendor page anymore (its chrome, login
 * banner and "limited in sections" modal leaked into the card). This canvas
 * renders an original interactive study of the component, in the active
 * theme, and stops its RAF when the card leaves the viewport.
 *
 * With the full 860+ catalog, mounting a canvas per row would be wasteful:
 * the preview mounts only when the card is within 600px of the viewport and
 * unmounts when it leaves, so memory stays flat while scrolling.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';
import { PreviewEngine } from '@/lib/reference-preview-engine';
import type { PreviewKind } from '@/lib/reference-previews';
import { cn } from '@/lib/utils';

export default function ReferencePreview({
  referenceId,
  label,
  variant,
  kind,
  className,
}: {
  referenceId: string;
  label: string;
  variant: string;
  kind?: PreviewKind;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [theme] = useTheme();
  const palette = useMemo(() => resolvePalette(theme), [theme]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      setActive(entries.some((e) => e.isIntersecting));
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: PreviewEngine | null = null;
    try {
      engine = new PreviewEngine(canvas, {
        referenceId,
        label,
        variant,
        kind,
        palette,
        stable: theme.motion === 'stable',
      });
      engine.start();
    } catch {
      // Canvas2D unavailable — the CSS gradient behind the canvas remains.
    }
    return () => engine?.stop();
  }, [active, referenceId, label, variant, kind, palette, theme.motion]);

  return (
    <div
      ref={wrapRef}
      className={cn('relative w-full h-full overflow-hidden bg-olympus-bg/30', className)}
      style={{ backgroundImage: 'radial-gradient(circle at 28% 18%, color-mix(in srgb, var(--olympus-gold) 10%, transparent) 0%, transparent 58%)' }}
    >
      {active ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'pan-y' }}
          role="img"
          aria-label={`${label} interactive preview`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="w-8 h-8 rounded-full border border-olympus-gold/20 bg-olympus-gold/5" />
        </div>
      )}
    </div>
  );
}
