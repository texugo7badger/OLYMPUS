/**
 * TaskSheetModal — the TASK SHEET (v0.0.4 W1-5): click any task — a
 * Parthenon god-card row or a Recent Activity hop row — and the full sheet
 * opens: the agent's OWN thinking (recovered from the hop child's
 * reasoning stream), the files it created/edited (each chip opens the file
 * in the user's editor via the Editor Bridge), its tokens in/out, duration,
 * retries, the directive excerpt, the deliverable artifacts, and the verify
 * contract. Nothing dead on any screen.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Brain, FilePen, Coins, Clock, ChevronDown, ChevronRight, Wrench, RotateCcw, Sparkles, ShieldCheck } from 'lucide-react';
import { GOD_ICONS } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';

export interface TaskRecord {
  id: string;
  god: string;
  promptExcerpt: string;
  artifacts: string[];
  verify: unknown;
  budgetTokens: number | null;
  status: string;
  parkedReason?: string | null;
  ts?: string;
  /** W-D2: when this hop STARTED (the inFlight ground truth — the running
   *  timer's source; telemetry rows land only at settle). */
  startedAt?: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  durationMs?: number;
  retriesAbsorbed?: number;
  reasoning?: string | null;
  sessionId?: string | null;
  files: { file: string; tool: string; ts: string }[];
  /** The honest progress pct (0-100): completed = 100; running = elapsed vs
   *  the god's own median hop duration (the lane's telemetry-derived ETA). */
  progress?: number;
  /** W-D5: the derived $ cost (tokens x the active strategy's rates). */
  estimatedCostUsd?: number | null;
}

const STATUS_CHIP: Record<string, string> = {
  completed: 'bg-olympus-green/15 text-olympus-green ring-olympus-green/30',
  running: 'bg-olympus-gold/15 text-olympus-gold ring-olympus-gold/30 animate-pulse',
  pending: 'bg-olympus-text-dim/10 text-olympus-text-dim ring-olympus-text-dim/20',
  parked: 'bg-olympus-red/15 text-olympus-red ring-olympus-red/30',
};

function fmtDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmtTokens(n?: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Open a file in the user's external editor (the Editor Bridge lane). */
function openInEditor(file: string) {
  void fetch('/api/olympus/editor/launch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: file }),
  }).catch(() => {});
}

