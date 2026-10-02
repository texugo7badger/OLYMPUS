/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * Issue #47 — the /permissions panel.
 *
 * Issue #41 made "always" persist a grant to ~/.olympus/permissions.json, but
 * nothing ever showed that file. A grant was invisible and, until now,
 * unrevocable: the user who clicked "Always allow" once on a tool kept getting
 * no ask forever, with no way back. This panel is that way back — every rule,
 * one row, with a revoke.
 *
 * Reads and writes only through /api/olympus/action (permissions-list /
 * permissions-revoke), which applies the same auth guards as every other
 * action and is the only thing that writes the file.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ShieldCheck, X } from 'lucide-react';

interface ToolPolicy {
  always: string[];
  denied: string[];
}

interface PermissionsPayload {
  tools: Record<string, ToolPolicy>;
  paths: { always: string[]; denied: string[] };
  seededTools: string[];
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch('/api/olympus/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} failed (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(json.error || `${action} failed (HTTP ${res.status})`);
  return json;
}

export default function PermissionsPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<PermissionsPayload | null>(null);
  const [error, setError] = useState('');
  /** The tool whose revoke is awaiting confirmation — one at a time, so a
   *  second click elsewhere in the panel can't leave two live confirms. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await call('permissions-list'));
    } catch (e: any) {
      setError(e.message || 'could not read permissions');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = useCallback(async (tool: string) => {
    setBusy(true);
    try {
      const res = await call('permissions-revoke', { tool });
      // The route returns the refreshed list directly (not wrapped in .list),
      // so the panel re-reads from the source of truth rather than guessing
      // at the post-revoke shape.
      setData(res);
      setConfirming(null);
    } catch (e: any) {
      setError(e.message || 'revoke failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const tools = Object.entries(data?.tools || {}).sort(([a], [b]) => a.localeCompare(b));
  const seeded = new Set(data?.seededTools || []);
  const paths = data?.paths || { always: [], denied: [] };

  return (
    <div className="shrink-0 border-b border-olympus-gold/20 bg-olympus-panel/95 flex flex-col max-h-[45vh]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-olympus-gold/10">
        <span className="text-[10px] font-mono text-olympus-gold flex items-center gap-1.5">
          <ShieldCheck size={11} />
          permissions — rules that answer permission asks without asking
        </span>
        <button
          onClick={onClose}
          aria-label="Close permissions panel"
          className="text-olympus-text-dim hover:text-olympus-gold transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {error && (
        <div className="px-3 py-1.5 text-[10px] font-mono text-olympus-red flex items-center gap-1.5 border-b border-olympus-red/20">
          <AlertCircle size={11} />
          {error}
        </div>
      )}

      <div className="overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
        {!data && !error && <div className="text-[10px] font-mono text-olympus-text-dim">reading permissions.json…</div>}

        {data && tools.length === 0 && (
          <div className="text-[10px] font-mono text-olympus-text-dim">
            no tool rules — every tool will ask.
          </div>
        )}

        {tools.map(([tool, policy]) => {
          const isSeeded = seeded.has(tool);
          const isConfirming = confirming === tool;
          return (
            <div key={tool} className="rounded-md border border-olympus-gold/10 bg-olympus-bg/40 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-olympus-text">
                  {tool}
                  {isSeeded && (
                    <span className="ml-1.5 px-1 py-px rounded text-[9px] font-mono text-olympus-text-dim bg-olympus-gold/10">
                      seeded
                    </span>
                  )}
                </span>
                {!isConfirming && (
                  <button
                    onClick={() => setConfirming(tool)}
                    disabled={busy}
                    className="text-[10px] font-mono px-2 py-0.5 rounded text-olympus-red border border-olympus-red/30 hover:bg-olympus-red/10 transition-colors disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </div>
              <div className="text-[9px] font-mono text-olympus-text-dim mt-0.5 truncate">
                always: {policy.always.join(', ') || '—'}&nbsp;&nbsp;denied: {policy.denied.join(', ') || '—'}
              </div>
              {/* Two-step confirm, mirroring the terminal's existing reset
                  confirm bar: a destructive action asks once, in place. */}
              {isConfirming && (
                <div className="mt-1.5 pt-1.5 border-t border-olympus-red/20 flex items-center justify-between gap-2">
                  <span className="text-[9px] font-mono text-olympus-red flex items-center gap-1 min-w-0">
                    <AlertCircle size={10} className="shrink-0" />
                    {isSeeded
                      ? `Revoke ${tool}? It was seeded so read-only work runs unattended — the next read will ask again.`
                      : `Revoke all ${tool} rules? Its next use will ask again.`}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setConfirming(null)}
                      className="text-[10px] font-mono px-2 py-0.5 rounded text-olympus-text-dim hover:bg-olympus-gold/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => revoke(tool)}
                      disabled={busy}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-olympus-red/20 text-olympus-red hover:bg-olympus-red/30 ring-1 ring-olympus-red/30 transition-colors disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Path rules are the vault auto-approval rule. Display-only: a revoke
            here would have to re-prompt for every prefix, and no card writes
            one, so there is nothing for the user to have granted by accident. */}
        <div className="rounded-md border border-olympus-gold/10 bg-olympus-bg/40 px-2 py-1.5 mt-1">
          <div className="text-[10px] font-mono text-olympus-text">
            paths <span className="ml-1.5 px-1 py-px rounded text-[9px] font-mono text-olympus-text-dim bg-olympus-gold/10">display only</span>
          </div>
          <div className="text-[9px] font-mono text-olympus-text-dim mt-0.5 truncate">
            always: {paths.always.join(', ') || '—'}&nbsp;&nbsp;denied: {paths.denied.join(', ') || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}