'use client';

/**
 * use-companion-notifications — v0.0.85: the same feed on the PC and the phone.
 *
 * The desktop notification file is the single source of truth. The phone
 * polls it, shows an in-app toast while visible, and raises a native Android/
 * iOS notification through the service worker when the app is hidden.
 *
 * Honest limit: this is local notification while the PWA process is alive.
 * True background push (app killed) needs Web Push subscriptions and arrives
 * with the native wrapper; the UI says so instead of pretending.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { mobileFetch } from './mobile-fetch';
import type { NotifyType } from './desktop-notify';
import type { Language } from './i18n';
import { speakAs } from './voice';

export interface CompanionEvent {
  id: string;
  ts: string;
  type: NotifyType;
  title: string;
  body: string;
  hop?: string;
  god?: string;
  slug?: string;
  status?: string;
}

const LAST_NOTIFIED_KEY = 'olympus:companion-notified-at';
const SEEN_KEY = 'olympus:companion-seen-at';
const ENABLED_KEY = 'olympus:companion-native-notify';

export interface CompanionNotificationsState {
  events: CompanionEvent[];
  unread: number;
  toast: CompanionEvent | null;
  permission: NotificationPermission;
  supported: boolean;
  nativeEnabled: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  markRead: () => void;
  clear: () => Promise<void>;
  enableNative: () => Promise<boolean>;
  dismissToast: () => void;
  speak: (event: CompanionEvent) => void;
}

export function useCompanionNotifications(opts: { token: string | null; language: Language }): CompanionNotificationsState {
  const { token, language } = opts;
  const [events, setEvents] = useState<CompanionEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<CompanionEvent | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const [nativeEnabled, setNativeEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastNotified = useRef('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      setSupported(typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator);
      setPermission(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied');
      lastNotified.current = localStorage.getItem(LAST_NOTIFIED_KEY) || '';
      setNativeEnabled(localStorage.getItem(ENABLED_KEY) === '1');
    } catch { /* private mode */ }
  }, []);

  const showToast = useCallback((event: CompanionEvent) => {
    setToast(event);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 9_000);
  }, []);

  const announce = useCallback(async (event: CompanionEvent) => {
    // Foreground → the quiet in-app card. Background → the OS notification.
    const canNative = typeof Notification !== 'undefined' && Notification.permission === 'granted';
    if (document.visibilityState === 'hidden' && canNative && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(event.title || 'OLYMPUS', {
          body: event.body,
          tag: event.id,
          icon: '/m/icon/192',
          badge: '/m/icon/96',
          data: { url: event.hop ? '/m/widget' : '/m/widget', type: event.type, god: event.god },
        });
        return;
      } catch { /* fall through to the in-app toast */ }
    }
    showToast(event);
  }, [showToast]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const response = await mobileFetch('/api/olympus/notify?limit=30', {
        cache: 'no-store',
        headers: { 'x-olympus-token': token },
      }, 15_000);
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      const list: CompanionEvent[] = Array.isArray(data?.events)
        ? data.events
          .filter((event: any) => event && typeof event.ts === 'string' && typeof event.type === 'string')
          .map((event: any, index: number) => ({
            id: `${event.ts}-${event.type}-${event.hop || index}`,
            ts: event.ts,
            type: event.type,
            title: String(event.title || 'OLYMPUS'),
            body: String(event.body || ''),
            ...(typeof event.hop === 'string' ? { hop: event.hop } : {}),
            ...(typeof event.god === 'string' ? { god: event.god } : {}),
            ...(typeof event.slug === 'string' ? { slug: event.slug } : {}),
            ...(typeof event.status === 'string' ? { status: event.status } : {}),
          }))
        : [];
      setEvents(list);
      let seenAt = '';
      try { seenAt = localStorage.getItem(SEEN_KEY) || ''; } catch { /* private */ }
      setUnread(list.filter((event) => !seenAt || event.ts > seenAt).length);

      if (lastNotified.current) {
        const fresh = list
          .filter((event) => event.ts > lastNotified.current!)
          .sort((a, b) => a.ts.localeCompare(b.ts));
        for (const event of fresh) void announce(event);
      }
      const newest = list[0]?.ts || '';
      if (newest && newest !== lastNotified.current) {
        lastNotified.current = newest;
        try { localStorage.setItem(LAST_NOTIFIED_KEY, newest); } catch { /* private */ }
      }
    } catch { /* offline: the last feed stands */ }
    finally { setBusy(false); }
  }, [token, announce]);

  useEffect(() => {
    if (!token) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, 8_000);
    return () => clearInterval(timer);
  }, [token, refresh]);

  const markRead = useCallback(() => {
    const newest = events[0]?.ts || new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, newest); } catch { /* private */ }
    setUnread(0);
  }, [events]);

  const clear = useCallback(async () => {
    if (!token) return;
    try {
      await mobileFetch('/api/olympus/notify', { method: 'DELETE', headers: { 'x-olympus-token': token } }, 15_000);
    } catch { /* offline: clear the local view anyway */ }
    setEvents([]);
    setUnread(0);
    setToast(null);
  }, [token]);

  const enableNative = useCallback(async () => {
    if (!supported) return false;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      const granted = result === 'granted';
      setNativeEnabled(granted);
      try { localStorage.setItem(ENABLED_KEY, granted ? '1' : '0'); } catch { /* private */ }
      if (granted && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('OLYMPUS', {
          body: language === 'pt-BR' ? 'Notificações ativas — o Apolo avisa quando um hop terminar ou parar.' : 'Notifications are on — Apollo will tell you when a hop finishes or parks.',
          tag: 'olympus-notify-on',
          icon: '/m/icon/192',
          data: { url: '/m/widget' },
        });
      }
      return granted;
    } catch {
      return false;
    }
  }, [supported, language]);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const speak = useCallback((event: CompanionEvent) => {
    void speakAs(`${event.title}. ${event.body}`, event.god || 'apollo', language);
  }, [language]);

  return {
    events,
    unread,
    toast,
    permission,
    supported,
    nativeEnabled,
    busy,
    refresh,
    markRead,
    clear,
    enableNative,
    dismissToast,
    speak,
  };
}
