/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Palette, Check, Loader2, X, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocVisible } from '@/lib/use-doc-visible';

/**
 * DesignChoiceCard — Athena's IN-CHAT design choice (v0.0.24).
 *
 * Replaces the removed Design Studio modal. It renders INSIDE the terminal
 * message stream, after the current turn:
 *   - 2-6 dynamic options with real previews (SVG logo, palette, image,
 *     text/layout recipe);
 *   - a refinement box + suggestion chips ("warmer", "more minimal", …);
 *   - one pick OR one refinement, then the card disappears and the answer
 *     is injected as a normal user message.
 *
 * It never imposes a fixed catalog: every option comes from the event Athena
 * wrote for THIS task.
 */

interface DesignOption {
  id: string;
  label: string;
  description?: string;
  kind?: string;
  svg?: string;
  imageUrl?: string;
  colors?: Array<{ role: string; hex: string }>;
  text?: string;
}

interface PendingChoice {
  reviewId: string;
  god: string;
  taskContext: string;
  options: DesignOption[];
  suggestions: string[];
  allowRefine: boolean;
  project: string | null;
  ts: string;
}

interface Props {
  onAnswer: (followUp: string, reviewId: string) => void;
  conversationId?: string;
}

const KIND_COLORS: Record<string, string> = {
  logo: 'text-olympus-purple ring-olympus-purple/30',
  palette: 'text-olympus-cyan ring-olympus-cyan/30',
  layout: 'text-olympus-gold ring-olympus-gold/30',
  reference: 'text-olympus-green ring-olympus-green/30',
  component: 'text-olympus-amber-soft ring-olympus-amber-soft/30',
};

function svgDataUrl(svg: string): string {
  // `<img>` renders SVG in a sandboxed image context — no scripts execute.
  // `currentColor` does not inherit inside an <img>; resolve it to the
  // Olympus cream so a monochrome mark is visible on the dark card.
  const resolved = svg.replace(/currentColor/gi, '#E8E3D9');
  return `data:image/svg+xml;utf8,${encodeURIComponent(resolved)}`;
}

