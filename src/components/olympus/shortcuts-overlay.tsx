/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Shortcuts Overlay — minimalist refactor.                            */
/*                                                                     */
/* impeccable `distill` pass:                                          */
/*   - Removed the "Command Palette" category (palette was deleted).   */
/*   - Removed "Focus Prompt Apollo bar" (prompt bar was removed in    */
/*     an earlier refactor).                                           */
/*   - Two categories remain: Global (3 shortcuts) + Brain Graph.      */
/*   - Dropped the glassy `backdrop-blur-sm` + heavy gold shadow on    */
/*     the dialog itself — solid bg + hairline border.                 */
/* ------------------------------------------------------------------ */

const SHORTCUTS = [
  { keys: ['/'], desc: 'Focus fuzzy search', category: 'global' },
  { keys: ['?'], desc: 'Toggle this shortcuts overlay', category: 'global' },
  { keys: ['Esc'], desc: 'Close overlay', category: 'global' },
  { keys: ['Click'], desc: 'Select node → open detail panel', category: 'graph' },
  { keys: ['Scroll'], desc: 'Zoom 3D graph', category: 'graph' },
  { keys: ['Right-drag'], desc: 'Orbit camera (rotate)', category: 'graph' },
  { keys: ['Drag node'], desc: 'Pin node to position', category: 'graph' },
];

const CATEGORIES: Record<string, { label: string; color: string }> = {
  global: { label: 'Global', color: 'text-olympus-gold' },
  graph: { label: '3D Brain Graph', color: 'text-olympus-cyan' },
};

export default function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-180 flex items-center justify-center bg-black/60 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-olympus-card border border-olympus-gold/25 rounded-lg shadow-md overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-olympus-gold/15">
          <div className="flex items-center gap-2">
            <Keyboard size={15} className="text-olympus-gold" />
            <span className="text-sm font-semibold text-olympus-gold">Keyboard Shortcuts</span>
          </div>
          <button onClick={onClose} className="text-olympus-text-dim hover:text-olympus-text" aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 max-h-[60vh] overflow-y-auto custom-scroll">
          {(Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).map(cat => (
            <div key={cat} className="mb-3">
              <div className={cn('text-[10px] font-mono uppercase tracking-wider mb-1.5', CATEGORIES[cat].color)}>
                {CATEGORIES[cat].label}
              </div>
              {SHORTCUTS.filter(s => s.category === cat).map(s => (
                <div key={s.desc} className="flex items-center justify-between py-1.5 border-b border-olympus-gold/5">
                  <span className="text-[11px] text-olympus-text-dim">{s.desc}</span>
                  <div className="flex items-center gap-0.5">
                    {s.keys.map((k, i) => (
                      <kbd key={i} className="text-[9px] font-mono text-olympus-gold px-1.5 py-0.5 rounded border border-olympus-gold/20 bg-olympus-bg/70 min-w-[20px] text-center">
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="px-5 py-2.5 border-t border-olympus-gold/10 text-[9px] font-mono text-[#5A5A5A] flex justify-between">
          <span>press <kbd className="text-olympus-gold">?</kbd> anywhere to toggle</span>
          <span>Olympus v0.0.1</span>
        </div>
      </div>
    </div>
  );
}
