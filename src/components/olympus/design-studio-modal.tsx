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

import { useEffect, useState } from 'react';
import { ClipboardCheck, Palette, Sparkles, X } from 'lucide-react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';
import { useOlympus } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';
import ArtcraftStyleBoard from './artcraft-style-board';
import DesignBuildsPanel from './design-builds-panel';

type StudioTab = 'style' | 'builds' | 'contract';

export default function DesignStudioModal({ onClose }: { onClose: () => void }) {
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const activeProject = useOlympus((s) => s.activeProject);
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
            <button
              type="button"
              onClick={() => setTab('contract')}
              className={cn('flex items-center gap-1 rounded px-2 py-1 text-[9px] font-mono uppercase tracking-wide', tab === 'contract' ? 'bg-olympus-cyan/15 text-olympus-cyan ring-1 ring-olympus-cyan/30' : 'text-olympus-text-dim hover:text-olympus-cyan')}
            >
              <ClipboardCheck size={10} /> contract
            </button>
            <button onClick={onClose} aria-label="Close the design studio" className="ml-1 p-1" style={{ color: palette.textDim }}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {tab === 'style' ? (
            <ArtcraftStyleBoard references={[]} pendingRef={null} onPendingConsumed={() => { /* no pending ref in the studio yet */ }} />
          ) : tab === 'builds' ? (
            <DesignBuildsPanel />
          ) : (
            <ContractPanel slug={activeProject?.slug || ''} />
          )}
        </div>
      </div>
    </div>
  );
}

interface ContractPage {
  route: string;
  file: string;
  priority: 'P0' | 'P1' | 'P2';
  status: 'pending' | 'decided';
  purpose?: string;
}

interface ContractPayload {
  ok: boolean;
  exists: boolean;
  contract: {
    pages: ContractPage[];
    unknowns: Array<{ id: string; severity: string; question: string; page?: string }>;
    tokens: Record<string, string | undefined>;
    stops: Array<{ id: string; page: string; requiresUserApproval: boolean }>;
  };
  validation: { ok: boolean; reasons: string[] };
  prompt: string;
}

function ContractPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<ContractPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/olympus/design-contract?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [slug]);

  const generate = async () => {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/olympus/design-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, generate: true }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData((prev) => prev ? { ...prev, exists: true, contract: d.contract, validation: d.validation, prompt: d.prompt } : prev);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data?.prompt || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  if (!slug) {
    return <div className="p-6 text-[11px] font-mono text-olympus-text-dim">Open a project to build its design contract.</div>;
  }
  if (!data && busy) {
    return <div className="p-6 text-[11px] font-mono text-olympus-text-dim">reading the page map…</div>;
  }
  if (error) {
    return <div className="p-6 text-[11px] font-mono text-olympus-red">{error}</div>;
  }

  const v = data?.validation;
  const pages = data?.contract.pages || [];
  const decided = pages.filter((p) => p.status === 'decided').length;
  const unknowns = data?.contract.unknowns || [];

  return (
    <div className="h-full overflow-y-auto custom-scroll p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 text-[9px] font-mono uppercase tracking-wide ring-1', v?.ok ? 'text-olympus-green bg-olympus-green/10 ring-olympus-green/30' : 'text-olympus-red bg-olympus-red/10 ring-olympus-red/30')}>
          {v?.ok ? 'READY' : 'BLOCKED'}
        </span>
        <span className="text-[9px] font-mono text-olympus-text-dim">{data?.exists ? 'contract on disk' : 'default page map — not saved yet'}</span>
        <span className="text-[9px] font-mono text-olympus-text-dim">· {decided}/{pages.length} pages decided</span>
        <span className="text-[9px] font-mono text-olympus-text-dim">· {data?.contract.stops.length || 0} design stops</span>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="ml-auto rounded border border-olympus-cyan/30 bg-olympus-cyan/10 px-2 py-1 text-[9px] font-mono uppercase tracking-wide text-olympus-cyan hover:bg-olympus-cyan/20 disabled:opacity-40"
        >
          {busy ? 'working…' : 'generate page map'}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded border border-olympus-gold/30 bg-olympus-gold/10 px-2 py-1 text-[9px] font-mono uppercase tracking-wide text-olympus-gold hover:bg-olympus-gold/20"
        >
          {copied ? 'copied' : 'copy Athena brief'}
        </button>
      </div>

      {v && !v.ok && (
        <ul className="mt-3 space-y-1 text-[10px] font-mono text-olympus-red/90">
          {v.reasons.map((r) => <li key={r}>· {r}</li>)}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {pages.map((p) => (
          <div key={p.route} className="flex items-center gap-2 rounded border border-olympus-gold/10 bg-olympus-card/50 px-2 py-1.5">
            <span className={cn('rounded px-1 py-0.5 text-[7px] font-mono', p.priority === 'P0' ? 'bg-olympus-red/15 text-olympus-red' : p.priority === 'P1' ? 'bg-olympus-gold/15 text-olympus-gold' : 'bg-olympus-text-dim/10 text-olympus-text-dim')}>{p.priority}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] font-mono text-olympus-text">{p.route}</span>
            <span className={cn('text-[8px] font-mono', p.status === 'decided' ? 'text-olympus-green' : 'text-olympus-amber-soft')}>{p.status}</span>
          </div>
        ))}
      </div>

      {unknowns.length > 0 && (
        <div className="mt-4">
          <div className="text-[9px] font-mono uppercase tracking-wide text-olympus-red">open unknowns</div>
          <ul className="mt-1 space-y-1">
            {unknowns.slice(0, 10).map((u) => (
              <li key={u.id} className="text-[10px] font-mono text-olympus-text-dim">· <span className="text-olympus-red">{u.severity}</span> {u.page ? `${u.page}: ` : ''}{u.question}</li>
            ))}
          </ul>
        </div>
      )}

      <pre className="mt-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-olympus-gold/10 bg-olympus-bg/60 p-2 text-[9px] leading-relaxed font-mono text-olympus-text-dim">{data?.prompt || 'No contract yet.'}</pre>
    </div>
  );
}
