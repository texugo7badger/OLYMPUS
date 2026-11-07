/**
 * MobileParthenon — v0.0.89: the command deck, one thumb away.
 *
 * The phone gets the same always-on Atlas as the desktop: health, the single
 * decision (continue AIME / start another project), Apollo and Atlas quick
 * actions, and the staged-plan apply. The decision card appears on its own
 * when the warden has one, even before the sheet is opened.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight, Check, CirclePause, CirclePlay, MessageSquare, Orbit, Plus,
  ShieldAlert, Sparkles, Sun, X, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

type Health = {
  verdict?: string; line?: string; reasons?: string[]; completed?: number; total?: number;
  running?: number; nextPlan?: { added: number; removed: number; changed: number } | null;
  parked?: { hopId: string; reason: string } | null;
} | null | undefined;

type Decision = {
  id: string; slug: string; message: string; hopId: string | null; reason: string;
};

type Warden = { active: boolean; model: string; lastAction: { slug: string; action: string; detail: string } | null };

interface Props {
  open: boolean;
  health: Health;
  active: string | null;
  onClose: () => void;
  onAsk: (text: string) => void;
  onNewProject: () => void;
  onChanged?: () => void;
}

export default function MobileParthenon({ open, health, active, onClose, onAsk, onNewProject, onChanged }: Props) {
  const [warden, setWarden] = useState<Warden | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/atlas/warden', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setWarden(d?.state ?? null);
      setDecision(d?.decision ?? null);
    } catch { /* the sheet still shows the health */ }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(iv);
  }, [load]);

  const post = useCallback(async (action: 'continue' | 'new-project' | 'dismiss') => {
    setBusy(action);
    try {
      const r = await fetch('/api/olympus/atlas/warden', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, slug: active }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      if (action === 'new-project') { setDecision(null); onClose(); onNewProject(); }
      else if (action === 'continue') {
        toast.success(active ? `${active} is walking again` : 'Walk resumed', { description: 'Auto-resume is on; Atlas handles the next park.' });
        setDecision(null); onClose();
      } else { setDecision(null); }
      await load(); onChanged?.();
    } catch (e: any) {
      toast.error('Atlas could not act', { description: e?.message || String(e) });
    } finally { setBusy(null); }
  }, [active, load, onChanged, onClose, onNewProject]);

  const pause = useCallback(async () => {
    if (!active) return;
    setBusy('pause');
    try {
      const r = await fetch('/api/olympus/walk/supervisor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', slug: active }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      toast.success('Walk paused', { description: 'The campaign is safe on disk.' });
      await load(); onChanged?.();
    } catch (e: any) { toast.error('Pause failed', { description: e?.message || String(e) }); }
    finally { setBusy(null); }
  }, [active, load, onChanged]);

  const applyNext = useCallback(async () => {
    if (!active || !health?.nextPlan) return;
    setBusy('apply');
    try {
      const r = await fetch('/api/olympus/walk/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: active, action: 'apply' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      toast.success('Next generation applied', { description: `Generation ${d.generation ?? '?'} is active.` });
      await load(); onChanged?.();
    } catch (e: any) { toast.error('Apply failed', { description: e?.message || String(e) }); }
    finally { setBusy(null); }
  }, [active, health?.nextPlan, load, onChanged]);

  const verdict = health?.verdict ?? 'PAUSED';
  const live = (health?.running ?? 0) > 0 || verdict === 'HEALTHY';
  const atlasTone = verdict === 'NEEDS-YOU' || verdict === 'BLOCKED' ? 'text-olympus-red'
    : verdict === 'DEGRADED' ? 'text-olympus-gold' : 'text-olympus-green';
  const atlasLabel = verdict === 'NEEDS-YOU' ? 'needs you'
    : verdict === 'BLOCKED' ? 'recovering'
      : verdict === 'DEGRADED' ? 'patrolling'
        : verdict === 'DONE' ? 'all clear' : live ? 'patrolling' : 'ready';

  // The one decision, even before the sheet is opened.
  if (decision && !open) {
    return (
      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[60] rounded-2xl border border-olympus-red/40 bg-olympus-panel p-3 shadow-2xl" role="alert">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-olympus-red">
          <ShieldAlert size={12} /> Needs your call
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-olympus-text">{decision.message}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button" disabled={!!busy} onClick={() => void post('continue')}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-olympus-green/40 bg-olympus-green/15 text-[11px] font-semibold text-olympus-green disabled:opacity-40"
          >
            <CirclePlay size={13} /> {busy === 'continue' ? 'Resuming…' : `Continue ${decision.slug}`}
          </button>
          <button
            type="button" disabled={!!busy} onClick={() => void post('new-project')}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-olympus-gold/30 text-[11px] text-olympus-gold disabled:opacity-40"
          >
            <Plus size={13} /> New project
          </button>
        </div>
        <button type="button" disabled={!!busy} onClick={() => void post('dismiss')} className="mt-1 min-h-[32px] w-full text-[10px] text-olympus-text-dim">Not now</button>
      </div>
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/65" onClick={onClose} role="dialog" aria-modal="true" aria-label="Parthenon">
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border-t border-olympus-gold/25 bg-olympus-panel pb-[calc(env(safe-area-inset-bottom)+16px)]" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden border-b border-olympus-gold/15">
          <img src="/diagrams/parthenon-nakkas.svg" alt="" aria-hidden className="nakkas-full pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
          <img src="/diagrams/parthenon-nakkas-static.svg" alt="" aria-hidden className="nakkas-stable pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#080B12] via-[#080B12]/50 to-transparent" />
          <div className="relative flex items-center gap-2 px-4 py-3">
            <Sparkles size={14} className="text-olympus-gold" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold tracking-wide">Parthenon</div>
              <div className="truncate text-[10px] font-mono text-olympus-text-dim">{active ?? 'no project'} · {health?.line ?? 'no campaign'}</div>
            </div>
            <button onClick={onClose} aria-label="Close Parthenon" className="flex h-10 w-10 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-text-dim"><X size={16} /></button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {decision && (
            <div className="rounded-2xl border border-olympus-red/40 bg-olympus-red/10 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-olympus-red"><ShieldAlert size={12} /> Needs your call</div>
              <p className="mt-1 text-[11px] leading-relaxed">{decision.message}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => void post('continue')} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-olympus-green/40 bg-olympus-green/15 text-[11px] font-semibold text-olympus-green disabled:opacity-40"><CirclePlay size={13} /> Continue</button>
                <button type="button" disabled={!!busy} onClick={() => void post('new-project')} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-olympus-gold/30 text-[11px] text-olympus-gold disabled:opacity-40"><Plus size={13} /> New project</button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-olympus-gold/20 bg-olympus-gold/5 p-3">
            <div className="flex items-center gap-2">
              <Sun size={15} className="text-olympus-gold" />
              <span className="text-[13px] font-semibold text-olympus-gold">Apollo</span>
              <span className="rounded bg-olympus-gold/10 px-1.5 py-0.5 text-[8px] font-mono text-olympus-gold">plans · talks</span>
            </div>
            <p className="mt-1 text-[10px] text-olympus-text-dim">{active ? `Project ${active} · the campaign is ${verdict.toLowerCase()}.` : 'Start a project; Apollo plans the DAG.'}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { onClose(); onAsk('Brief me on the campaign status'); }} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-olympus-gold/40 bg-olympus-gold/15 text-[11px] font-semibold text-olympus-gold"><MessageSquare size={13} /> Ask Apollo</button>
              <button type="button" onClick={() => { onClose(); onNewProject(); }} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-olympus-gold/25 px-3 text-[11px] text-olympus-text-dim"><Plus size={13} /> New</button>
            </div>
          </div>

          <div className="rounded-2xl border border-olympus-cyan/25 bg-olympus-cyan/5 p-3">
            <div className="flex items-center gap-2">
              <Orbit size={15} className="text-olympus-cyan" />
              <span className="text-[13px] font-semibold text-olympus-cyan">Atlas</span>
              <span className="rounded bg-olympus-cyan/10 px-1.5 py-0.5 text-[8px] font-mono text-olympus-cyan">HY3</span>
              <span className={`ml-auto text-[9px] font-mono ${atlasTone}`}>{atlasLabel}</span>
            </div>
            <p className="mt-1 text-[10px] text-olympus-text-dim">{health?.line ?? 'No active campaign.'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {live ? (
                <button type="button" disabled={!!busy} onClick={() => void pause()} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-olympus-gold/35 text-[11px] font-semibold text-olympus-gold disabled:opacity-40"><CirclePause size={13} /> {busy === 'pause' ? 'Pausing…' : 'Pause'}</button>
              ) : (
                <button type="button" disabled={!!busy || !active} onClick={() => void post('continue')} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-olympus-green/40 bg-olympus-green/15 text-[11px] font-semibold text-olympus-green disabled:opacity-40"><CirclePlay size={13} /> {busy === 'continue' ? 'Resuming…' : 'Resume'}</button>
              )}
              <button type="button" onClick={() => { onClose(); onAsk('What does Atlas see? Show the parks and the next lane.'); }} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-olympus-cyan/30 px-3 text-[11px] text-olympus-cyan"><MessageSquare size={13} /> Ask Atlas</button>
              {health?.nextPlan && (
                <button type="button" disabled={!!busy} onClick={() => void applyNext()} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-olympus-gold/30 px-3 text-[11px] text-olympus-gold disabled:opacity-40"><Zap size={13} /> +{health.nextPlan.added}</button>
              )}
            </div>
            {warden?.lastAction && (
              <p className="mt-2 truncate text-[9px] font-mono text-olympus-text-dim">warden: {warden.lastAction.action} · {warden.lastAction.slug} · {warden.lastAction.detail}</p>
            )}
          </div>

          <div className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-olympus-text-dim"><Check size={11} className="text-olympus-green" /> one machine, ten gods</div>
            <p className="mt-1 text-[10px] leading-relaxed text-olympus-text-dim">{health?.reasons?.slice(0, 3).join(' · ') || 'No park, no dead lane — the campaign is clean.'}</p>
            <button type="button" onClick={() => { onClose(); onAsk('Explain the campaign health and the next action'); }} className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-olympus-gold/20 text-[10px] text-olympus-text-dim"><ArrowRight size={12} /> Ask for the full status</button>
          </div>
        </div>
      </div>
    </div>
  );
}
