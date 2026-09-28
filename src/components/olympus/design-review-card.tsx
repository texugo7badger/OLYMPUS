/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Palette, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DesignReviewCard — renders inline in the Apollo chat when Athena surfaces
 * design-system candidates for the user to review.
 *
 * When Athena calls the
 * `olympus-design-review` tool, the tool writes an event to live.jsonl.
 * The interactive-terminal.tsx (Apollo chat) watches for this event and
 * renders this card inline. The user sees:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  🎨 Athena found 3 design systems for your task       │
 *   │  "Build a SaaS dashboard with a sidebar layout"       │
 *   │                                                       │
 *   │  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
 *   │  │ Linear  │  │ Stripe  │  │ Vercel  │               │
 *   │  │ SaaS    │  │ Payments│  │ DevTool │               │
 *   │  │ Select → │  │ Select → │  │ Select → │               │
 *   │  └─────────┘  └─────────┘  └─────────┘               │
 *   │                                                       │
 *   │  Click a design system to proceed, or type your own. │
 *   └──────────────────────────────────────────────────────┘
 *
 * When the user clicks a candidate:
 *   1. The card calls POST /api/olympus/design-review with the selection
 *   2. The API writes a "design-review-selected" event to live.jsonl
 *   3. The card injects "I selected [name]. Please proceed with this design
 *      reference." into the Apollo chat input + auto-sends
 *   4. Athena picks up the message and proceeds with the selected system
 *
 * The card dismisses itself after a selection is made.
 */

interface DesignCandidate {
  name: string;
  description: string;
  category?: string | null;
}

interface DesignReview {
  reviewId: string;
  god: string;
  taskContext: string;
  candidates: DesignCandidate[];
  ts: string;
}

interface DesignReviewCardProps {
  /** Called when the user selects a candidate. The parent (interactive-terminal)
   * uses this to inject the selection into the chat input + auto-send. */
  onSelect: (selection: string, reviewId: string) => void;
  /** Called when the user dismisses the card without selecting. */
  onDismiss: (reviewId: string) => void;
}

export default function DesignReviewCard({ onSelect, onDismiss }: DesignReviewCardProps) {
  const [review, setReview] = useState<DesignReview | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const loadReview = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/design-review', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d.ok && d.review && d.review.reviewId) {
        // Don't show if already dismissed
        if (!dismissedIds.has(d.review.reviewId)) {
          setReview(d.review);
        }
      } else {
        // No pending review — clear if the current one was resolved
        setReview(prev => {
          if (prev && !dismissedIds.has(prev.reviewId)) {
            // The review was resolved (selected) — dismiss it
            return null;
          }
          return prev;
        });
      }
    } catch {}
  }, [dismissedIds]);

  // Poll for pending design reviews every 2 seconds.
  // This is lightweight — the API just tails live.jsonl.
  useEffect(() => {
    loadReview();
    const iv = setInterval(loadReview, 2000);
    return () => clearInterval(iv);
  }, [loadReview]);

  const handleSelect = async (candidate: DesignCandidate) => {
    if (!review || selecting) return;
    setSelecting(candidate.name);
    try {
      await fetch('/api/olympus/design-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.reviewId, selection: candidate.name }),
      });
    } catch {}
    // Notify the parent to inject the selection into the chat
    onSelect(candidate.name, review.reviewId);
    // Dismiss this card
    setDismissedIds(prev => new Set(prev).add(review.reviewId));
    setReview(null);
    setSelecting(null);
  };

  const handleDismiss = () => {
    if (!review) return;
    onDismiss(review.reviewId);
    setDismissedIds(prev => new Set(prev).add(review.reviewId));
    setReview(null);
  };

  if (!review) return null;

  return (
    <div className="my-2 rounded-lg border border-olympus-purple/30 bg-olympus-purple/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-olympus-purple/20 bg-olympus-purple/10">
        <Palette size={13} className="text-olympus-purple shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-olympus-purple">
          {review.god.charAt(0).toUpperCase() + review.god.slice(1)} found {review.candidates.length} design systems for your task
        </span>
        <button
          onClick={handleDismiss}
          className="ml-auto w-5 h-5 rounded hover:bg-olympus-purple/20 flex items-center justify-center text-olympus-text-dim hover:text-olympus-purple transition-colors"
          aria-label="Dismiss"
        >
          <X size={11} />
        </button>
      </div>

      {/* Task context */}
      {review.taskContext && (
        <div className="px-3 py-1.5 text-[10px] font-mono text-olympus-text-dim border-b border-olympus-purple/10 bg-olympus-bg/30">
          &ldquo;{review.taskContext}&rdquo;
        </div>
      )}

      {/* Candidate cards */}
      <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {review.candidates.map((candidate, i) => (
          <button
            key={`${candidate.name}-${i}`}
            onClick={() => handleSelect(candidate)}
            disabled={!!selecting}
            className={cn(
              'text-left p-2 rounded-md border transition-all',
              selecting === candidate.name
                ? 'border-olympus-purple bg-olympus-purple/20'
                : 'border-olympus-gold/15 bg-olympus-card/60 hover:border-olympus-purple/40 hover:bg-olympus-purple/10',
              selecting && selecting !== candidate.name && 'opacity-40',
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {selecting === candidate.name ? (
                <Check size={11} className="text-olympus-purple shrink-0" />
              ) : (
                <Palette size={11} className="text-olympus-gold shrink-0" />
              )}
              <span className="text-[11px] font-mono font-semibold text-olympus-text truncate">
                {candidate.name}
              </span>
              {candidate.category && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold shrink-0">
                  {candidate.category}
                </span>
              )}
            </div>
            <p className="text-[9px] font-mono text-olympus-text-dim leading-relaxed line-clamp-2">
              {candidate.description}
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[8px] font-mono text-olympus-purple">
              {selecting === candidate.name ? (
                <>
                  <Loader2 size={8} className="animate-spin" />
                  <span>Selected</span>
                </>
              ) : (
                <span>Select &rarr;</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 text-[9px] font-mono text-olympus-text-dim border-t border-olympus-purple/10 bg-olympus-bg/20">
        Click a design system to proceed, or type your own preference in the chat below.
      </div>
    </div>
  );
}
