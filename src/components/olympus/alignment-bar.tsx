/**
 * alignment-bar.tsx — v0.0.80: how clear the project is, and the fast preview.
 *
 * Five signals, each with its evidence (goal, audience, stack, style, plan).
 * At 70+ the user can ask for a fast preview — an explicit click, a bounded
 * Athena turn, one static page. No automatic spend, no hidden generation.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2, ExternalLink, Copy } from 'lucide-react';

interface Signal { id: string; label: string; score: number; max: number; evidence: string }
interface Alignment { project: string; score: number; ready: boolean; signals: Signal[]; missing: string[] }

export default function AlignmentBar({ slug }: { slug: string }) {
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/olympus/project/alignment?project=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) setAlignment(d.alignment);
    } catch { /* the bar is additive */ }
  }, [slug]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const generate = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/olympus/preview/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: slug }),
      });
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setUrl(d.url);
      void load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }, [slug, load]);

  if (!alignment) return null;
  const pct = Math.max(0, Math.min(100, alignment.score));

  return (
    <div className="w-full rounded-lg border border-olympus-gold/15 bg-olympus-panel/60 px-2 py-1.5" data-tip={alignment.signals.map((s) => `${s.label}: ${s.evidence}`).join('\n')}>
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">alignment</span>
        <span className="text-[9px] font-mono font-semibold text-olympus-gold tabular-nums">{pct}%</span>
        <div className="flex items-center gap-0.5">
          {alignment.signals.map((s) => (
            <span
              key={s.id}
              data-tip={`${s.label}: ${s.evidence}`}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: s.score >= s.max ? '#9CC48E' : s.score > 0 ? '#E8A45C' : '#4A4A4A' }}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {!url && (
            <button
              onClick={() => void generate()}
              disabled={busy || !alignment.ready}
              data-tip={alignment.ready ? 'Generate a fast static preview (one bounded Athena turn)' : `Not ready — missing: ${alignment.missing.join(', ')}`}
              className="flex items-center gap-1 rounded bg-olympus-gold/12 px-1.5 py-0.5 text-[8.5px] font-mono text-olympus-gold ring-1 ring-olympus-gold/25 disabled:opacity-35"
            >
              {busy ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
              {busy ? 'generating…' : 'preview'}
            </button>
          )}
          {url && (
            <>
              <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded bg-olympus-green/12 px-1.5 py-0.5 text-[8.5px] font-mono text-olympus-green ring-1 ring-olympus-green/25">
                <ExternalLink size={9} /> open
              </a>
              <button
                onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false)); }}
                data-tip="Copy the preview link"
                className="rounded px-1 py-0.5 text-[8.5px] font-mono text-olympus-text-dim hover:text-olympus-gold"
              >
                <Copy size={9} /> {copied ? '✓' : ''}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-olympus-bg">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: alignment.ready ? '#9CC48E' : '#E8A45C', transition: 'width .4s ease' }} />
      </div>
      {!alignment.ready && (
        <p className="mt-0.5 text-[7.5px] font-mono text-olympus-text-dim">missing: {alignment.missing.join(', ')}</p>
      )}
      {error && <p className="mt-0.5 text-[8px] font-mono text-olympus-red">{error}</p>}
    </div>
  );
}
