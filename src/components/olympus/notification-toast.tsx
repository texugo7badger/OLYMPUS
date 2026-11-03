'use client';

/**
 * notification-toast.tsx — v0.0.64: the notification follows the user's theme.
 *
 * The OS paints native notifications in ITS theme (GNOME dark), not in the
 * palette the user picked. When the window is visible the main process sends
 * the event over IPC and this component renders the same notification as a
 * themed card: palette bg/panel/text, the type's accent (walk = cyan, ready =
 * green, error = red, design = purple, compact = amber, curate = gold).
 *
 * When the window is hidden the native notification still fires — the OS owns
 * that surface, and we say so instead of pretending otherwise.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useEffect, useMemo, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { resolvePalette, type OlympusPalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';

type NotifyType = 'ready' | 'error' | 'design' | 'walk' | 'compact' | 'curate';
type Toast = { id: string; type: NotifyType; title: string; body: string; ts: string };

const TINT: Record<NotifyType, keyof OlympusPalette> = {
  ready: 'green', error: 'red', design: 'purple', walk: 'cyan', compact: 'amberSoft', curate: 'gold',
};

export default function NotificationToast() {
  const [theme] = useTheme();
  const palette = useMemo(() => resolvePalette(theme), [theme]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const api = (window as any)?.olympus;
    if (!api?.on) return;
    const onNotify = (payload: any) => {
      if (!payload || typeof payload.title !== 'string') return;
      const type = (['ready', 'error', 'design', 'walk', 'compact', 'curate'] as string[]).includes(payload.type)
        ? payload.type as NotifyType : 'ready';
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, type, title: payload.title, body: String(payload.body || ''), ts: payload.ts || new Date().toISOString() }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 7000);
    };
    api.on('olympus:notify', onNotify);
    return () => { try { api.off?.('olympus:notify'); } catch { /* gone */ } };
  }, []);

  if (toasts.length === 0) return null;
  const stable = theme.motion === 'stable';

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[300] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const tint = palette[TINT[toast.type]] || palette.gold;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-xl border shadow-2xl ${stable ? '' : 'olympus-toast-in'}`}
            style={{ background: palette.panel, borderColor: `${tint}55`, color: palette.text, boxShadow: `0 10px 30px ${palette.bg}AA` }}
          >
            <div className="flex items-start gap-2.5 p-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${tint}1F`, color: tint }}>
                <Bell size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold" style={{ color: tint }}>{toast.title}</div>
                <div className="mt-0.5 break-words text-[10px] leading-relaxed" style={{ color: palette.text, opacity: 0.78 }}>{toast.body}</div>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                aria-label="Dismiss"
                className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                style={{ color: palette.text }}
              >
                <X size={12} />
              </button>
            </div>
            <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${tint}, transparent)` }} />
          </div>
        );
      })}
    </div>
  );
}
