/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Palette, Check, Loader2, X, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocVisible } from '@/lib/use-doc-visible';
import { useProjectDesignSkin } from '@/lib/use-project-design-skin';
import { skinVars } from '@/lib/design-skin';

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
  recommended?: boolean;
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

function svgDataUrl(svg: string, color: string): string {
  // `<img>` renders SVG in a sandboxed image context — no scripts execute.
  // `currentColor` does not inherit inside an <img>; resolve it to the
  // project's text color so a monochrome mark belongs to this interface.
  const resolved = svg.replace(/currentColor/gi, color);
  return `data:image/svg+xml;utf8,${encodeURIComponent(resolved)}`;
}

export default function DesignChoiceCard({ onAnswer, conversationId }: Props) {
  const docVisible = useDocVisible();
  const [choice, setChoice] = useState<PendingChoice | null>(null);
  const skin = useProjectDesignSkin(choice?.project || '');
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
    <div
      className="my-2 border overflow-hidden"
      style={{
        ...skinVars(skin),
        borderColor: skin.border,
        background: skin.surface,
        borderRadius: skin.radius,
        fontFamily: skin.font ? `var(--athena-font), inherit` : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: skin.border, background: skin.accentSoft }}>
        <Palette size={13} className="shrink-0" style={{ color: skin.accent }} />
        <span className="text-[11px] font-mono font-semibold" style={{ color: skin.accent }}>
          {choice.god.charAt(0).toUpperCase() + choice.god.slice(1)} · choose a direction
        </span>
        <span className="text-[9px] font-mono text-olympus-text-dim ml-1">{choice.options.length} options</span>
        <button
          onClick={dismiss}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center text-olympus-text-dim transition-colors"
          aria-label="Dismiss"
          style={{ background: 'transparent' }}
        >
          <X size={11} />
        </button>
      </div>

      {choice.taskContext && (
        <div className="px-3 py-1.5 text-[10px] font-mono text-olympus-text-dim border-b" style={{ borderColor: skin.border, background: skin.elevated }}>
          &ldquo;{choice.taskContext}&rdquo;
        </div>
      )}

      {/* Options */}
      <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {choice.options.map((o) => {
          const isSelected = selected === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              disabled={busy}
              className={cn(
                'text-left p-2 rounded-md border transition-all flex flex-col gap-1.5',
                isSelected ? 'ring-1' : 'hover:brightness-110',
              )}
              style={{
                borderColor: isSelected ? skin.accent : skin.border,
                background: isSelected ? skin.accentSoft : skin.elevated,
                borderRadius: Math.min(12, skin.radius),
                boxShadow: isSelected ? `inset 0 0 0 1px ${skin.border}` : undefined,
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isSelected ? <Check size={11} className="shrink-0" style={{ color: skin.accent }} /> : <Palette size={11} className="shrink-0" style={{ color: skin.accent }} />}
                <span className="text-[11px] font-mono font-semibold text-olympus-text truncate">{o.label}</span>
                {o.recommended && (
                  <span className="text-[7px] font-mono px-1 py-0.5 rounded shrink-0 ml-auto" style={{ background: skin.accentSoft, color: skin.accent, boxShadow: `inset 0 0 0 1px ${skin.border}` }}>★ recommended</span>
                )}
                {o.kind && (
                  <span className={cn('text-[8px] font-mono px-1 py-0.5 rounded shrink-0', o.recommended ? '' : 'ml-auto')} style={{ color: skin.accent, boxShadow: `inset 0 0 0 1px ${skin.border}` }}>
                    {o.kind}
                  </span>
                )}
              </div>

              {/* Preview */}
              {o.svg ? (
                <div className="rounded bg-olympus-bg/60 ring-1 ring-white/10 flex items-center justify-center py-2">
                  <img src={svgDataUrl(o.svg, skin.text)} alt={`${o.label} preview`} className="w-16 h-16 object-contain" />
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
          className="flex items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-mono hover:brightness-110 disabled:opacity-40"
          style={{ borderColor: skin.border, background: skin.accentSoft, color: skin.accent }}
        >
          {busy && selected ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Use this
        </button>
        {choice.allowRefine && (
          <button
            onClick={() => setRefineOpen((v) => !v)}
            className="flex items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-mono hover:brightness-110"
            style={{ borderColor: skin.border, background: 'transparent', color: skin.text }}
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
        <div className="border-t px-2.5 py-2 space-y-1.5" style={{ borderColor: skin.border, background: skin.elevated }}>
          {choice.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {choice.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInstruction(s)}
                  className="text-[8.5px] font-mono px-1.5 py-0.5 rounded hover:brightness-110"
                  style={{ color: skin.text, boxShadow: `inset 0 0 0 1px ${skin.border}` }}
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
              className="flex-1 rounded px-2 py-1 text-[10px] font-mono text-olympus-text outline-none"
              style={{ background: skin.surface, border: `1px solid ${skin.border}`, borderRadius: Math.min(10, skin.radius) }}
            />
            <button
              onClick={() => void post('refine')}
              disabled={!instruction.trim() || busy}
              className="flex items-center gap-1 rounded border px-2 py-1 text-[9.5px] font-mono hover:brightness-110 disabled:opacity-40"
              style={{ borderColor: skin.border, background: skin.accentSoft, color: skin.accent }}
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
