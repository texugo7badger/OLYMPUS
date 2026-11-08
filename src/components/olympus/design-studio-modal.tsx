'use client';

/**
 * design-studio-modal.tsx — v0.0.91: design lives in Athena's chat.
 *
 * The user asked for the design surface to stop being an ArtCraft tab and
 * become part of the conversation with Athena. This modal is the first
 * version of that move: the same style board and build recipes, opened from
 * her chat, next to the live preview and the mark flow.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useState } from 'react';
import { Palette, Sparkles, X } from 'lucide-react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';
import { cn } from '@/lib/utils';
import ArtcraftStyleBoard from './artcraft-style-board';
import DesignBuildsPanel from './design-builds-panel';

type StudioTab = 'style' | 'builds';

export default function DesignStudioModal({ onClose }: { onClose: () => void }) {
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const [tab, setTab] = useState<StudioTab>('style');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-3"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="Athena design studio"
        className="flex h-[82vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{ background: palette.panel, borderColor: `${palette.gold}44`, color: palette.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: `${palette.gold}22` }}>
          <Sparkles size={14} style={{ color: palette.gold }} />
          <span className="text-[12px] font-mono font-semibold" style={{ color: palette.gold }}>Athena design studio</span>
          <span className="text-[9px] font-mono" style={{ color: palette.textDim }}>· design is a conversation</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('style')}
              className={cn('flex items-center gap-1 rounded px-2 py-1 text-[9px] font-mono uppercase tracking-wide', tab === 'style' ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30' : 'text-olympus-text-dim hover:text-olympus-gold')}
            >
              <Palette size={10} /> style
            </button>
            <button
              type="button"
              onClick={() => setTab('builds')}
              className={cn('flex items-center gap-1 rounded px-2 py-1 text-[9px] font-mono uppercase tracking-wide', tab === 'builds' ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30' : 'text-olympus-text-dim hover:text-olympus-gold')}
            >
              <Sparkles size={10} /> builds
            </button>
            <button onClick={onClose} aria-label="Close the design studio" className="ml-1 p-1" style={{ color: palette.textDim }}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {tab === 'style' ? (
            <ArtcraftStyleBoard references={[]} pendingRef={null} onPendingConsumed={() => { /* no pending ref in the studio yet */ }} />
          ) : (
            <DesignBuildsPanel />
          )}
        </div>
      </div>
    </div>
  );
}
