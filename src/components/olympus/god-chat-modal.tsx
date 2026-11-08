/**
 * god-chat-modal.tsx — v0.0.76: one god, one conversation.
 *
 * The Parthenon showed every god's stats but had no way to ASK them anything.
 * This modal opens a direct chat with the selected god (its own agent), shows
 * its latest thought (the reasoning captured from its last hop) and what it is
 * doing (the task status), and keeps the answer in the modal — the terminal's
 * Apollo session is never touched.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X, Loader2, Brain, Mic, ListPlus, Crosshair, Check, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage, godName } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-store';
import { resolvePalette } from '@/lib/theme';
import { useHoldToTalk } from '@/lib/use-hold-to-talk';
import DesignStudioModal from './design-studio-modal';

interface TaskRow {
  id: string;
  god?: string;
  status?: string;
  durationMs?: number;
  tokensIn?: number | null;
  tokensOut?: number | null;
  reasoning?: string | null;
  artifacts?: string[];
}

interface Msg {
  id: string;
  role: 'you' | 'god' | 'system';
  text: string;
  god?: string;
  source?: string;
  status?: string;
  ts?: string;
  replyTo?: string | null;
  meta?: Record<string, any> | null;
}

export default function GodChatModal({ godId, onClose }: { godId: string; onClose: () => void }) {
  const [language] = useLanguage();
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thought, setThought] = useState<TaskRow | null>(null);
  const [showThought, setShowThought] = useState(false);
  const [lane, setLane] = useState<string | null>(null);
  // v0.0.77 — the god↔god working session: a second god reads the first
  // answer and replies with its own view (one round, two turns).
  const [withGod, setWithGod] = useState<string>('');
  const [queued, setQueued] = useState(false);
  // v0.0.91 — design moved out of ArtCraft and into Athena's conversation.
  const [designOpen, setDesignOpen] = useState(false);
  const hold = useHoldToTalk({
    language: language as any,
    onText: (text) => { setInput(text); },
    onError: (msg) => setError(msg),
  });
  const listRef = useRef<HTMLDivElement>(null);

  // v0.0.86 — ONE DURABLE THREAD. The inbox is the authority: chat turns and
  // mark-preview requests (with Athena's replies) live in the same list, so a
  // mark sent from the phone is visible here on the desktop and survives a
  // modal close. Poll while open for in-flight marks.
  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`/api/olympus/god/inbox?god=${godId}&limit=80`, { cache: 'no-store' });
      const d = await r.json();
      if (!d?.ok) return;
      setMessages((d.entries || []).map((e: any) => ({
        id: String(e.id),
        role: e.role === 'god' ? 'god' : e.role === 'system' ? 'system' : 'you',
        text: String(e.text ?? ''),
        god: e?.meta?.fromGod || e.god,
        source: e.source,
        status: e.status,
        ts: e.ts,
        replyTo: e.replyTo ?? null,
        meta: e.meta ?? null,
      })));
    } catch { /* the chat still works without history */ }
  }, [godId]);
  useEffect(() => {
    void loadHistory();
    const iv = setInterval(() => { void loadHistory(); }, 5_000);
    return () => clearInterval(iv);
  }, [loadHistory]);

  // The god's latest thought = the reasoning of its last hop (the lane's own
  // telemetry), plus the task status/tokens — "what it is doing", not a guess.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/olympus/tasks', { cache: 'no-store' });
        const d = await r.json();
        if (cancelled) return;
        const mine = (d?.tasks || []).filter((t: TaskRow) => String(t.god || '').toLowerCase() === godId);
        setThought(mine[0] ?? null);
      } catch { /* the chat works without the thought */ }
    })();
    return () => { cancelled = true; };
  }, [godId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, busy]);

  // v0.0.90 — the mark approval gate: Athena plans, the user approves, Apollo
  // writes the campaign override and Atlas resumes/fixes the walk.
  const approveMark = useCallback(async (m: Msg) => {
    const slug = String(m.meta?.projectSlug || '');
    if (!slug) { setError('No project on this mark — open the mark from an active project.'); return; }
    setApproving(m.id); setError(null);
    try {
      const r = await fetch('/api/olympus/athena/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, plan: m.text, inboxId: m.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      toast.success('Approved — the plan goes to the walk', {
        description: 'The approved plan becomes a hop override; Atlas applies it on the next attempt and the warden resumes a parked hop.',
      });
      await loadHistory();
    } catch (e: any) {
      setError(e?.message || String(e));
      toast.error('The handoff failed', { description: e?.message || String(e) });
    } finally { setApproving(null); }
  }, [loadHistory]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setPendingUser(text);
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/god/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ god: godId, message: text, ...(withGod ? { withGod } : {}) }),
      });
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      if (typeof d.lane === 'string') setLane(d.lane);
      setQueued(false);
      await loadHistory();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPendingUser(null);
      setBusy(false);
    }
  }, [godId, input, busy, withGod, loadHistory]);

  const queueAnswer = useCallback(async (text: string) => {
    const slug = lane ? lane.split(/[\\/]/).filter(Boolean).pop() : '';
    if (!slug) { setError('No active project to queue into.'); return; }
    try {
      const r = await fetch('/api/olympus/prompt-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: slug, text, source: 'creative', god: godId }),
      });
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setQueued(true);
    } catch (e: any) { setError(e?.message || String(e)); }
  }, [lane, godId]);

  const name = godName(godId, language as any);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Chat with ${name}`}
        className="flex h-[560px] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{ background: palette.panel, borderColor: `${palette.gold}44`, color: palette.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: `${palette.gold}22` }}>
          <MessageSquare size={14} style={{ color: palette.gold }} />
          <span className="text-[12px] font-mono font-semibold" style={{ color: palette.gold }}>{name}</span>
          <span className="text-[9px] font-mono" style={{ color: palette.textDim }}>· {godId}</span>
          {godId === 'athena' && (
            <button
              type="button"
              onClick={() => setDesignOpen(true)}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono ring-1 transition-colors"
              style={{ color: palette.gold, borderColor: `${palette.gold}44`, background: `${palette.gold}10` }}
              data-tip="Open the Athena design studio — style board + build recipes"
            >
              <Palette size={10} /> design
            </button>
          )}
          <button onClick={onClose} aria-label="Close the chat" className={godId === 'athena' ? 'ml-1' : 'ml-auto'} style={{ color: palette.textDim }}>
            <X size={14} />
          </button>
        </div>

        {thought && (
          <div className="border-b px-4 py-2" style={{ borderColor: `${palette.gold}18`, background: `${palette.gold}08` }}>
            <button
              onClick={() => setShowThought((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[9px] font-mono"
              style={{ color: palette.textDim }}
            >
              <Brain size={10} style={{ color: palette.cyan }} />
              <span style={{ color: palette.cyan }}>last thought</span>
              <span>{thought.id}</span>
              <span>· {thought.status ?? '—'}</span>
              <span>· {thought.tokensIn ?? '—'} in / {thought.tokensOut ?? '—'} out</span>
              <span className="ml-auto">{showThought ? 'hide' : 'show'}</span>
            </button>
            {showThought && (
              <pre className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-[9.5px] leading-relaxed font-mono" style={{ color: palette.text }}>
                {thought.reasoning?.trim() || 'No reasoning captured for this hop.'}
              </pre>
            )}
          </div>
        )}

        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {messages.length === 0 && !pendingUser && (
            <p className="text-[10.5px] font-mono leading-relaxed" style={{ color: palette.textDim }}>
              Ask {name} directly. This is its own session — Apollo is not in the middle.
              A mark sent from the live preview lands in this same thread.
            </p>
          )}
          {messages.map((m) => {
            const isMark = m.source === 'mark';
            const isSystem = m.role === 'system';
            const waiting = isMark && (m.status === 'pending' || m.status === 'running');
            return (
              <div key={m.id} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-wide" style={{ color: m.role === 'you' ? palette.textDim : isSystem ? palette.red : palette.gold }}>
                  {isMark && <Crosshair size={8} style={{ color: palette.cyan }} />}
                  {isSystem ? 'system' : m.role === 'you' ? (isMark ? 'you · mark' : 'you') : godName(m.god ?? godId, language as any)}
                  {m.ts && <span className="ml-auto normal-case tracking-normal opacity-60">{new Date(m.ts).toLocaleTimeString()}</span>}
                </span>
                <div
                  className="whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed"
                  style={{
                    background: isSystem ? `${palette.red}0e` : m.role === 'you' ? `${palette.cyan}12` : `${palette.gold}10`,
                    border: `1px solid ${isSystem ? palette.red : m.role === 'you' ? palette.cyan : palette.gold}22`,
                  }}
                >
                  {m.text}
                </div>
                {waiting && (
                  <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: palette.cyan }}>
                    <Loader2 size={8} className="animate-spin" /> {name} is applying this mark…
                  </span>
                )}
                {m.role === 'god' && !isSystem && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void queueAnswer(m.text)}
                      className="flex items-center gap-1 text-[8px] font-mono"
                      style={{ color: queued ? palette.green : palette.textDim }}
                      data-tip="Queue this answer as the next prompt (creative queue)"
                    >
                      <ListPlus size={9} /> {queued ? 'queued' : 'queue this'}
                    </button>
                    {m.source === 'mark' && m.status === 'done' && (
                      <button
                        onClick={() => void approveMark(m)}
                        disabled={approving === m.id}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-semibold"
                        style={{ background: `${palette.green}18`, color: palette.green, border: `1px solid ${palette.green}55` }}
                        data-tip="Approve this plan: it becomes a hop override; Atlas applies it on the next attempt and the warden resumes a parked hop."
                      >
                        {approving === m.id ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />}
                        {approving === m.id ? 'handing off…' : 'Approve → Apollo + Atlas'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {pendingUser && (
            <div className="flex flex-col gap-0.5 opacity-70">
              <span className="text-[8px] font-mono uppercase tracking-wide" style={{ color: palette.textDim }}>you</span>
              <div
                className="whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed"
                style={{ background: `${palette.cyan}12`, border: `1px solid ${palette.cyan}22` }}
              >
                {pendingUser}
              </div>
            </div>
          )}
          {busy && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: palette.textDim }}>
              <Loader2 size={10} className="animate-spin" /> {name} is thinking…
            </div>
          )}
          {error && <p className="text-[9.5px] font-mono" style={{ color: palette.red }}>{error}</p>}
        </div>

        <div className="flex items-center gap-1.5 border-t px-3 pt-2" style={{ borderColor: `${palette.gold}22` }}>
          <span className="text-[8px] font-mono" style={{ color: palette.textDim }}>discuss with</span>
          <select
            value={withGod}
            onChange={(e) => setWithGod(e.target.value)}
            aria-label="Discuss with a second god"
            className="rounded bg-transparent px-1 py-0.5 text-[8.5px] font-mono outline-none"
            style={{ color: palette.text, border: `1px solid ${palette.gold}33` }}
          >
            <option value="" style={{ background: palette.panel }}>— alone —</option>
            {['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']
              .filter((g) => g !== godId)
              .map((g) => (
                <option key={g} value={g} style={{ background: palette.panel }}>{godName(g, language as any)}</option>
              ))}
          </select>
          {withGod && <span className="text-[8px] font-mono" style={{ color: palette.cyan }}>one round · two turns</span>}
        </div>
        <div className="flex items-end gap-2 px-3 pb-2 pt-1">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={`Ask ${name}…`}
            aria-label={`Message ${name}`}
            className="max-h-28 flex-1 resize-none bg-transparent text-[11px] font-mono outline-none"
            style={{ color: palette.text }}
          />
          <button
            onPointerDown={(e) => { e.preventDefault(); if (hold.supported && !busy) void hold.start(); }}
            onPointerUp={(e) => { e.preventDefault(); hold.stop(); }}
            onPointerLeave={() => { if (hold.recording) hold.stop(); }}
            disabled={busy || !hold.supported}
            aria-label={hold.recording ? 'Release to transcribe' : 'Hold to talk'}
            data-tip={hold.supported ? 'Hold to talk (server STT)' : 'Microphone needs HTTPS or localhost'}
            className="rounded px-2 py-1 disabled:opacity-40"
            style={{ background: hold.recording ? `${palette.red}22` : `${palette.cyan}14`, color: hold.recording ? palette.red : palette.cyan, border: `1px solid ${palette.cyan}33` }}
          >
            {hold.transcribing ? <Loader2 size={11} className="animate-spin" /> : <Mic size={11} />}
          </button>
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="rounded px-2 py-1 text-[9px] font-mono disabled:opacity-40"
            style={{ background: `${palette.gold}18`, color: palette.gold, border: `1px solid ${palette.gold}44` }}
          >
            <Send size={11} />
          </button>
        </div>
      </div>
      {designOpen && <DesignStudioModal onClose={() => setDesignOpen(false)} />}
    </div>
  );
}
