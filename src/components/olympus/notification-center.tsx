/**
 * notification-center.tsx — v0.0.32 (Epic M).
 *
 * The tray dot tells the user something happened; this panel tells them WHAT
 * and takes them there. Every event carries a type; the row links to the exact
 * pane (delivery → Craft, curate → Brain, campaign → Activity). The panel also
 * owns the sleep contract: auto-hibernate on OS lock (persisted) and a
 * "hibernate now" button that asks the Electron main.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ChevronRight, Loader2, Moon, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOlympus } from '@/lib/olympus-store';
import type { NotifyType } from '@/lib/desktop-notify';
import { useLanguage, t, godName, godDomain } from '@/lib/i18n';
import { speakAs } from '@/lib/voice';

interface LearningItem {
  id: string;
  type: 'instinct' | 'knowledge' | 'skill' | 'mcp';
  name: string;
  god: string;
  summary: string;
}

interface NotifyEvent {
  ts: string;
  type: NotifyType;
  title: string;
  body: string;
}

const TONE: Record<NotifyType, { dot: string; text: string; pane: 'timeline' | 'craft-apps' | 'brain' | 'cost' }> = {
  ready: { dot: 'bg-olympus-green', text: 'text-olympus-green', pane: 'timeline' },
  error: { dot: 'bg-olympus-red', text: 'text-olympus-red', pane: 'timeline' },
  design: { dot: 'bg-olympus-purple', text: 'text-olympus-purple', pane: 'craft-apps' },
  walk: { dot: 'bg-olympus-cyan', text: 'text-olympus-cyan', pane: 'timeline' },
  compact: { dot: 'bg-olympus-amber-soft', text: 'text-olympus-amber-soft', pane: 'cost' },
  curate: { dot: 'bg-olympus-gold', text: 'text-olympus-gold', pane: 'brain' },
};

const SEEN_KEY = 'olympus:notify-seen';

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<NotifyEvent[]>([]);
  const [learnings, setLearnings] = useState<LearningItem[]>([]);
  const language = useLanguage();
  const [seenAt, setSeenAt] = useState<string>(() => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  });
  const [autoHibernate, setAutoHibernate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hibOpen, setHibOpen] = useState(false);
  const [hibHours, setHibHours] = useState(8);
  const [hibAuto, setHibAuto] = useState(true);
  const [hibBusy, setHibBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const setLeftPane = useOlympus((s) => s.setLeftPane);
  const docVisible = useOlympus((s) => s.leftPane) !== undefined; // keeps the component client-only

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/notify?limit=30', { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok && Array.isArray(d.events)) setEvents(d.events);
    } catch { /* offline */ }
  }, []);

  const loadPrefs = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/power/auto-hibernate', { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) setAutoHibernate(d.prefs?.autoHibernateOnLock !== false);
    } catch { /* default stays */ }
  }, []);

  useEffect(() => {
    void load();
    void loadPrefs();
    const iv = setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 15_000);
    return () => clearInterval(iv);
  }, [load, loadPrefs]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/olympus/learning/recent?limit=4', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setLearnings(Array.isArray(d?.learnings) ? d.learnings : []))
      .catch(() => { /* offline */ });
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = events.filter((e) => !seenAt || e.ts > seenAt).length;

  const markSeen = () => {
    const latest = events[0]?.ts ?? new Date().toISOString();
    setSeenAt(latest);
    try { localStorage.setItem(SEEN_KEY, latest); } catch { /* private mode */ }
  };

  // v0.0.52 — clear the archive and the local unread marker. The Electron
  // main closes the native notifications on focus; this removes the history
  // so a restart never resurrects a numeric badge.
  const clearAll = async () => {
    setEvents([]);
    markSeen();
    try { await fetch('/api/olympus/notify', { method: 'DELETE' }); } catch { /* offline */ }
  };

  const toggleAuto = async (value: boolean) => {
    setAutoHibernate(value);
    try {
      await fetch('/api/olympus/power/auto-hibernate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoHibernateOnLock: value }),
      });
    } catch { /* the local state stands */ }
  };

  const hibernateNow = async () => {
    setBusy(true);
    try {
      const api = (window as any).olympus;
      if (api?.hibernate) await api.hibernate();
      else await fetch('/api/olympus/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'walk', title: 'OLYMPUS — hibernate', body: 'The desktop app owns hibernation; open the tray menu if the window stays.' }),
      });
    } catch { /* optional */ }
    finally { setBusy(false); }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) markSeen(); }}
        className="relative flex items-center gap-1 px-1.5 py-1 rounded text-olympus-text-dim hover:text-olympus-gold transition-colors"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
      >
        <Bell size={11} />
        <span className="text-[9px] font-mono hidden sm:inline">notify</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-3 h-3 px-0.5 rounded-full bg-olympus-red text-[7px] font-mono text-white flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-80 max-w-[calc(100vw-1rem)] max-h-[420px] overflow-hidden rounded-lg border border-olympus-gold/25 bg-olympus-panel shadow-2xl z-[120] flex flex-col">
          <header className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-olympus-gold/10">
            <Bell size={10} className="text-olympus-gold" />
            <span className="text-[9px] font-mono font-semibold uppercase tracking-wide text-olympus-gold">notifications</span>
            <button onClick={markSeen} className="ml-auto text-[8px] font-mono text-olympus-text-dim hover:text-olympus-text">mark read</button>
            <button onClick={() => void clearAll()} className="text-[8px] font-mono text-olympus-text-dim hover:text-olympus-red" aria-label="Clear notifications">clear</button>
            <button onClick={() => setOpen(false)} aria-label="Close notifications" className="text-olympus-text-dim hover:text-olympus-red"><X size={11} /></button>
          </header>

          <div className="flex-1 min-h-0 overflow-auto custom-scroll">
            {learnings.length > 0 && (
              <div className="border-b border-olympus-green/15 bg-olympus-green/5">
                <div className="flex items-center gap-1 px-2.5 pt-1.5 text-[8px] font-mono uppercase tracking-wide text-olympus-green">
                  <Sparkles size={9} /> {t('learning.title', language)}
                </div>
                {learnings.slice(0, 4).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { void speakAs(`${t('learning.learned', language)} ${l.name}. ${l.summary}. ${t('learning.improved', language, { domain: godDomain(l.god, language) })}`, l.god, language); }}
                    className="w-full text-left px-2.5 py-1 border-t border-olympus-green/5 hover:bg-olympus-green/10 flex items-start gap-1.5"
                    data-tip="Click to hear what the god learned"
                  >
                    <span className="text-[7px] font-mono uppercase px-1 rounded bg-olympus-green/15 text-olympus-green shrink-0">{l.type}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9px] font-mono text-olympus-text truncate">{l.name}</span>
                      <span className="block text-[8px] font-mono text-olympus-text-dim truncate">{godName(l.god, language)} · click to hear it</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {events.length === 0 && (
              <p className="px-2.5 py-6 text-center text-[9px] font-mono text-olympus-text-dim">nothing yet — the tray will color when something happens</p>
            )}
            {events.map((e, i) => {
              const tone = TONE[e.type] ?? TONE.walk;
              return (
                <button
                  key={`${e.ts}-${i}`}
                  onClick={() => { setLeftPane(tone.pane); setOpen(false); }}
                  className="w-full text-left px-2.5 py-1.5 border-b border-olympus-gold/5 hover:bg-olympus-gold/5 transition-colors flex items-start gap-1.5"
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full mt-1 shrink-0', tone.dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className={cn('text-[9px] font-mono font-semibold truncate', tone.text)}>{e.title}</span>
                      <span className="ml-auto text-[8px] font-mono text-olympus-text-dim shrink-0">{relTime(e.ts)}</span>
                    </span>
                    <span className="block text-[9px] font-mono text-olympus-text-dim truncate">{e.body}</span>
                  </span>
                  <ChevronRight size={10} className="text-olympus-text-dim mt-0.5 shrink-0" />
                </button>
              );
            })}
          </div>

          <footer className="px-2.5 py-1.5 border-t border-olympus-gold/10 flex items-center gap-2">
            <Moon size={10} className="text-olympus-purple" />
            <span className="text-[8px] font-mono text-olympus-text-dim" data-tip="When the screen locks or logs out, close the window and keep the campaign running">
              hibernate on lock
            </span>
            <button
              onClick={() => void toggleAuto(!autoHibernate)}
              aria-pressed={autoHibernate}
              className={cn('ml-auto w-7 h-3.5 rounded-full transition-colors relative', autoHibernate ? 'bg-olympus-green/70' : 'bg-olympus-gold/20')}
              aria-label="Auto-hibernate on lock"
            >
              <span className={cn('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all', autoHibernate ? 'left-3.5' : 'left-0.5')} />
            </button>
            <button
              onClick={() => setHibOpen(true)}
              disabled={busy}
              className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-purple/15 text-olympus-purple ring-1 ring-olympus-purple/30 hover:bg-olympus-purple/25 disabled:opacity-50"
            >
              {busy ? <Loader2 size={9} className="animate-spin" /> : <Moon size={9} />} now
            </button>
          </footer>
        </div>
      )}

      {/* v0.0.55 — the night contract: how long may OLYMPUS work alone? */}
      {hibOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Hibernation plan">
          <div className="w-full max-w-sm rounded-xl border border-olympus-purple/30 bg-olympus-panel p-4 shadow-2xl">
            <div className="flex items-center gap-1.5 mb-1">
              <Moon size={13} className="text-olympus-purple" />
              <span className="text-[11px] font-mono font-semibold text-olympus-text">Hibernate & keep working</span>
              <button onClick={() => setHibOpen(false)} aria-label="Close hibernation plan" className="ml-auto text-olympus-text-dim hover:text-olympus-red"><X size={13} /></button>
            </div>
            <p className="text-[9px] font-mono text-olympus-text-dim leading-relaxed mb-3">
              The window closes; the campaign stays alive. How long may OLYMPUS work alone?
            </p>
            <div className="grid grid-cols-6 gap-1 mb-2">
              {[1,2,4,6,8,12].map((h) => (
                <button key={h} onClick={() => setHibHours(h)} className={cn('text-[10px] font-mono py-1 rounded border', hibHours === h ? 'border-olympus-purple/60 bg-olympus-purple/15 text-olympus-purple' : 'border-olympus-gold/15 text-olympus-text-dim hover:text-olympus-text')}>{h}h</button>
              ))}
            </div>
            <button onClick={() => setHibAuto((v) => !v)} className="w-full flex items-center gap-2 rounded border border-olympus-gold/15 px-2 py-1.5 mb-3 text-left">
              <span className={cn('w-7 h-3.5 rounded-full relative transition-colors', hibAuto ? 'bg-olympus-green/70' : 'bg-olympus-gold/20')}>
                <span className={cn('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all', hibAuto ? 'left-3.5' : 'left-0.5')} />
              </span>
              <span className="text-[9px] font-mono text-olympus-text">resolve parked and continue until done</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setHibOpen(false)} className="text-[9px] font-mono px-2 py-1 rounded text-olympus-text-dim hover:text-olympus-text">cancel</button>
              <button
                onClick={async () => {
                  setHibBusy(true);
                  try {
                    await fetch('/api/olympus/power/hibernate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours: hibHours, autoResume: hibAuto }) });
                    const api = (window as any).olympus;
                    if (api?.hibernate) await api.hibernate();
                    else await fetch('/api/olympus/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'walk', title: 'OLYMPUS — hibernation', body: `Authorized ${hibHours}h; the desktop app owns the window.` }) });
                    setHibOpen(false);
                  } catch { /* the plan is best-effort */ }
                  finally { setHibBusy(false); }
                }}
                disabled={hibBusy}
                className="ml-auto flex items-center gap-1 text-[9px] font-mono px-2.5 py-1 rounded bg-olympus-purple/15 text-olympus-purple ring-1 ring-olympus-purple/30 disabled:opacity-50"
              >
                {hibBusy ? <Loader2 size={9} className="animate-spin" /> : <Moon size={9} />} work {hibHours}h alone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
