/**
 * support-button.tsx — v0.0.78: a discreet way to buy the maintainer a coffee.
 *
 * One small cup in the status bar. It never interrupts, never nags and never
 * appears in the middle of a task: a click opens a two-link popover (Ko-fi and
 * PIX), a click outside closes it. The links open in the system browser
 * (Electron's window-open handler).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Coffee } from 'lucide-react';

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Support the dev"
        aria-expanded={open}
        data-tip="Support the dev — a coffee keeps the cauldron bubbling"
        className="flex items-center text-olympus-text-dim hover:text-olympus-gold transition-colors"
      >
        <Coffee size={11} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Support the dev"
          className="absolute bottom-full right-0 mb-1 w-52 rounded-lg border border-olympus-gold/25 bg-olympus-panel p-2 shadow-xl"
        >
          <p className="mb-1.5 text-[9px] font-mono uppercase tracking-wide text-olympus-gold">Support the dev</p>
          <a
            href="https://ko-fi.com/G4H521S5GK"
            target="_blank"
            rel="noreferrer"
            className="block rounded px-1.5 py-1 text-[10px] font-mono text-olympus-text hover:bg-olympus-gold/10"
          >
            Buy me a coffee
          </a>
          <a
            href="https://livepix.gg/texugo7badger"
            target="_blank"
            rel="noreferrer"
            className="block rounded px-1.5 py-1 text-[10px] font-mono text-olympus-text hover:bg-olympus-gold/10"
          >
            Doe via PIX
          </a>
        </div>
      )}
    </div>
  );
}
