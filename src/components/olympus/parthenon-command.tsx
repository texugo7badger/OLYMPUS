/**
 * ParthenonCommand — v0.0.89: the two gods that run the campaign, one tap away.
 *
 * The old Parthenon header was a status line. This deck makes Atlas and Apollo
 * first-class controls: Atlas shows its HY3 lane and whether it is patrolling,
 * recovering or needs the user; Apollo shows the plan state and the project.
 * Every action is a real API call (resume, pause, apply the staged generation,
 * open the chat, start another project) — no dead buttons.
 *
 * The Nakkas SVG is the living-machine backdrop. Stable motion uses the static
 * twin; full motion uses the animated one (CSS transform/opacity only).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight, Check, CirclePause, CirclePlay, FileSearch, MessageSquare,
  Orbit, Plus, ShieldAlert, Sun, X, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOlympus } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';

type Health = {
  verdict: string; line: string; reasons: string[]; generation: number;
  completed: number; total: number; running: number;
  parked: { hopId: string; reason: string } | null;
  nextPlan: { added: number; removed: number; changed: number } | null;
  etaMs: number | null;
} | null;

type Patrol = { summary: string; parked: number; stuck: number; verdict: string | null; hopId: string | null; nextLane: string | null } | null;

type Decision = {
  id: string; slug: string; kind: 'interrupted' | 'parked' | 'needs-user';
  hopId: string | null; reason: string; message: string;
  actions: Array<'continue' | 'new-project' | 'dismiss'>;
};

type Warden = {
  active: boolean; model: string; at: string;
  lanes: Array<{ slug: string; running: number; optedIn: boolean; health: string; lastAction: string | null }>;
  lastAction: { at: string; slug: string; action: string; detail: string } | null;
};

interface Props {
  health: Health;
  patrol: Patrol;
  projectSlug: string | null;
  onChat: (god: string) => void;
  /** Optional: the terminal can re-fetch its own tasks after an action. */
  onChanged?: () => void;
}

function eta(ms: number | null): string {
  if (!ms || ms <= 0) return '';
  return ms >= 60_000 ? `~${Math.round(ms / 60_000)}m` : `~${Math.round(ms / 1000)}s`;
}

