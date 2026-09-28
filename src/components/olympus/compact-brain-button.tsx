/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useOlympus } from '@/lib/olympus-store';
import { Brain, Loader2, Undo2, Check, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PHASE_NAMES = [
 'complete aliases',
 'merge duplicates',
 'fix dead links',
 'link orphans',
 'expand empty pages',
];

const WARN_PREF_KEY = 'olympus.compactBrain.warningDismissed';

/**
 * Compact Brain button + 5-phase progress overlay.
 *
 * impeccable refactor:
 * - Replaced the giant hover tooltip with a click-triggered warning
 * dialog. A "don't show this again" checkbox persists to
 * localStorage so power users can opt out.
 * - Idle button has no tooltip at all — its label is self-explanatory.
 * - Warning copy distilled to: what it does, when not to run it, and
 * a single recommended cadence sentence. No multi-line lectures.
 *
 * State machine (unchanged):
 * idle -> in-progress -> undo-window -> cooldown -> idle
 */
export default function CompactBrainButton() {
 const compactState = useOlympus(s => s.compactState);
 const setCompactState = useOlympus(s => s.setCompactState);
 const phases = useOlympus(s => s.compactPhases);
 const setCompactPhases = useOlympus(s => s.setCompactPhases);
 const updatePhase = useOlympus(s => s.updatePhase);
 const startCooldown = useOlympus(s => s.startCooldown);
 const startUndoWindow = useOlympus(s => s.startUndoWindow);
 const compactRunId = useOlympus(s => s.compactRunId);
 const clearCompact = useOlympus(s => s.clearCompact);
 const pushEvent = useOlympus(s => s.pushEvent);
 const cooldownEnds = useOlympus(s => s.compactCooldownEnds);
 const undoEnds = useOlympus(s => s.compactUndoEnds);
 // Mid-task guard — button is disabled while a god/task is running.
 const isTaskRunning = useOlympus(s => s.isTaskRunning);

 const [now, setNow] = useState(Date.now());
 const [showOverlay, setShowOverlay] = useState(false);
 const [undoInProgress, setUndoInProgress] = useState(false);
 const [showWarning, setShowWarning] = useState(false);
 const [warnDismissed, setWarnDismissed] = useState(false);

 // Load the "don't show again" preference on mount.
 useEffect(() => {
 if (typeof window === 'undefined') return;
 setWarnDismissed(localStorage.getItem(WARN_PREF_KEY) === '1');
 }, []);

 useEffect(() => {
 const t = setInterval(() => setNow(Date.now()), 250);
 return () => clearInterval(t);
 }, []);

 // Auto-transition: cooldown -> idle when cooldown expires.
 useEffect(() => {
 if (compactState === 'cooldown' && cooldownEnds && now > cooldownEnds) {
 clearCompact();
 }
 if (compactState === 'undo-window' && undoEnds && now > undoEnds) {
 startCooldown(60);
 }
 }, [compactState, cooldownEnds, undoEnds, now, clearCompact, startCooldown]);

 const triggerCompact = useCallback(async () => {
 if (compactState !== 'idle') return;
 if (isTaskRunning) {
 pushEvent({ type: 'compact_blocked', msg: 'Compact Brain blocked — a task is running. Wait for it to finish.', ts: new Date().toISOString() });
 return;
 }
 setCompactState('in-progress');
 setShowOverlay(true);
 setCompactPhases(PHASE_NAMES.map((name, i) => ({ id: i + 1, name, status: 'pending' as const })));
 pushEvent({ type: 'compact_start', msg: 'Compact Brain triggered — Callimachus deep compaction (7-stage lifecycle + alias/duplicate merge)', ts: new Date().toISOString() });

 try {
 const res = await fetch('/api/olympus/callimachus/heartbeat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ deep: true }),
 });

 if (res.status === 429) {
 const data = await res.json();
 setShowOverlay(false);
 startCooldown(60);
 pushEvent({ type: 'compact_blocked', msg: data.message || 'Compact Brain on cooldown.', ts: new Date().toISOString() });
 return;
 }

 if (!res.body) throw new Error('no stream');
 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buf = '';
 let runId: string | null = null;
 let logCount = 0;
 let currentPhase = 0;

 for (;;) {
 const { done, value } = await reader.read();
 if (done) break;
 buf += decoder.decode(value, { stream: true });
 const parts = buf.split('\n\n');
 buf = parts.pop() || '';
 for (const part of parts) {
 const line = part.replace(/^data: /, '').trim();
 if (!line) continue;
 try {
 const ev = JSON.parse(line);

 if (ev.type === 'start') {
 runId = `Callimachus-${Date.now()}`;
 updatePhase(1, { status: 'start', desc: 'Callimachus deep compaction started' });
 currentPhase = 1;
 }

 if (ev.type === 'log' && ev.msg) {
 logCount++;
 const msgLower = ev.msg.toLowerCase();
 if (msgLower.includes('alias') && currentPhase < 2) {
 if (currentPhase >= 1) updatePhase(currentPhase, { status: 'done', fixed: 0 });
 currentPhase = 2;
 updatePhase(2, { status: 'start', desc: ev.msg });
 } else if (msgLower.includes('duplicate') && currentPhase < 3) {
 if (currentPhase >= 1) updatePhase(currentPhase, { status: 'done', fixed: 0 });
 currentPhase = 3;
 updatePhase(3, { status: 'start', desc: ev.msg });
 } else if (msgLower.includes('link') && currentPhase < 4) {
 if (currentPhase >= 1) updatePhase(currentPhase, { status: 'done', fixed: 0 });
 currentPhase = 4;
 updatePhase(4, { status: 'start', desc: ev.msg });
 } else if (msgLower.includes('expand') && currentPhase < 5) {
 if (currentPhase >= 1) updatePhase(currentPhase, { status: 'done', fixed: 0 });
 currentPhase = 5;
 updatePhase(5, { status: 'start', desc: ev.msg });
 }
 pushEvent({ type: 'compact_phase', phase: currentPhase, name: ev.msg.slice(0, 80), ts: new Date().toISOString() });
 }

 if (ev.type === 'exit') {
 for (let p = currentPhase; p <= 5; p++) {
 updatePhase(p, { status: 'done', fixed: 0 });
 }
 if (ev.code === 0) {
 pushEvent({ type: 'compact_done', msg: `Callimachus deep compaction complete (${logCount} log events).`, run_id: runId, ts: new Date().toISOString() });
 } else {
 pushEvent({ type: 'compact_error', msg: `Callimachus exited with code ${ev.code}`, ts: new Date().toISOString() });
 }
 }

 if (ev.type === 'error') {
 pushEvent({ type: 'compact_error', msg: ev.msg || 'Unknown error', ts: new Date().toISOString() });
 }
 } catch {}
 }
 }
 setShowOverlay(false);
 startUndoWindow(5, runId || `run-${Date.now()}`);
 pushEvent({ type: 'compact_done', msg: `Deep compaction complete. Undo window 5min.`, run_id: runId, ts: new Date().toISOString() });
 } catch (e: any) {
 setShowOverlay(false);
 startCooldown(60);
 pushEvent({ type: 'compact_error', msg: e.message, ts: new Date().toISOString() });
 }
 }, [compactState, isTaskRunning, setCompactState, setCompactPhases, updatePhase, startUndoWindow, startCooldown, pushEvent]);

 const undo = useCallback(async () => {
 if (compactState !== 'undo-window' || !compactRunId) return;
 setUndoInProgress(true);
 try {
 const res = await fetch('/api/olympus/compact/undo', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ runId: compactRunId }),
 });
 const data = await res.json().catch(() => ({}));
 if (res.ok && data.ok) {
 pushEvent({ type: 'undo', run_id: compactRunId, msg: `Restored compaction ${compactRunId}`, ts: new Date().toISOString() });
 clearCompact();
 startCooldown(60);
 } else {
 pushEvent({ type: 'undo_failed', run_id: compactRunId, msg: `Undo failed: ${data.error || res.statusText}`, ts: new Date().toISOString() });
 }
 } catch (e: any) {
 pushEvent({ type: 'undo_failed', run_id: compactRunId, msg: `Undo network error: ${e.message}`, ts: new Date().toISOString() });
 } finally {
 setUndoInProgress(false);
 }
 }, [compactState, compactRunId, pushEvent, clearCompact, startCooldown]);

 const cooldownRemaining = cooldownEnds ? Math.max(0, Math.ceil((cooldownEnds - now) / 1000)) : 0;
 const undoRemaining = undoEnds ? Math.max(0, Math.ceil((undoEnds - now) / 1000)) : 0;
 const midTaskBlocked = isTaskRunning && compactState === 'idle';

 const handleCompactClick = useCallback(() => {
 if (compactState === 'undo-window') {
 undo();
 return;
 }
 if (compactState !== 'idle' || midTaskBlocked) return;
 if (warnDismissed) {
 triggerCompact();
 } else {
 setShowWarning(true);
 }
 }, [compactState, midTaskBlocked, warnDismissed, undo, triggerCompact]);

 const dismissWarning = useCallback((dontShowAgain: boolean) => {
 if (dontShowAgain && typeof window !== 'undefined') {
 localStorage.setItem(WARN_PREF_KEY, '1');
 setWarnDismissed(true);
 }
 setShowWarning(false);
 }, []);

 const confirmWarning = useCallback((dontShowAgain: boolean) => {
 if (dontShowAgain && typeof window !== 'undefined') {
 localStorage.setItem(WARN_PREF_KEY, '1');
 setWarnDismissed(true);
 }
 setShowWarning(false);
 triggerCompact();
 }, [triggerCompact]);

 return (
 <div className="relative">
 <button
 onClick={handleCompactClick}
 disabled={compactState === 'cooldown' || compactState === 'in-progress' || midTaskBlocked || undoInProgress}
 aria-label="Compact Brain"
 className={cn(
 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
 compactState === 'idle' && !midTaskBlocked && 'bg-olympus-gold/15 text-olympus-gold hover:bg-olympus-gold/25 ring-1 ring-olympus-gold/30',
 compactState === 'idle' && midTaskBlocked && 'bg-olympus-card text-[#5A5A5A] cursor-not-allowed ring-1 ring-olympus-red/20',
 compactState === 'cooldown' && 'bg-olympus-card text-[#5A5A5A] cursor-not-allowed ring-1 ring-olympus-gold/10',
 compactState === 'in-progress' && 'bg-olympus-gold/25 text-olympus-gold cursor-wait ring-1 ring-olympus-gold/40',
 compactState === 'undo-window' && 'bg-olympus-red/15 text-olympus-red hover:bg-olympus-red/25 ring-1 ring-olympus-red/30 animate-pulse',
 )}
 >
 {compactState === 'in-progress' ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
 {compactState === 'idle' && (midTaskBlocked ? 'Compact (busy)' : 'Compact Brain')}
 {compactState === 'cooldown' && <>Compact Brain ({cooldownRemaining}s)</>}
 {compactState === 'in-progress' && 'Compacting…'}
 {compactState === 'undo-window' && (undoInProgress ? <><Loader2 size={12} className="animate-spin" /> Undoing…</> : <><Undo2 size={12} /> Undo ({undoRemaining}s)</>)}
 </button>

 {/* Click-triggered warning dialog — replaces the giant hover tooltip. */}
 {showWarning && (
 <WarningDialog
 onConfirm={confirmWarning}
 onCancel={dismissWarning}
 />
 )}

 {/* 5-phase progress overlay -- Olympus pastel palette */}
 {showOverlay && (
 <div className="absolute top-full right-0 mt-2 w-72 bg-olympus-card border border-olympus-gold/25 rounded-lg p-3 z-50">
 <div className="flex items-center gap-2 mb-2.5">
 <Brain size={14} className="text-olympus-gold" />
 <span className="text-[11px] font-semibold text-olympus-gold">Brain Compaction — 5 phases</span>
 </div>
 <div className="flex flex-col gap-1.5">
 {phases.map(p => (
 <div key={p.id} className="flex items-center gap-2 text-[10px] font-mono">
 <span className={cn(
 'w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0',
 p.status === 'done' && 'bg-olympus-green/20 text-olympus-green',
 p.status === 'start' && 'bg-olympus-gold/20 text-olympus-gold',
 p.status === 'pending' && 'bg-olympus-bg text-[#5A5A5A]',
 )}>
 {p.status === 'done' ? <Check size={8} /> : p.status === 'start' ? <Loader2 size={8} className="animate-spin" /> : p.id}
 </span>
 <span className={cn(
 'flex-1',
 p.status === 'done' && 'text-olympus-green line-through',
 p.status === 'start' && 'text-olympus-gold',
 p.status === 'pending' && 'text-olympus-text-dim',
 )}>{p.name}</span>
 {p.fixed != null && p.status === 'done' && (
 <span className="text-olympus-green">+{p.fixed}</span>
 )}
 </div>
 ))}
 </div>
 <div className="mt-2.5 pt-2 border-t border-olympus-gold/10 text-[9px] text-[#5A5A5A] font-mono">
 soft-delete · 5-min undo window · 60s cooldown · mid-task guarded
 </div>
 </div>
 )}
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* WarningDialog — click-triggered, with "don't show again" checkbox. */
/* ------------------------------------------------------------------ */
function WarningDialog({
 onConfirm,
 onCancel,
}: {
 onConfirm: (dontShowAgain: boolean) => void;
 onCancel: (dontShowAgain: boolean) => void;
}) {
 const [dontShow, setDontShow] = useState(false);

 return (
 <div
 className="fixed inset-0 z-[300] bg-black/60 flex items-start justify-center pt-[20vh]"
 onClick={() => onCancel(dontShow)}
 >
 <div
 className="w-full max-w-md bg-olympus-card border border-olympus-gold/25 rounded-lg shadow-md overflow-hidden"
 onClick={e => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-olympus-gold/10">
 <div className="flex items-center gap-2 text-olympus-gold">
 <AlertTriangle size={14} />
 <span className="text-[11px] font-mono font-semibold uppercase tracking-wide">Before you compact</span>
 </div>
 <button
 onClick={() => onCancel(dontShow)}
 className="text-olympus-text-dim hover:text-olympus-text"
 aria-label="Close"
 >
 <X size={14} />
 </button>
 </div>

 {/* Body — distilled to 2 short paragraphs */}
 <div className="px-4 py-3 text-[11px] font-mono text-olympus-text leading-relaxed space-y-2">
 <p>
 Compact Brain runs Callimachus deep maintenance — alias merge, duplicate merge, dead-link fix,
 orphan link, empty-page expand.
 </p>
 <p className="text-olympus-text-dim">
 Overuse erases recent learning. Recommended cadence: ≤1×/week, never mid-task, never below 50 notes.
 Check <code className="text-olympus-gold">/instinct-status</code> first.
 </p>
 </div>

 {/* Don't show again */}
 <label className="flex items-center gap-2 px-4 py-2 border-t border-olympus-gold/10 text-[10px] font-mono text-olympus-text-dim hover:bg-olympus-gold/5">
 <input
 type="checkbox"
 checked={dontShow}
 onChange={e => setDontShow(e.target.checked)}
 className="w-3 h-3 accent-olympus-gold"
 />
 Don&apos;t show this warning again
 </label>

 {/* Footer — specific verb labels, no OK/Cancel */}
 <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-olympus-gold/10">
 <button
 onClick={() => onCancel(dontShow)}
 className="px-3 py-1.5 rounded-md text-[11px] font-mono text-olympus-text-dim hover:bg-olympus-gold/5"
 >
 Keep editing
 </button>
 <button
 onClick={() => onConfirm(dontShow)}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25"
 >
 <Brain size={11} /> Run compaction
 </button>
 </div>
 </div>
 </div>
 );
}
