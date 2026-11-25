'use client';

/**
 * status-brief-card.tsx — v0.1.0: "where is my project?" in one card.
 *
 * The user should never read a 100-line hop log to find the project,
 * generation, current hop, park, files and next action. The card reads
 * /api/olympus/status-brief (disk truth) and opens Apollo with the same
 * context already injected into his prompt.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, ChevronDown, ExternalLink, MapPin, MessageSquare, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Brief {
  project: string | null;
  lane: string | null;
  generation: number | null;
  completed: number;
  total: number;
  verdict: string;
  line: string;
  current: { hop: string; god?: string | null } | null;
  inFlight: string[];
  parked: { hopId: string; reason: string } | null;
  nextAction: string;
  previewUrl: string | null;
  design: { score: number | null; floor: number | null; target: number | null; source: string | null } | null;
  liveWalk: boolean;
  updatedAt: string;
}

export default function StatusBriefCard({ slug }: { slug?: string | null }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/olympus/status-brief${slug ? `?project=${encodeURIComponent(slug)}` : ''}`, { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setBrief(d.brief ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'status unavailable');
    }
  }, [slug]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (!brief && error) {
    return (
      <div className="mx-2 mt-1.5 rounded-lg border border-olympus-amber-soft/25 bg-olympus-amber-soft/5 px-2 py-1.5 text-[8px] font-mono text-olympus-amber-soft" data-testid="status-brief">
        status brief unavailable — {error}
      </div>
    );
  }
  if (!brief) return null;

  const tone = brief.parked ? 'text-olympus-red border-olympus-red/30 bg-olympus-red/5'
    : brief.verdict === 'DONE' ? 'text-olympus-green border-olympus-green/30 bg-olympus-green/5'
      : brief.liveWalk ? 'text-olympus-cyan border-olympus-cyan/25 bg-olympus-cyan/5'
        : 'text-olympus-gold border-olympus-gold/20 bg-olympus-gold/5';

  return (
    <div className={cn('mx-2 mt-1.5 rounded-lg border px-2 py-1.5', tone)} data-testid="status-brief">
      <div className="flex items-center gap-1.5">
        <MapPin size={10} className="shrink-0" />
        <span className="text-[8px] font-mono uppercase tracking-[0.16em]">where is the project</span>
        <span className="ml-auto rounded bg-black/20 px-1 py-0.5 text-[7px] font-mono">{brief.verdict}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Status brief details" className="rounded p-0.5 opacity-70 hover:opacity-100">
          <ChevronDown size={9} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>
      <p className="mt-0.5 truncate text-[9px] font-mono text-olympus-text" data-tip={brief.line}>
        {brief.project ?? 'no project'} · gen {brief.generation ?? '—'} · {brief.total > 0 ? `${brief.completed}/${brief.total}` : 'no plan'}
        {brief.current ? ` · now ${brief.current.hop}` : ''}
      </p>
      <p className={cn('truncate text-[8px] font-mono', brief.parked ? 'text-olympus-red' : 'text-olympus-text-dim')}>
        {brief.parked ? <><ShieldAlert size={8} className="mr-1 inline" />PARKED {brief.parked.hopId}: {brief.parked.reason}</> : brief.nextAction}
      </p>
      {open && (
        <div className="mt-1 space-y-0.5 border-t border-current/10 pt-1 text-[8px] font-mono text-olympus-text-dim">
          <div className="truncate" data-tip={brief.lane ?? ''}>files: {brief.lane ?? '—'}</div>
          {brief.previewUrl && <a href={brief.previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-olympus-gold hover:underline"><ExternalLink size={8} /> preview: {brief.previewUrl}</a>}
          {brief.design?.score != null && (
            <div>design: {brief.design.score}{brief.design.target != null ? ` / target ${brief.design.target}` : ''}{brief.design.floor != null ? ` / floor ${brief.design.floor}` : ''} · {brief.design.source ?? '—'}</div>
          )}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('olympus:open-god-chat', { detail: { god: 'apollo' } }))}
            className="mt-1 flex items-center gap-1 rounded border border-olympus-gold/30 bg-olympus-gold/10 px-1.5 py-0.5 text-olympus-gold hover:bg-olympus-gold/20"
          >
            <MessageSquare size={8} /> Ask Apollo about this project
          </button>
        </div>
      )}
    </div>
  );
}
