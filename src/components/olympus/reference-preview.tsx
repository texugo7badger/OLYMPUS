/**
 * reference-preview.tsx — v0.0.34: the component-only preview.
 *
 * The reference cards NEVER embed the vendor page anymore (its chrome, login
 * banner and "limited in sections" modal leaked into the card). This canvas
 * renders an original interactive study of the component, in the active
 * theme, and stops its RAF when the card leaves the viewport.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';
import { PreviewEngine } from '@/lib/reference-preview-engine';
import { cn } from '@/lib/utils';

export default function ReferencePreview({
  referenceId,
  label,
  variant,
  className,
}: {
  referenceId: string;
  label: string;
  variant: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme] = useTheme();
  const palette = useMemo(() => resolvePalette(theme), [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: PreviewEngine | null = null;
    try {
      engine = new PreviewEngine(canvas, {
        referenceId,
        label,
        variant,
        palette,
        stable: theme.motion === 'stable',
      });
      engine.start();
    } catch {
      // Canvas2D unavailable — the CSS gradient behind the canvas remains.
    }
    return () => engine?.stop();
  }, [referenceId, label, variant, palette, theme.motion]);

  return (
    <div
      className={cn('relative w-full h-full overflow-hidden bg-olympus-bg/30', className)}
      style={{ backgroundImage: 'radial-gradient(circle at 28% 18%, color-mix(in srgb, var(--olympus-gold) 10%, transparent) 0%, transparent 58%)' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={`${label} interactive preview`}
      />
    </div>
  );
}
