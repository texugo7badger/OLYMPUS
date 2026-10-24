/**
 * sync-map-panel.tsx — #85 (v0.0.6 MISSION-CONTROL-TRUE): the live
 * "who is doing what" panel from the atlas sync-map. The hash-chained
 * ledger shipped in v0.0.4 with NO reader; this is its surface: every
 * recorded dispatch/chat turn — WHO (god + demigod), WHAT (the intent
 * excerpt), HOW IT WENT (status + the update reason), WHEN — plus the
 * ledger's own integrity header (count + chain head, tamper-evident by
 * design).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import { GOD_ICONS } from '@/lib/olympus-store';

interface SyncRow {
  id: string;
  seq: number | null;
  ts: string;
  updatedTs: string | null;
  updatedReason: string | null;
  origin: string;
  god: string;
  demigod: string | null;
  intent: string;
  status: string;
  error: string | null;
}

interface Integrity {
  count: number;
  chainHead: string | null;
  lastUpdated: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'text-olympus-green',
  success: 'text-olympus-green',
  routed: 'text-olympus-green',
  failed: 'text-olympus-red',
  pending: 'text-olympus-gold',
  working: 'text-olympus-gold',
};

function relTime(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function SyncMapPanel() {
  const [rows, setRows] = useState<SyncRow[]>([]);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/olympus/sync-map', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        setRows(d.rows || []);
        setIntegrity(d.integrity || null);
      } catch { /* decorative */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const iv = setInterval(load, 5_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <div className="h-full overflow-y-auto custom-scroll bg-olympus-bg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network size={16} className="text-olympus-cyan" />
        <h2 className="text-sm font-semibold text-olympus-cyan">Sync Map</h2>
        <span className="text-[9px] text-olympus-text-dim font-mono ml-auto">
          the hash-chained ledger · refresh 5s
        </span>
      </div>

      {/* Integrity header — the ledger's own health, tamper-evident by design. */}
      {integrity && (
        <div className="rounded-lg p-2.5 mb-3 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-cyan/15 text-[10px] font-mono">
          <div className="flex items-center gap-2">
            <span className="text-olympus-cyan font-bold">{integrity.count}</span>
            <span className="text-olympus-text-dim">entries</span>
            {integrity.chainHead && (
              <span className="text-olympus-text-dim ml-auto truncate max-w-[55%]" data-tip={integrity.chainHead}>
                chain {integrity.chainHead.slice(0, 16)}…
              </span>
            )}
          </div>
          <div className="text-olympus-text-dim mt-0.5 text-[9px]">
            last updated {relTime(integrity.lastUpdated)}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-10 text-olympus-text-dim text-xs font-mono">
          <RefreshCw size={14} className="animate-spin inline mr-2" />reading the ledger…
        </div>
      )}
      {!loading && rows.length === 0 && (
        <div className="text-center py-12 text-olympus-text-dim text-xs font-mono">
          <Network size={22} className="mx-auto mb-2 text-olympus-gold/40" />
          <p className="text-olympus-text">The ledger is empty</p>
          <p className="text-olympus-text-dim text-[10px] mt-1">
            Entries appear as gods dispatch work (chat turns + demigod dispatches, hash-chained).
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((r) => {
          const Icon = GOD_ICONS[r.god] ?? GOD_ICONS.apollo;
          const statusClass = STATUS_COLOR[r.status] ?? 'text-olympus-text-dim';
          return (
            <div
              key={r.id}
              className="rounded-lg p-2 bg-olympus-card border border-olympus-gold/10 hover:border-olympus-gold/25 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Icon size={12} className="text-olympus-gold shrink-0" />
                <span className="text-[11px] font-mono text-olympus-gold capitalize">{r.god}</span>
                {r.demigod && (
                  <span className="text-[9px] font-mono text-olympus-cyan">→ {r.demigod}</span>
                )}
                <span className={`text-[9px] font-mono uppercase ml-auto ${statusClass}`}>{r.status}</span>
              </div>
              <p className="text-[10px] font-mono text-olympus-text-dim mt-1 leading-relaxed line-clamp-2" data-tip={r.intent}>
                {r.intent || '(no intent recorded)'}
              </p>
              <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono text-[#5A5A5A]">
                <span>{relTime(r.updatedTs || r.ts)}</span>
                {r.updatedReason && <span data-tip={r.updatedReason}>· {r.updatedReason.slice(0, 40)}</span>}
                {r.error && <span className="text-olympus-red/70 truncate max-w-[50%]" data-tip={r.error}>· {r.error.slice(0, 60)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