export default function DesignChoiceCard({ onAnswer, conversationId }: Props) {
  const docVisible = useDocVisible();
  const [choice, setChoice] = useState<PendingChoice | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/design-choice', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.ok && d.choice?.reviewId && !dismissed.has(d.choice.reviewId)) {
        setChoice(d.choice);
      } else if (d?.ok && !d.choice) {
        setChoice(null);
      }
    } catch { /* decorative */ }
  }, [dismissed]);

  useEffect(() => {
    if (!docVisible) return;
    load();
    const iv = setInterval(load, 2000);
    return () => clearInterval(iv);
  }, [docVisible, load]);

  const post = async (action: 'select' | 'refine', option?: DesignOption) => {
    if (!choice || busy) return;
    if (action === 'refine' && !instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/olympus/design-choice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: choice.reviewId,
          action,
          optionId: option?.id,
          instruction: action === 'refine' ? instruction.trim() : undefined,
          conversationId,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setDismissed((prev) => new Set(prev).add(choice.reviewId));
      setChoice(null);
      onAnswer(d.followUp, choice.reviewId);
    } catch (e: any) {
      setError(e?.message || 'failed to save the choice');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    if (!choice) return;
    setDismissed((prev) => new Set(prev).add(choice.reviewId));
    setChoice(null);
  };

  if (!choice) return null;

  return (
    <div className="my-2 rounded-lg border border-olympus-purple/30 bg-olympus-purple/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-olympus-purple/20 bg-olympus-purple/10">
        <Palette size={13} className="text-olympus-purple shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-olympus-purple">
          {choice.god.charAt(0).toUpperCase() + choice.god.slice(1)} · choose a direction
        </span>
        <span className="text-[9px] font-mono text-olympus-text-dim ml-1">{choice.options.length} options</span>
        <button
          onClick={dismiss}
          className="ml-auto w-5 h-5 rounded hover:bg-olympus-purple/20 flex items-center justify-center text-olympus-text-dim hover:text-olympus-purple transition-colors"
          aria-label="Dismiss"
        >
          <X size={11} />
        </button>
      </div>

      {choice.taskContext && (
        <div className="px-3 py-1.5 text-[10px] font-mono text-olympus-text-dim border-b border-olympus-purple/10 bg-olympus-bg/30">
          &ldquo;{choice.taskContext}&rdquo;
        </div>
      )}

      {/* Options */}
      <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {choice.options.map((o) => {
          const isSelected = selected === o.id;
          const kindClass = KIND_COLORS[o.kind ?? ''] ?? 'text-olympus-gold ring-olympus-gold/30';
          return (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              disabled={busy}
              className={cn(
                'text-left p-2 rounded-md border transition-all flex flex-col gap-1.5',
                isSelected
                  ? 'border-olympus-purple bg-olympus-purple/15 ring-1 ring-olympus-purple/40'
                  : 'border-olympus-gold/15 bg-olympus-card/60 hover:border-olympus-purple/40 hover:bg-olympus-purple/10',
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isSelected ? <Check size={11} className="text-olympus-purple shrink-0" /> : <Palette size={11} className="text-olympus-gold shrink-0" />}
                <span className="text-[11px] font-mono font-semibold text-olympus-text truncate">{o.label}</span>
                {o.kind && (
                  <span className={cn('text-[8px] font-mono px-1 py-0.5 rounded ring-1 shrink-0 ml-auto', kindClass)}>
                    {o.kind}
                  </span>
                )}
              </div>

              {/* Preview */}
              {o.svg ? (
                <div className="rounded bg-olympus-bg/60 ring-1 ring-white/10 flex items-center justify-center py-2">
                  <img src={svgDataUrl(o.svg)} alt={`${o.label} preview`} className="w-16 h-16 object-contain" />
                </div>
              ) : o.imageUrl ? (
                <div className="rounded bg-olympus-bg/60 ring-1 ring-white/10 overflow-hidden">
                  <img src={o.imageUrl} alt={`${o.label} preview`} className="w-full h-20 object-cover" />
                </div>
              ) : o.colors && o.colors.length > 0 ? (
                <div className="flex rounded overflow-hidden ring-1 ring-white/10 h-8">
                  {o.colors.slice(0, 8).map((c, i) => (
                    <div key={`${c.role}-${i}`} className="flex-1" style={{ background: c.hex }} data-tip={`${c.role} · ${c.hex}`} data-tip-side="bottom" />
                  ))}
                </div>
              ) : o.text ? (
                <pre className="text-[8.5px] font-mono text-olympus-text-dim bg-olympus-bg/60 rounded p-1.5 whitespace-pre-wrap break-words max-h-20 overflow-hidden">
                  {o.text}
                </pre>
              ) : null}

              {o.description && (
                <p className="text-[9px] font-mono text-olympus-text-dim leading-relaxed line-clamp-2">{o.description}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="px-2.5 pb-2.5 flex items-center gap-2">
        <button
          onClick={() => {
            const o = choice.options.find((x) => x.id === selected);
            if (o) void post('select', o);
          }}
          disabled={!selected || busy}
          className="flex items-center gap-1 rounded border border-olympus-purple/40 bg-olympus-purple/15 px-2.5 py-1 text-[10px] font-mono text-olympus-purple hover:bg-olympus-purple/25 disabled:opacity-40"
        >
          {busy && selected ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Use this
        </button>
        {choice.allowRefine && (
          <button
            onClick={() => setRefineOpen((v) => !v)}
            className="flex items-center gap-1 rounded border border-olympus-gold/25 bg-olympus-gold/5 px-2.5 py-1 text-[10px] font-mono text-olympus-gold hover:bg-olympus-gold/15"
          >
            <Sparkles size={10} />
            Ask Athena to change it
          </button>
        )}
        <span className="text-[8.5px] font-mono text-olympus-text-dim ml-auto">
          pick one, or refine with a prompt
        </span>
      </div>

      {/* Refine box */}
      {refineOpen && (
        <div className="border-t border-olympus-purple/15 bg-olympus-bg/30 px-2.5 py-2 space-y-1.5">
          {choice.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {choice.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInstruction(s)}
                  className="text-[8.5px] font-mono px-1.5 py-0.5 rounded ring-1 ring-olympus-gold/20 text-olympus-text-dim hover:text-olympus-gold hover:ring-olympus-gold/40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void post('refine'); }}
              placeholder="what should change? (e.g. warmer, simpler mark, more spacing)"
              className="flex-1 bg-olympus-card/50 border border-olympus-gold/15 rounded px-2 py-1 text-[10px] font-mono text-olympus-text outline-none focus:border-olympus-gold/40"
            />
            <button
              onClick={() => void post('refine')}
              disabled={!instruction.trim() || busy}
              className="flex items-center gap-1 rounded border border-olympus-gold/30 bg-olympus-gold/10 px-2 py-1 text-[9.5px] font-mono text-olympus-gold hover:bg-olympus-gold/20 disabled:opacity-40"
            >
              {busy ? <Loader2 size={9} className="animate-spin" /> : <Send size={9} />}
              Send
            </button>
          </div>
          <div className="text-[8px] font-mono text-olympus-text-dim">
            Athena generates NEW options from your instruction — it never re-sends the same three.
          </div>
        </div>
      )}

      {error && <div className="px-3 py-1.5 text-[9px] font-mono text-olympus-red border-t border-olympus-red/20">{error}</div>}
    </div>
  );
}