export default function TaskSheetModal({ hopId, onClose }: { hopId: string; onClose: () => void }) {
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [openFile, setOpenFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/olympus/tasks', { cache: 'no-store' });
        const d = await r.json();
        if (cancelled) return;
        const found: TaskRecord | undefined = (d?.tasks || []).find((t: TaskRecord) => t.id === hopId);
        setTask(found ?? null);
      } catch {
        if (!cancelled) setTask(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hopId]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const Icon = task ? GOD_ICONS[task.god] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Task sheet: ${hopId}`}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-olympus-gold/20 bg-olympus-bg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/10 bg-olympus-panel">
          {Icon ? <Icon size={15} className="text-olympus-gold" /> : <Sparkles size={15} className="text-olympus-gold" />}
          <span className="text-[13px] font-mono font-semibold text-olympus-gold capitalize">{task?.god ?? '…'}</span>
          <span className="text-olympus-text-dim">·</span>
          <span className="text-[13px] font-mono text-olympus-text">{hopId}</span>
          {task && (
            <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded ring-1 uppercase', STATUS_CHIP[task.status] || STATUS_CHIP.pending)}>
              {task.status}
            </span>
          )}
          <button onClick={onClose} className="ml-auto text-olympus-text-dim hover:text-olympus-red transition-colors" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scroll px-4 py-3 space-y-3">
          {loading && <div className="text-center py-8 text-olympus-text-dim text-xs font-mono">loading the task sheet…</div>}
          {!loading && !task && (
            <div className="text-center py-8 text-olympus-text-dim text-xs font-mono">
              No task record for “{hopId}” in the active lane.
            </div>
          )}
          {task && (
            <>
              {/* Telemetry strip */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg p-2 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-cyan/15">
                  <div className="flex items-center gap-1 mb-0.5"><Coins size={10} className="text-olympus-cyan" /><span className="text-[8px] font-mono text-olympus-text-dim uppercase">tokens</span></div>
                  <div className="text-[12px] font-bold font-mono text-olympus-cyan">{fmtTokens(task.tokensIn)} / {fmtTokens(task.tokensOut)}</div>
                  <div className="text-[8px] font-mono text-olympus-text-dim">
                    in / out{typeof task.estimatedCostUsd === 'number' ? ` · ~$${task.estimatedCostUsd.toFixed(4)}` : ''}
                  </div>
                </div>
                <div className="rounded-lg p-2 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-gold/15">
                  <div className="flex items-center gap-1 mb-0.5"><Clock size={10} className="text-olympus-gold" /><span className="text-[8px] font-mono text-olympus-text-dim uppercase">duration</span></div>
                  <div className="text-[12px] font-bold font-mono text-olympus-gold">{fmtDuration(task.durationMs)}</div>
                  <div className="text-[8px] font-mono text-olympus-text-dim">{task.ts ? new Date(task.ts).toLocaleTimeString('en-US', { hour12: false }) : ''}</div>
                </div>
                <div className="rounded-lg p-2 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-purple/15">
                  <div className="flex items-center gap-1 mb-0.5"><RotateCcw size={10} className="text-olympus-purple" /><span className="text-[8px] font-mono text-olympus-text-dim uppercase">retries</span></div>
                  <div className="text-[12px] font-bold font-mono text-olympus-purple">{task.retriesAbsorbed ?? 0}</div>
                  <div className="text-[8px] font-mono text-olympus-text-dim">absorbed</div>
                </div>
                <div className="rounded-lg p-2 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-red/15">
                  <div className="flex items-center gap-1 mb-0.5"><Wrench size={10} className="text-olympus-red" /><span className="text-[8px] font-mono text-olympus-text-dim uppercase">files</span></div>
                  <div className="text-[12px] font-bold font-mono text-olympus-red">{task.files.length}</div>
                  <div className="text-[8px] font-mono text-olympus-text-dim">touched</div>
                </div>
              </div>

              {/* THINKING — the agent's own reasoning, above its writes */}
              {task.reasoning ? (
                <div className="rounded-lg border border-olympus-purple/20 bg-olympus-purple/5">
                  <button
                    onClick={() => setShowThinking(v => !v)}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-left"
                    aria-expanded={showThinking}
                  >
                    {showThinking ? <ChevronDown size={11} className="text-olympus-purple" /> : <ChevronRight size={11} className="text-olympus-purple" />}
                    <Brain size={11} className="text-olympus-purple" />
                    <span className="text-[10px] font-mono font-semibold text-olympus-purple uppercase">{task.god}'s thinking</span>
                    <span className="text-[8px] font-mono text-olympus-text-dim ml-auto">{task.reasoning.length.toLocaleString()} chars</span>
                  </button>
                  {showThinking && (
                    <div className="px-3 pb-3 max-h-48 overflow-y-auto overscroll-contain custom-scroll">
                      <pre className="text-[10px] font-mono text-olympus-text whitespace-pre-wrap break-words leading-relaxed">{task.reasoning}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-olympus-text-dim/10 px-3 py-2 flex items-center gap-1.5">
                  <Brain size={11} className="text-olympus-text-dim" />
                  <span className="text-[9px] font-mono text-olympus-text-dim">
                    No thinking captured for this hop (pre-v0.0.4 rows carry none; new hops will).
                  </span>
                </div>
              )}

              {/* FILES — created/edited by this agent, each opens in the editor */}
              {task.files.length > 0 && (
                <div className="rounded-lg border border-olympus-gold/15 p-2.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <FilePen size={11} className="text-olympus-gold" />
                    <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">files touched</span>
                    <span className="text-[8px] font-mono text-olympus-text-dim ml-auto">click to open in your editor</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {task.files.map((f) => (
                      <button
                        key={`${f.tool}:${f.file}`}
                        onClick={() => { openInEditor(f.file); setOpenFile(f.file); setTimeout(() => setOpenFile(null), 1200); }}
                        className={cn(
                          'text-[9px] font-mono px-1.5 py-1 rounded ring-1 transition-colors max-w-full truncate',
                          openFile === f.file
                            ? 'bg-olympus-green/15 text-olympus-green ring-olympus-green/30'
                            : 'bg-olympus-card text-olympus-text ring-olympus-gold/20 hover:bg-olympus-gold/10 hover:text-olympus-gold',
                        )}
                        title={f.file}
                      >
                        {f.tool}: {f.file.split('/').pop()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* DIRECTIVE — the hop's prompt excerpt */}
              {task.promptExcerpt && (
                <div className="rounded-lg border border-olympus-text-dim/10 p-2.5">
                  <div className="text-[10px] font-mono font-semibold text-olympus-cyan uppercase mb-1">directive</div>
                  <div className="text-[10px] font-mono text-olympus-text-dim leading-relaxed max-h-28 overflow-y-auto overscroll-contain custom-scroll whitespace-pre-wrap">{task.promptExcerpt}…</div>
                </div>
              )}

              {/* W-D5: VERIFY CONTRACT — the deterministic gate the hop must
                  pass (the plan's own checks, rendered — nothing dead). */}
              {task.verify && typeof task.verify === 'object' && (
                <div className="rounded-lg border border-olympus-cyan/15 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShieldCheck size={11} className="text-olympus-cyan" />
                    <span className="text-[10px] font-mono font-semibold text-olympus-cyan uppercase">verify contract</span>
                    <span className="text-[8px] font-mono text-olympus-text-dim ml-auto">
                      {String((task.verify as any).review ?? 'deterministic')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray((task.verify as any).checks)
                      ? (task.verify as any).checks.map((c: string) => (
                          <span key={c} className="text-[9px] font-mono text-olympus-text bg-olympus-card px-1.5 py-0.5 rounded ring-1 ring-olympus-cyan/20">
                            {c}
                          </span>
                        ))
                      : <span className="text-[9px] font-mono text-olympus-text-dim">no checks declared</span>}
                  </div>
                </div>
              )}

              {/* ARTIFACTS — the deliverable contract */}
              {task.artifacts.length > 0 && (
                <div className="rounded-lg border border-olympus-green/15 p-2.5">
                  <div className="text-[10px] font-mono font-semibold text-olympus-green uppercase mb-1">deliverable artifacts</div>
                  <div className="space-y-0.5">
                    {task.artifacts.map((a) => (
                      <button
                        key={a}
                        onClick={() => openInEditor(a.includes('/') ? a : `${a}`)}
                        className="block text-[10px] font-mono text-olympus-green/90 hover:text-olympus-gold transition-colors truncate max-w-full text-left"
                        title={a}
                      >
                        ↳ {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {task.parkedReason && (
                <div className="rounded-lg border border-olympus-red/20 bg-olympus-red/5 px-3 py-2 text-[10px] font-mono text-olympus-red">
                  PARKED — {task.parkedReason}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
