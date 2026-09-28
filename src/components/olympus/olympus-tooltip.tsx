/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState, useLayoutEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * OlympusTooltip — minimalist Olympus-styled tooltip with edge detection.
 *
 * EDGE DETECTION:
 *   Tooltips now automatically flip/adjust when near the viewport edge.
 *   - If a 'top' tooltip would go off the top of the screen, it flips to 'bottom'.
 *   - If a 'bottom' tooltip would go off the bottom, it flips to 'top'.
 *   - If a 'left' tooltip would go off the left, it flips to 'right'.
 *   - If a 'right' tooltip would go off the right, it flips to 'left'.
 *   - For top/bottom tooltips, if the horizontal center would cause the
 *     tooltip to overflow left/right, the X position is clamped so the
 *     tooltip stays fully visible.
 *
 * Style (Olympus):
 *   - Solid `bg-olympus-card` background (#121826)
 *   - Hairline `border-olympus-gold/20` border
 *   - Flat `shadow-md` (no glow)
 *   - `font-mono` text, `text-[10px]`
 *   - `text-olympus-text` color (#B8B8B8)
 *   - `pointer-events-none` so it never steals clicks
 *   - 400ms delay (only fires on intentional hover, not quick traversal)
 */

type Side = 'top' | 'bottom' | 'left' | 'right';

interface OlympusTooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: Side;
  delay?: number; // ms — default 400
  className?: string;
  /** Disable the tooltip entirely (e.g. when content is empty). */
  disabled?: boolean;
}

export default function OlympusTooltip({
  children,
  content,
  side = 'top',
  delay = 400,
  className,
  disabled = false,
}: OlympusTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number; side: Side } | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleEnter = (e: React.MouseEvent) => {
    if (disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Compute position with edge detection.
      const pad = 8;
      const tooltipMaxWidth = 256; // max-w-64 = 16rem = 256px
      const tooltipMaxHeight = 80; // approximate max height for 2-3 lines
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let actualSide = side;
      let x = rect.left + rect.width / 2;
      let y = rect.top;

      // --- Vertical edge detection ---
      if (side === 'top') {
        // If there's not enough space above, flip to bottom.
        if (rect.top < tooltipMaxHeight + pad) {
          actualSide = 'bottom';
          y = rect.bottom + pad;
        } else {
          y = rect.top - pad;
        }
      } else if (side === 'bottom') {
        // If there's not enough space below, flip to top.
        if (vh - rect.bottom < tooltipMaxHeight + pad) {
          actualSide = 'top';
          y = rect.top - pad;
        } else {
          y = rect.bottom + pad;
        }
      }

      // --- Horizontal edge detection (for top/bottom tooltips) ---
      if (actualSide === 'top' || actualSide === 'bottom') {
        // The tooltip is centered on x. If it would overflow left or right,
        // shift x so the tooltip stays fully visible.
        const halfWidth = tooltipMaxWidth / 2;
        if (x - halfWidth < pad) {
          // Would overflow left — clamp to left edge.
          x = halfWidth + pad;
        } else if (x + halfWidth > vw - pad) {
          // Would overflow right — clamp to right edge.
          x = vw - halfWidth - pad;
        }
      }

      // --- Horizontal edge detection (for left/right tooltips) ---
      if (side === 'left') {
        if (rect.left < tooltipMaxWidth + pad) {
          actualSide = 'right';
          x = rect.right + pad;
        } else {
          x = rect.left - pad;
        }
        y = rect.top + rect.height / 2;
      } else if (side === 'right') {
        if (vw - rect.right < tooltipMaxWidth + pad) {
          actualSide = 'left';
          x = rect.left - pad;
        } else {
          x = rect.right + pad;
        }
        y = rect.top + rect.height / 2;
      }

      setCoords({ x, y, side: actualSide });
      setVisible(true);
    }, delay);
  };

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setCoords(null);
  };

  // Compute transform so the tooltip is anchored correctly per side.
  const transform = (() => {
    if (!coords) return '';
    if (coords.side === 'top') return 'translate(-50%, -100%)';
    if (coords.side === 'bottom') return 'translate(-50%, 0)';
    if (coords.side === 'left') return 'translate(-100%, -50%)';
    return 'translate(0, -50%)';
  })();

  return (
    <div
      ref={containerRef}
      className="inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseDown={handleLeave}
    >
      {children}
      {visible && coords && content != null && (
        <div
          ref={tooltipRef}
          className={cn(
            'fixed z-[200] bg-olympus-card border border-olympus-gold/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono pointer-events-none shadow-md max-w-64 text-olympus-text',
            className,
          )}
          style={{ left: coords.x, top: coords.y, transform }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