export default function ParthenonCommand({ health, patrol, projectSlug, onChat, onChanged }: Props) {
  const setNewProjectDialogOpen = useOlympus((s) => s.setNewProjectDialogOpen);
  const [warden, setWarden] = useState<Warden | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/atlas/warden', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setWarden(d?.state ?? null);
      setDecision(d?.decision ?? null);
    } catch { /* the panel works from health below */ }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(iv);
  }, [load]);

  const post = useCallback(async (action: 'continue' | 'new-project' | 'dismiss') => {
    if (!projectSlug && action !== 'new-project') return;
    setBusy(action);
    try {
      const r = await fetch('/api/olympus/atlas/warden', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, slug: projectSlug }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      if (action === 'new-project') {
        setDecision(null);
        setNewProjectDialogOpen(true);
      } else if (action === 'continue') {
        toast.success(projectSlug ? `Atlas will keep ${projectSlug} walking` : 'Walk resumed', {
          description: 'Auto-resume is on; the warden will recover the next park without prompting Apollo.',
        });
      }
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(`Atlas could not ${action === 'continue' ? 'resume' : action}`, { description: e?.message || String(e) });
    } finally { setBusy(null); }
  }, [projectSlug, load, onChanged, setNewProjectDialogOpen]);

  const pause = useCallback(async () => {
    if (!projectSlug) return;
    setBusy('pause');
    try {
      const r = await fetch('/api/olympus/walk/supervisor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', slug: projectSlug }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      toast.success('Walk paused', { description: `${projectSlug} is parked; the disk keeps the campaign.` });
      await load(); onChanged?.();
    } catch (e: any) { toast.error('Pause failed', { description: e?.message || String(e) }); }
    finally { setBusy(null); }
  }, [projectSlug, load, onChanged]);

  const applyNext = useCallback(async () => {
    if (!projectSlug || !health?.nextPlan) return;
    setBusy('apply');
    try {
      const r = await fetch('/api/olympus/walk/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: projectSlug, action: 'apply' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      toast.success('Next generation applied', { description: `Generation ${d.generation ?? '?'} is now the active plan.` });
      await load(); onChanged?.();
    } catch (e: any) { toast.error('Apply failed', { description: e?.message || String(e) }); }
    finally { setBusy(null); }
  }, [projectSlug, health?.nextPlan, load, onChanged]);

  const lane = warden?.lanes.find((l) => l.slug === projectSlug) ?? null;
  const verdict = health?.verdict ?? 'PAUSED';
  const live = (health?.running ?? 0) > 0;
  const atlasState = verdict === 'NEEDS-YOU' ? 'needs you'
    : verdict === 'BLOCKED' ? 'recovering'
      : verdict === 'DEGRADED' ? 'patrolling'
        : verdict === 'DONE' ? 'all clear'
          : verdict === 'PAUSED' ? 'paused'
            : live ? 'patrolling' : 'ready';
  const atlasTone = verdict === 'NEEDS-YOU' || verdict === 'BLOCKED' ? 'red'
    : verdict === 'DEGRADED' ? 'gold'
      : 'green';
  const apolloState = verdict === 'DONE' ? 'ready' : verdict === 'PAUSED' ? 'idle' : 'planning';

  return (
    <section className="px-2 pt-2 pb-1.5 border-b border-olympus-gold/10" aria-label="Atlas and Apollo command deck">
      {/* The living-machine backdrop: Nakkas animated SVG, static in stable motion. */}
      <div className="relative overflow-hidden rounded-xl border border-olympus-gold/20 bg-[#080B12]">
        <img src="/diagrams/parthenon-nakkas.svg" alt="" aria-hidden className="nakkas-full pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
        <img src="/diagrams/parthenon-nakkas-static.svg" alt="" aria-hidden className="nakkas-stable pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#080B12] via-[#080B12]/55 to-transparent" />
        <div className="relative px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <Orbit size={11} className="text-olympus-gold" />
            <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-olympus-gold">Atlas · always on</span>
            <span className="ml-auto rounded border border-olympus-cyan/30 bg-olympus-cyan/10 px-1 py-0.5 text-[7px] font-mono text-olympus-cyan" data-tip="Atlas's lane is pinned to Hy3; a free/nemotron failover is refused.">HY3</span>
          </div>
          <p className="mt-0.5 text-[10px] font-semibold text-olympus-text">The pantheon is watching.</p>
          <p className="text-[8px] font-mono text-olympus-text-dim truncate" data-tip={health?.line ?? undefined}>
            {health?.line ?? 'No active campaign — Atlas is ready.'}
          </p>
        </div>
      </div>

      {/* One decision, never a prompt in Apollo's chat. */}
      {decision && (
        <div role="alert" className="mt-1.5 rounded-lg border border-olympus-red/40 bg-olympus-red/10 p-2">
          <div className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-wide text-olympus-red">
            <ShieldAlert size={10} /> Needs your call
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-olympus-text">{decision.message}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <button
              type="button" disabled={!!busy}
              onClick={() => void post('continue')}
              className="inline-flex min-h-[26px] items-center gap-1 rounded-md border border-olympus-green/40 bg-olympus-green/15 px-2 text-[8px] font-semibold text-olympus-green hover:bg-olympus-green/25 disabled:opacity-40"
            >
              <CirclePlay size={10} /> {busy === 'continue' ? 'resuming…' : `Continue ${decision.slug}`}
            </button>
            <button
              type="button" disabled={!!busy}
              onClick={() => void post('new-project')}
              className="inline-flex min-h-[26px] items-center gap-1 rounded-md border border-olympus-gold/30 px-2 text-[8px] text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-40"
            >
              <Plus size={10} /> Start another project
            </button>
            <button
              type="button" disabled={!!busy}
              onClick={() => void post('dismiss')}
              className="inline-flex min-h-[26px] items-center gap-1 rounded-md px-2 text-[8px] text-olympus-text-dim hover:text-olympus-text disabled:opacity-40"
            >
              <X size={9} /> Not now
            </button>
          </div>
        </div>
      )}

      {/* Apollo — the planner and the only god who talks. */}
      <div className="mt-1.5 rounded-lg border border-olympus-gold/20 bg-olympus-gold/5 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Sun size={12} className="text-olympus-gold" />
          <span className="text-[10px] font-semibold text-olympus-gold">Apollo</span>
          <span className="text-[7px] font-mono uppercase tracking-wide text-olympus-text-dim">plans · talks</span>
          <span className="ml-auto rounded bg-olympus-gold/10 px-1 py-0.5 text-[7px] font-mono text-olympus-gold">{apolloState}</span>
        </div>
        <p className="mt-0.5 text-[8px] text-olympus-text-dim truncate">
          {projectSlug ? `Project ${projectSlug} · the campaign is ${verdict.toLowerCase()}.` : 'Start a project; Apollo plans the DAG.'}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button" onClick={() => onChat('apollo')}
            className="inline-flex min-h-[26px] flex-1 items-center justify-center gap-1 rounded-md border border-olympus-gold/40 bg-olympus-gold/15 px-2 text-[8px] font-semibold text-olympus-gold hover:bg-olympus-gold/25"
          >
            <MessageSquare size={10} /> Ask Apollo
          </button>
          <button
            type="button" onClick={() => { setNewProjectDialogOpen(true); }}
            className="inline-flex min-h-[26px] items-center justify-center gap-1 rounded-md border border-olympus-gold/25 px-2 text-[8px] text-olympus-text-dim hover:bg-olympus-gold/10 hover:text-olympus-gold"
          >
            <Plus size={10} /> New project
          </button>
        </div>
      </div>

      {/* Atlas — the operator; quick actions, no model turn. */}
      <div className="mt-1.5 rounded-lg border border-olympus-cyan/25 bg-olympus-cyan/5 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Orbit size={12} className="text-olympus-cyan" />
          <span className="text-[10px] font-semibold text-olympus-cyan">Atlas</span>
          <span className="text-[7px] font-mono uppercase tracking-wide text-olympus-text-dim">walks · recovers</span>
          <span
            className={cn(
              'ml-auto rounded px-1 py-0.5 text-[7px] font-mono',
              atlasTone === 'red' ? 'bg-olympus-red/15 text-olympus-red'
                : atlasTone === 'gold' ? 'bg-olympus-gold/15 text-olympus-gold'
                  : 'bg-olympus-green/15 text-olympus-green',
            )}
          >
            {atlasState}
          </span>
        </div>
        <p className="mt-0.5 text-[8px] text-olympus-text-dim truncate" data-tip={lane?.lastAction ? `warden: ${lane.lastAction}` : (patrol?.summary ?? health?.reasons?.join('\n'))}>
          {patrol ? `${patrol.parked} parked · ${patrol.stuck} stuck${patrol.verdict ? ` · ${patrol.verdict}` : ''}` : (health?.parked ? `parked at ${health.parked.hopId}` : 'no parks — the walk is clean.')}
          {health?.etaMs ? ` · ${eta(health.etaMs)} left` : ''}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {live ? (
            <button
              type="button" disabled={!!busy} onClick={() => void pause()}
              className="inline-flex min-h-[26px] flex-1 items-center justify-center gap-1 rounded-md border border-olympus-gold/35 px-2 text-[8px] font-semibold text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-40"
            >
              <CirclePause size={10} /> {busy === 'pause' ? 'pausing…' : 'Pause'}
            </button>
          ) : (
            <button
              type="button" disabled={!!busy || !projectSlug}
              onClick={() => void post('continue')}
              className="inline-flex min-h-[26px] flex-1 items-center justify-center gap-1 rounded-md border border-olympus-green/40 bg-olympus-green/15 px-2 text-[8px] font-semibold text-olympus-green hover:bg-olympus-green/25 disabled:opacity-40"
            >
              <CirclePlay size={10} /> {busy === 'continue' ? 'resuming…' : 'Resume'}
            </button>
          )}
          <button
            type="button" onClick={() => onChat('atlas')}
            className="inline-flex min-h-[26px] items-center justify-center gap-1 rounded-md border border-olympus-cyan/30 px-2 text-[8px] text-olympus-cyan hover:bg-olympus-cyan/10"
          >
            <MessageSquare size={10} /> Ask Atlas
          </button>
          {health?.nextPlan && (
            <button
              type="button" disabled={!!busy} onClick={() => void applyNext()}
              className="inline-flex min-h-[26px] items-center justify-center gap-1 rounded-md border border-olympus-gold/30 px-2 text-[8px] text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-40"
              data-tip={`Staged next generation: +${health.nextPlan.added} / -${health.nextPlan.removed} / ~${health.nextPlan.changed}`}
            >
              <Zap size={10} /> {busy === 'apply' ? 'applying…' : `+${health.nextPlan.added}`}
            </button>
          )}
          <button
            type="button" onClick={() => setEvidence(true)}
            className="inline-flex min-h-[26px] items-center justify-center gap-1 rounded-md px-2 text-[8px] text-olympus-text-dim hover:text-olympus-cyan"
            data-tip="The deterministic Atlas finding: cause, lane, verdict and the evidence paths."
          >
            <FileSearch size={10} /> Evidence
          </button>
        </div>
      </div>

      {evidence && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setEvidence(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-olympus-cyan/30 bg-olympus-panel p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <FileSearch size={13} className="text-olympus-cyan" />
              <span className="text-[11px] font-semibold text-olympus-text">Atlas evidence</span>
              <button onClick={() => setEvidence(false)} className="ml-auto p-1 text-olympus-text-dim" aria-label="Close evidence"><X size={13} /></button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-olympus-text-dim">{patrol?.summary ?? 'No patrol finding on disk.'}</p>
            {health && (
              <ul className="mt-2 space-y-1">
                {health.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1 text-[9px] text-olympus-text-dim"><Check size={9} className="mt-0.5 shrink-0 text-olympus-green" />{r}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[8px] font-mono text-olympus-text-dim">
              The full verdict lives in the lane at <span className="text-olympus-gold">.olympus-atlas-verdict.md</span> and every finding in <span className="text-olympus-gold">.olympus-atlas-patrol.jsonl</span>.
            </p>
            <button
              type="button" onClick={() => { onChat('atlas'); setEvidence(false); }}
              className="mt-2 inline-flex min-h-[30px] w-full items-center justify-center gap-1 rounded-md border border-olympus-cyan/30 bg-olympus-cyan/10 text-[9px] text-olympus-cyan"
            >
              <ArrowRight size={10} /> Ask Atlas about this evidence
            </button>
          </div>
        </div>
      )}

      <style>{`
        .nakkas-stable { display: none; }
        [data-motion="stable"] .nakkas-full { display: none; }
        [data-motion="stable"] .nakkas-stable { display: block; }
        @media (prefers-reduced-motion: reduce) {
          .nakkas-full { display: none; }
          .nakkas-stable { display: block; }
        }
      `}</style>
    </section>
  );
}
