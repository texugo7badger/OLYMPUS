/**
 * brain-health-card.tsx — v0.1.7: make Compact Brain and the recycler
 * explainable and measurable.
 *
 * The card reads the same vault health as the Vault panel, the same
 * Callimachus census as the God Intelligence panel, and the Vault Policy
 * preview. It recommends (never silently runs) a compact or a recycle.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Brain, CircleCheck, CircleAlert, Recycle, RefreshCw, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage, t } from '@/lib/i18n';

interface Health {
  total_instincts?: number;
  total_archived?: number;
  total_quick_circuits?: number;
  total_project_memory?: number;
  orphans?: number;
  contradictions?: number;
}
interface CallimachusStatus {
  lastCurationAt?: string | null;
  census?: { quickCircuits: number; technical: number; project: number; total: number };
}
interface Policy {
  autoPruneOnIdle?: boolean;
  dryRun?: boolean;
  instinctMaxAgeDays?: number;
  archiveOlderThanDays?: number;
}
interface Preview {
  actions?: Array<{ type: string; path: string; reason: string; sizeBytes: number }>;
  totalBytesAffected?: number;
}
interface PruneResponse { policy?: Policy; preview?: Preview }

export default function BrainHealthCard() {
  const language = useLanguage();
  const [health, setHealth] = useState<Health | null>(null);
  const [curator, setCurator] = useState<CallimachusStatus | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [g, c, p] = await Promise.allSettled([
      fetch('/api/olympus/graph', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/olympus/callimachus/status', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/olympus/vault/prune', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    if (g.status === 'fulfilled') setHealth(g.value?.health ?? null);
    if (c.status === 'fulfilled') setCurator(c.value ?? null);
    if (p.status === 'fulfilled') {
      const d = p.value as PruneResponse;
      setPolicy(d.policy ?? null);
      setPreview(d.preview ?? null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = health?.total_instincts ?? 0;
  const archived = health?.total_archived ?? 0;
  const project = health?.total_project_memory ?? 0;
  const quick = health?.total_quick_circuits ?? curator?.census?.quickCircuits ?? 0;
  const archiveRatio = active > 0 ? archived / active : 0;
  const last = curator?.lastCurationAt ? Date.parse(curator.lastCurationAt) : NaN;
  const staleDays = Number.isFinite(last) ? Math.floor((Date.now() - last) / 86_400_000) : null;

  const reasons: string[] = [];
  if (quick === 0) reasons.push('No quick circuits yet — that is honest; project patterns stay scoped as hints.');
  if (project > 0) reasons.push(`${project.toLocaleString()} project-memory instinct(s), visible only in their project.`);
  if (archiveRatio > 2 && archived > 20) reasons.push(`Archive dominates the active base (${archived.toLocaleString()} archived / ${active.toLocaleString()} active).`);
  if (staleDays != null && staleDays > 7) reasons.push(`Last Callimachus curation was ${staleDays} day(s) ago.`);
  if (!reasons.length) reasons.push('Active base, archive and curation cadence look healthy.');

  const score = Math.max(0, Math.min(100, Math.round(
    100 - Math.min(35, archiveRatio * 15) - (staleDays != null && staleDays > 7 ? 15 : 0),
  )));
  const verdict = score < 50 ? 'Recycle recommended' : score < 75 ? 'Watch' : 'Healthy';

  const setPolicyFlag = async (patch: Partial<Policy>) => {
    setBusy('policy');
    try {
      const r = await fetch('/api/olympus/vault/prune', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-policy', policy: patch }),
      });
      const d = await r.json();
      if (d?.ok) { setPolicy(d.policy); setNote('Vault policy saved.'); }
      else setNote(d?.error || 'policy save failed');
    } catch (e: any) { setNote(e.message || 'policy save failed'); }
    finally { setBusy(null); }
  };

  const recycle = async () => {
    if (!window.confirm('Recycle now? This runs the Vault Policy live: log rollover and archive/delete of stale files per the policy. Seeds and project memory are not touched.')) return;
    setBusy('recycle');
    try {
      const r = await fetch('/api/olympus/vault/prune', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', dryRun: false }),
      });
      const d = await r.json();
      setNote(d?.message || d?.error || 'recycle finished');
      await load();
    } catch (e: any) { setNote(e.message || 'recycle failed'); }
    finally { setBusy(null); }
  };

  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2">
        <Brain size={11} className="text-olympus-gold" />
        <h3 className="text-[11px] font-semibold text-olympus-text uppercase tracking-wide">{t('settings.brainHealth', language)}</h3>
        <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[9px] font-mono uppercase ring-1',
          score < 50 ? 'text-olympus-red ring-olympus-red/30 bg-olympus-red/10'
            : score < 75 ? 'text-olympus-amber-soft ring-olympus-amber-soft/30 bg-olympus-amber-soft/10'
              : 'text-olympus-green ring-olympus-green/30 bg-olympus-green/10')}>{verdict} · {score}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {[
          ['Active', active],
          ['Project', project],
          ['Archived', archived],
          ['Quick', quick],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-olympus-gold/10 bg-olympus-card/50 p-2">
            <div className="text-[13px] font-mono font-bold text-olympus-text">{Number(value).toLocaleString()}</div>
            <div className="text-[8px] font-mono uppercase text-olympus-text-dim">{label}</div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[9px] font-mono text-olympus-text-dim leading-relaxed">
        <b className="text-olympus-text">Compact</b> runs the Callimachus deep pass (aliases, duplicates, dead links, orphans) with a 5-minute undo.
        {' '}<b className="text-olympus-text">Recycle</b> applies the Vault Policy (log rollover + stale archive) and never touches seeds or project memory.
      </p>
      <ul className="mt-1 space-y-0.5 text-[8.5px] font-mono text-olympus-text-dim">
        {reasons.map((r) => <li key={r}>· {r}</li>)}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => void load()}
          className="flex items-center gap-1 rounded border border-olympus-gold/25 px-2 py-1 text-[9px] font-mono text-olympus-gold hover:bg-olympus-gold/10"
        >
          <RefreshCw size={9} /> refresh
        </button>
        <button
          onClick={() => void recycle()}
          disabled={busy != null}
          className="flex items-center gap-1 rounded border border-olympus-amber-soft/35 px-2 py-1 text-[9px] font-mono text-olympus-amber-soft hover:bg-olympus-amber-soft/10 disabled:opacity-50"
        >
          <Recycle size={9} /> recycle now
        </button>
        <label className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim">
          <input type="checkbox" checked={policy?.autoPruneOnIdle === true} onChange={(e) => void setPolicyFlag({ autoPruneOnIdle: e.target.checked })} />
          auto on idle
        </label>
        <label className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim">
          <input type="checkbox" checked={policy?.dryRun !== false} onChange={(e) => void setPolicyFlag({ dryRun: e.target.checked })} />
          dry-run
        </label>
      </div>
      <div className="mt-1 text-[8.5px] font-mono text-olympus-text-dim">
        preview: {preview?.actions?.length ?? 0} action(s), {Math.round((preview?.totalBytesAffected ?? 0) / 1024)} KB
        {policy?.instinctMaxAgeDays != null ? ` · instincts >${policy.instinctMaxAgeDays}d` : ''}
        {policy?.archiveOlderThanDays != null ? ` · archive >${policy.archiveOlderThanDays}d` : ''}
      </div>
      {note && (
        <div className="mt-1 flex items-start gap-1 text-[8.5px] font-mono text-olympus-text-dim">
          {/fail|error/i.test(note) ? <CircleAlert size={9} className="text-olympus-red mt-0.5" /> : <CircleCheck size={9} className="text-olympus-green mt-0.5" />}
          <span>{note}</span>
        </div>
      )}
      <div className="mt-1 flex items-center gap-1 text-[8px] font-mono text-olympus-text-dim">
        <ShieldCheck size={9} /> no silent delete: the archive manifest is the undo trail.
      </div>
    </section>
  );
}
