/**
 * global-tooltip.tsx — ONE portal tooltip for every `data-tip` (v0.0.24).
 *
 * THE SPECIMEN: the old global rule rendered `[data-tip]::after` with
 * `position:absolute; left:50%; max-width:256px` INSIDE an 8px-wide health
 * dot. An absolutely positioned box shrink-to-fits its containing block, so
 * every character wrapped onto its own line — the vertical "timeout after
 * 5000ms" the user saw on every MCP dot and god card.
 *
 * The fix is not another width override: a pseudo-element cannot escape a
 * scroll container, an overflow-hidden card, or a tiny positioned parent.
 * This component renders ONE tooltip into <body> with `position: fixed`,
 * delegated listeners, edge detection, and horizontal wrapping.
 *
 * Contract:
 *   - any element with `data-tip="text"` gets a tooltip;
 *   - `data-tip-side="top|bottom|left|right"` sets the preference;
 *   - 400ms delay, 120ms fade, pointer-events none, aria-hidden;
 *   - hides on scroll, pointerdown, blur, visibilitychange.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState } from 'react';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TipState {
  text: string;
  side: Side;
  x: number;
  y: number;
  visible: boolean;
}

const DELAY_MS = 400;
const GAP = 8;
const MAX_W = 320;

function place(rect: DOMRect, preferred: Side): { side: Side; x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let side = preferred;

  // Vertical flip.
  if (side === 'top' && rect.top < 56) side = 'bottom';
  else if (side === 'bottom' && vh - rect.bottom < 56) side = 'top';

  let x = rect.left + rect.width / 2;
  let y = side === 'bottom' ? rect.bottom + GAP : rect.top - GAP;

  // Horizontal flip for left/right.
  if (side === 'left' && rect.left < MAX_W + GAP) side = 'right';
  else if (side === 'right' && vw - rect.right < MAX_W + GAP) side = 'left';

  if (side === 'left') {
    x = rect.left - GAP;
    y = rect.top + rect.height / 2;
  } else if (side === 'right') {
    x = rect.right + GAP;
    y = rect.top + rect.height / 2;
  } else {
    // Clamp a centered top/bottom tip into the viewport.
    const half = MAX_W / 2;
    if (x - half < GAP) x = half + GAP;
    else if (x + half > vw - GAP) x = vw - half - GAP;
  }

  return { side, x, y };
}

function transformFor(side: Side): string {
  if (side === 'top') return 'translate(-50%, -100%)';
  if (side === 'bottom') return 'translate(-50%, 0)';
  if (side === 'left') return 'translate(-100%, -50%)';
  return 'translate(0, -50%)';
}

export default function GlobalTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const hide = () => {
      clearTimer();
      targetRef.current = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      if (!target) return;
      const text = target.getAttribute('data-tip')?.trim();
      if (!text) return;
      if (targetRef.current === target) return;
      clearTimer();
      targetRef.current = target;
      const preferred = (target.getAttribute('data-tip-side') as Side | null) || 'top';

      timerRef.current = setTimeout(() => {
        // The target may have left the DOM while the delay ran.
        if (!target.isConnected) return;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const { side, x, y } = place(rect, preferred);
        setTip({ text, side, x, y, visible: true });
      }, DELAY_MS);
    };

    const onOut = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      if (!target) return;
      if (targetRef.current === target) hide();
    };

    const onScroll = () => hide();
    const onDown = () => hide();
    const onVis = () => { if (document.hidden) hide(); };
    const onBlur = () => hide();

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    return () => {
      clearTimer();
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  if (!tip) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed z-[300] pointer-events-none rounded-md border border-olympus-gold/20 bg-olympus-card px-2.5 py-1.5 text-[10px] font-mono text-olympus-text shadow-md"
      style={{
        left: tip.x,
        top: tip.y,
        transform: transformFor(tip.side),
        width: 'max-content',
        maxWidth: `min(${MAX_W}px, calc(100vw - 16px))`,
        whiteSpace: 'normal',
        overflowWrap: 'break-word',
        lineHeight: 1.45,
        opacity: tip.visible ? 1 : 0,
        transition: 'opacity 120ms ease',
      }}
    >
      {tip.text}
    </div>
  );
}
