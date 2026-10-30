/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * HitlGateToast — shows pending HITL gates as toast notifications.
 *
 * Polls /api/olympus/hitl/gates every 5 seconds. When a new gate appears,
 * shows a toast with the approval prompt + three buttons:
 *   - Resume (approve) — green
 *   - Patch (resume with modifications) — amber
 *   - Abort (cancel) — red
 *
 * Renders nothing when there are no pending gates.
 */

import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, Check, Edit, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDocVisible } from '@/lib/use-doc-visible';

interface HitlGate {
  id: string;
  phase: string;
  action: string;
  approvalPrompt: string;
  createdAt: string;
  sessionId: string;
  god: string;
  targetFile?: string;
  targetCommand?: string;
  decision: null | 'approve' | 'patch' | 'abort';
}

export default function HitlGateToast() {
  // #231 — never poll the gate list in a hidden tab.
  const docVisible = useDocVisible();
  const [gates, setGates] = useState<HitlGate[]>([]);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [seenGateIds, setSeenGateIds] = useState<Set<string>>(new Set());
  // #204: the rider — an optional message that rides EVERY decision (accept,
  // reject, or request-different). Kept per gate so two pending gates never
  // share a note.
  const [riders, setRiders] = useState<Record<string, string>>({});

  const fetchGates = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/hitl/gates', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.gates) {
        const newGates = d.gates as HitlGate[];
        setGates(newGates);
        // Show a toast for any gate we haven't seen before.
        for (const g of newGates) {
          if (!seenGateIds.has(g.id)) {
            seenGateIds.add(g.id);
            setSeenGateIds(new Set(seenGateIds));
            toast.warning(`HITL Gate: ${g.action}`, {
              description: g.approvalPrompt,
              duration: Infinity, // keep until resolved
              id: g.id, // dedupe
              action: {
                label: 'View',
                onClick: () => {}, // the inline buttons below handle the actions
              },
            });
          }
        }
      }
    } catch {}
  }, [seenGateIds]);

  useEffect(() => {
    if (!docVisible) return;
    fetchGates();
    const iv = setInterval(fetchGates, 5000);
    return () => clearInterval(iv);
  }, [fetchGates, docVisible]);

  const resolveGate = useCallback(async (gateId: string, decision: 'approve' | 'patch' | 'abort') => {
    setResolving(prev => new Set(prev).add(gateId));
    const rider = (riders[gateId] || '').trim();
    try {
      // #204: the structured decision — {decision, rider}. `userNote` is the
      // legacy alias the server still accepts (backward compatible).
      const r = await fetch('/api/olympus/hitl/gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId, decision, rider, userNote: rider || undefined }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      toast.dismiss(gateId);
      setRiders(prev => { const n = { ...prev }; delete n[gateId]; return n; });
      const base = String(d.message || (decision === 'approve'
        ? 'Gate approved — dispatch resuming'
        : decision === 'patch'
        ? 'Gate patched — dispatch resuming with modifications'
        : 'Gate rejected — dispatch cancelled'));
      toast.success(rider ? `${base} — “${rider}”` : base);
    } catch (e: any) {
      toast.error(`Failed to resolve gate: ${e.message}`);
    } finally {
      setResolving(prev => {
        const n = new Set(prev);
        n.delete(gateId);
        return n;
      });
    }
  }, [riders]);

  if (gates.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {gates.map(g => (
        <div
          key={g.id}
          className="bg-olympus-card border border-olympus-amber-soft/40 rounded-lg shadow-lg p-3 flex flex-col gap-2"
        >
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-olympus-amber-soft shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-mono font-semibold text-olympus-amber-soft">
                {g.action}
              </div>
              <div className="text-[10px] font-mono text-olympus-text-dim">
                {g.phase}
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono text-olympus-text leading-relaxed">
            {g.approvalPrompt}
          </div>
          {(g.targetFile || g.targetCommand) && (
            <div className="text-[9px] font-mono text-olympus-text-dim bg-olympus-bg/50 rounded p-1.5 border border-olympus-gold/10">
              {g.targetFile && <div>File: <code className="text-olympus-gold">{g.targetFile}</code></div>}
              {g.targetCommand && <div>Command: <code className="text-olympus-gold">{g.targetCommand}</code></div>}
            </div>
          )}
          {/* #204: the rider — optional, rides any decision. */}
          <input
            value={riders[g.id] || ''}
            onChange={(e) => setRiders(prev => ({ ...prev, [g.id]: e.target.value }))}
            placeholder="Optional message (rides your decision)…"
            className="w-full bg-olympus-bg/60 border border-olympus-gold/15 rounded px-2 py-1.5 text-[10px] font-mono text-olympus-text placeholder:text-olympus-text-dim/50 focus:outline-none focus:border-olympus-gold/40"
          />
          <div className="flex items-center gap-1.5 mt-1">
            <button
              onClick={() => resolveGate(g.id, 'approve')}
              disabled={resolving.has(g.id)}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] font-mono px-2 py-1.5 rounded bg-olympus-green/20 text-olympus-green hover:bg-olympus-green/30 transition-colors disabled:opacity-50"
            >
              {resolving.has(g.id) ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Accept
            </button>
            <button
              onClick={() => resolveGate(g.id, 'patch')}
              disabled={resolving.has(g.id)}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] font-mono px-2 py-1.5 rounded bg-olympus-amber-soft/20 text-olympus-amber-soft hover:bg-olympus-amber-soft/30 transition-colors disabled:opacity-50"
            >
              <Edit size={11} />
              Request different
            </button>
            <button
              onClick={() => resolveGate(g.id, 'abort')}
              disabled={resolving.has(g.id)}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] font-mono px-2 py-1.5 rounded bg-olympus-red/20 text-olympus-red hover:bg-olympus-red/30 transition-colors disabled:opacity-50"
            >
              <X size={11} />
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
