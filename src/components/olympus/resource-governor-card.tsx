/**
 * resource-governor-card.tsx — v0.0.39 (R39-01).
 *
 * The Settings surface for the host budget: a live memory bar, the OLYMPUS
 * process census, and one honest action (reclaim). It polls only while the
 * Settings dialog is mounted and the document is visible.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Loader2, Recycle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDocVisible } from '@/lib/use-doc-visible';

interface Snapshot {
  totalMb: number;
  availableMb: number;
  usedPct: number;
  load1: number;
  cores: number;
  processCount: number;
  olympusRssMb: number;
  verdict: 'green' | 'amber' | 'red';
  reason: string | null;
}

export default function ResourceGovernorCard() {
  const docVisible = useDocVisible();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/resources', { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok && d.resources) setSnapshot(d.resources);
    } catch { /* the card is best-effort */ }
  }, []);

  useEffect(() => {
    if (!docVisible) return;
    void load();
    const iv = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(iv);
  }, [docVisible, load]);

  const reclaim = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reclaim' }),
      });
      const d = await r.json();
      if (d?.ok) {
        setSnapshot(d.after);
        toast.success(d.note || 'memory reclaimed');
      } else {
        toast.error(d?.error || 'reclaim failed');
      }
    } catch {
      toast.error('could not reach the governor');
    } finally {
      setBusy(false);
    }
  };

  const tone = snapshot?.verdict === 'red'
    ? 'text-olympus-red'
    : snapshot?.verdict === 'amber'
      ? 'text-olympus-amber-soft'
      : 'text-olympus-green';
  const bar = snapshot?.verdict === 'red'
    ? 'bg-olympus-red'
    : snapshot?.verdict === 'amber'
      ? 'bg-olympus-amber-soft'
      : 'bg-olympus-green';

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-olympus-text uppercase tracking-wide flex items-center gap-1.5">
          <Activity size={11} className="text-olympus-gold" />
          System · resource governor
        </h3>
        <button
          onClick={() => void reclaim()}
          disabled={busy}
          data-tip="Stop the app chat server and its MCP fleet; the next prompt recreates them"
          className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded border border-olympus-gold/30 text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-50"
        >
          {busy ? <Loader2 size={9} className="animate-spin" /> : <Recycle size={9} />}
          reclaim
        </button>
      </div>

      {snapshot ? (
        <div className="rounded-md border border-olympus-gold/10 bg-olympus-card/50 p-2 space-y-1.5">
          <div className="flex items-center gap-2 text-[9px] font-mono">
            <span className={cn('font-semibold uppercase', tone)}>{snapshot.verdict}</span>
            <span className="text-olympus-text-dim">
              {Math.max(0, snapshot.totalMb - snapshot.availableMb).toLocaleString()} / {snapshot.totalMb.toLocaleString()} MB used
            </span>
            <span className="ml-auto text-olympus-text-dim">{snapshot.availableMb.toLocaleString()} MB free</span>
          </div>
          <div className="h-1.5 rounded-full bg-olympus-bg overflow-hidden ring-1 ring-olympus-gold/10">
            <div className={cn('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${Math.min(100, Math.max(2, snapshot.usedPct))}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[8.5px] font-mono text-olympus-text-dim flex-wrap">
            <span>{snapshot.processCount} OLYMPUS process{snapshot.processCount === 1 ? '' : 'es'} · {(snapshot.olympusRssMb / 1024).toFixed(2)} GB RSS</span>
            <span>· load {snapshot.load1.toFixed(2)} / {snapshot.cores} cores</span>
            {snapshot.reason && <span className={tone}>· {snapshot.reason}</span>}
          </div>
          <p className="text-[8.5px] font-mono text-olympus-text-dim leading-relaxed">
            A new dev server is refused when it would leave less than 1.2 GB free. Reclaim stops the optional chat fleet first.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-olympus-text-dim">
          <Loader2 size={10} className="animate-spin" /> reading the host budget…
        </div>
      )}
    </section>
  );
}
