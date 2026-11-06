'use client';

/**
 * CompanionNotifications — v0.0.85: the minimal feed, already shared with the PC.
 *
 * The same `desktop-notifications.jsonl` that paints the PC center feeds this
 * sheet. The phone adds two things the desktop cannot: native OS notifications
 * (through the PWA service worker) and the responsible god's voice on every
 * item.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useEffect } from 'react';
import { AlertTriangle, Bell, BellOff, CheckCircle2, Radio, Sparkles, Trash2, Volume2, X } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { OlympusPalette } from '@/lib/theme';
import type { CompanionEvent, CompanionNotificationsState } from '@/lib/use-companion-notifications';
import { relativeTime } from '@/lib/companion-text';

function typeColor(type: string, palette: OlympusPalette): string {
  switch (type) {
    case 'ready': return palette.green;
    case 'error': return palette.red;
    case 'design': return palette.purple;
    case 'walk': return palette.cyan;
    case 'compact': return palette.amberSoft;
    case 'curate': return palette.gold;
    default: return palette.gold;
  }
}

export interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
  state: CompanionNotificationsState;
  language: Language;
  palette: OlympusPalette;
}

export function CompanionNotificationsSheet({ open, onClose, state, language, palette }: NotificationsSheetProps) {
  useEffect(() => { if (open) state.markRead(); }, [open, state.markRead]);

  if (!open) return null;
  const dim = { color: palette.textDim } as const;
  return (
    <div className="fixed inset-0 z-[350] flex items-end bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('w.notifications', language)}>
      <div
        className="olympus-rise max-h-[86dvh] w-full overflow-y-auto rounded-t-2xl border-t p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        style={{ background: palette.panel, borderColor: `${palette.gold}33` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Bell size={14} style={{ color: palette.gold }} />
          <span className="text-[12px] font-semibold tracking-wide">{t('w.notifications', language)}</span>
          {state.unread > 0 && <span className="rounded-full px-1.5 py-0.5 text-[8px] font-mono" style={{ background: `${palette.gold}22`, color: palette.gold }}>{state.unread}</span>}
          <button onClick={onClose} aria-label="Close" className="ml-auto p-2" style={dim}><X size={16} /></button>
        </div>

        <div className="mt-2 rounded-xl p-3" style={{ background: `${palette.gold}08`, border: `1px solid ${palette.gold}22` }}>
          <div className="flex items-center gap-2">
            {state.permission === 'granted' ? <CheckCircle2 size={12} style={{ color: palette.green }} /> : <BellOff size={12} style={{ color: palette.gold }} />}
            <p className="min-w-0 flex-1 text-[10px] leading-snug" style={{ color: palette.text }}>
              {!state.supported ? t('w.notifyUnsupported', language) : state.permission === 'granted' ? t('w.notifyOn', language) : state.permission === 'denied' ? t('w.notifyBlocked', language) : t('w.enableNotify', language)}
            </p>
            {state.supported && state.permission !== 'granted' && state.permission !== 'denied' && (
              <button onClick={() => void state.enableNative()} className="shrink-0 rounded-full px-2 py-1 text-[8px] font-mono" style={{ border: `1px solid ${palette.gold}55`, color: palette.gold }}>
                {t('w.enableNotify', language)}
              </button>
            )}
          </div>
          <p className="mt-1 text-[8px] font-mono leading-relaxed" style={dim}>{t('w.notifyHint', language)}</p>
          <p className="mt-0.5 text-[8px] font-mono leading-relaxed" style={dim}>{t('w.notifyLimit', language)}</p>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-[8px] font-mono uppercase tracking-[0.2em]" style={dim}>{t('w.recent', language)}</span>
          {state.busy && <span className="text-[8px] font-mono" style={dim}>…</span>}
          {state.events.length > 0 && (
            <button onClick={() => void state.clear()} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-mono" style={{ border: `1px solid ${palette.red}33`, color: palette.red }}>
              <Trash2 size={8} /> {t('w.clear', language)}
            </button>
          )}
        </div>

        {state.events.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <Sparkles size={16} style={dim} />
            <p className="text-[10px]" style={dim}>{t('w.noNotifications', language)}</p>
          </div>
        ) : (
          <div className="mt-1 space-y-1.5">
            {state.events.map((event: CompanionEvent) => {
              const color = typeColor(event.type, palette);
              return (
                <div key={event.id} className="rounded-xl px-2.5 py-2" style={{ background: `${color}0a`, border: `1px solid ${color}22` }}>
                  <div className="flex items-start gap-2">
                    {event.type === 'error'
                      ? <AlertTriangle size={11} className="mt-0.5 shrink-0" style={{ color }} />
                      : event.type === 'ready'
                        ? <CheckCircle2 size={11} className="mt-0.5 shrink-0" style={{ color }} />
                        : event.type === 'walk'
                          ? <Radio size={11} className="mt-0.5 shrink-0" style={{ color }} />
                          : <Sparkles size={11} className="mt-0.5 shrink-0" style={{ color }} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold leading-snug">{event.title}</p>
                      <p className="mt-0.5 text-[9px] leading-relaxed" style={dim}>{event.body}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[8px] font-mono" style={dim}>
                        <span>{relativeTime(event.ts, language)}</span>
                        {event.hop && <span className="rounded-full px-1.5 py-0.5" style={{ background: `${color}18`, color }}>{event.hop}</span>}
                        {event.god && <span>{event.god}</span>}
                      </div>
                    </div>
                    <button onClick={() => state.speak(event)} aria-label={t('w.listen', language)} className="rounded-full p-1" style={dim}><Volume2 size={10} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompanionToast({ state, language, palette, onOpen }: { state: CompanionNotificationsState; language: Language; palette: OlympusPalette; onOpen?: () => void }) {
  const event = state.toast;
  if (!event) return null;
  const color = typeColor(event.type, palette);
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[360] olympus-rise" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-md items-start gap-2 rounded-2xl p-3 shadow-2xl" style={{ background: palette.panel, border: `1px solid ${color}55` }}>
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-[10px] font-semibold leading-snug">{event.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed" style={{ color: palette.textDim }}>{event.body}</p>
        </button>
        <button onClick={() => state.speak(event)} aria-label={t('w.listen', language)} className="rounded-full p-1" style={{ color }}><Volume2 size={11} /></button>
        <button onClick={state.dismissToast} aria-label="Dismiss" className="rounded-full p-1" style={{ color: palette.textDim }}><X size={12} /></button>
      </div>
    </div>
  );
}
