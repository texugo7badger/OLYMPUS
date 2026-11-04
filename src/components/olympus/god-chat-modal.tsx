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
import { MessageSquare, Send, X, Loader2, Brain } from 'lucide-react';
import { useLanguage, godName } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-store';
import { resolvePalette } from '@/lib/theme';

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

interface Msg { role: 'you' | 'god'; text: string }

export default function GodChatModal({ godId, onClose }: { godId: string; onClose: () => void }) {
  const [language] = useLanguage();
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thought, setThought] = useState<TaskRow | null>(null);
  const [showThought, setShowThought] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'you', text }]);
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/god/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ god: godId, message: text }),
      });
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setMessages((m) => [...m, { role: 'god', text: String(d.text) }]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [godId, input, busy]);

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
          <button onClick={onClose} aria-label="Close the chat" className="ml-auto" style={{ color: palette.textDim }}>
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
          {messages.length === 0 && (
            <p className="text-[10.5px] font-mono leading-relaxed" style={{ color: palette.textDim }}>
              Ask {name} directly. This is its own session — Apollo is not in the middle.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="text-[8px] font-mono uppercase tracking-wide" style={{ color: m.role === 'you' ? palette.textDim : palette.gold }}>
                {m.role === 'you' ? 'you' : godId}
              </span>
              <div
                className="whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed"
                style={{
                  background: m.role === 'you' ? `${palette.cyan}12` : `${palette.gold}10`,
                  border: `1px solid ${m.role === 'you' ? palette.cyan : palette.gold}22`,
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: palette.textDim }}>
              <Loader2 size={10} className="animate-spin" /> {godId} is thinking…
            </div>
          )}
          {error && <p className="text-[9.5px] font-mono" style={{ color: palette.red }}>{error}</p>}
        </div>

        <div className="flex items-end gap-2 border-t px-3 py-2" style={{ borderColor: `${palette.gold}22` }}>
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
    </div>
  );
}
