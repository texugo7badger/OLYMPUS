/**
 * desktop-notify.ts — v0.0.32 (Epic M): the app side of tray notifications.
 *
 * Any server surface (a route, the walker, a tool bridge) can append one JSON
 * line to `~/.olympus/desktop-notifications.jsonl`; the Electron main tails
 * the file and paints the tray dot + native notification in the type color.
 * No IPC, no coupling to the renderer.
 *
 * The taxonomy is mirrored in `electron/desktop-notify.ts` (the Electron
 * tsconfig cannot import `src/` without moving the common root). The suite
 * pins both files so the colors never drift.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type NotifyType = 'ready' | 'error' | 'design' | 'walk' | 'compact' | 'curate';

export const NOTIFY_TYPES: NotifyType[] = ['ready', 'error', 'design', 'walk', 'compact', 'curate'];

/** The OLYMPUS palette (src/app/globals.css) — no invented colors. */
export const NOTIFY_COLORS: Record<NotifyType, string> = {
  ready: '#7BAE8E',   // olympus-green — something is ready
  error: '#C4756A',   // olympus-red — an error is being investigated
  design: '#9B7BAE',  // olympus-purple — Athena / Hephaestus design
  walk: '#6BAEB5',    // olympus-cyan — the walk is (re)starting
  compact: '#C4A265', // olympus-amber-soft — chat/terminal compacting
  curate: '#D4A574',  // olympus-gold — Callimachus curating
};

/**
 * v0.0.64 — the notification speaks the user's language. The server builds
 * the text from `~/.olympus/language.json`; English is the fallback.
 */
const NOTIFY_TEXT: Record<string, Record<string, string>> = {
  en: {
    'walk.title': 'OLYMPUS — walk starting',
    'walk.body': '{slug}: the plan is being walked (hops run on their gods\' lanes).',
    'park.title': 'OLYMPUS — campaign parked',
    'park.body': '{slug}: {reason}',
    'ready.title': 'OLYMPUS — ready',
    'ready.body': '{detail}',
  },
  'pt-BR': {
    'walk.title': 'OLYMPUS — caminhada iniciando',
    'walk.body': '{slug}: o plano está sendo caminhado (cada hop roda na lane do seu deus).',
    'park.title': 'OLYMPUS — campanha parada',
    'park.body': '{slug}: {reason}',
    'ready.title': 'OLYMPUS — pronto',
    'ready.body': '{detail}',
  },
};

export function notifyText(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const dict = NOTIFY_TEXT[lang] ?? NOTIFY_TEXT.en;
  const raw = dict[key] ?? NOTIFY_TEXT.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function readLanguage(home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus')): string {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(home, 'language.json'), 'utf-8'));
    return typeof raw?.language === 'string' ? raw.language : 'en';
  } catch { return 'en'; }
}

export interface DesktopNotification {
  ts: string;
  type: NotifyType;
  title: string;
  body: string;
}

export function isNotifyType(value: unknown): value is NotifyType {
  return typeof value === 'string' && (NOTIFY_TYPES as string[]).includes(value);
}

export function notifyFilePath(home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus')): string {
  return path.join(home, 'desktop-notifications.jsonl');
}

/** v0.0.52 — the file is an archive, not an unbounded log. Keep 100 lines. */
const MAX_NOTIFY_BYTES = 256 * 1024;
const KEEP_NOTIFY_LINES = 100;
function rotateNotifyFile(file: string): void {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < MAX_NOTIFY_BYTES) return;
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, lines.slice(-KEEP_NOTIFY_LINES).join('\n') + '\n', 'utf-8');
    fs.renameSync(tmp, file);
  } catch { /* a rotation failure never blocks an alert */ }
}

/**
 * Append an event. Best-effort by design: a notification is never allowed to
 * break the operation that produced it. Returns false when the write failed.
 */
export function appendDesktopNotify(
  input: { type: NotifyType; title: string; body: string },
  opts: { home?: string; now?: number } = {},
): boolean {
  if (!isNotifyType(input.type)) return false;
  const event: DesktopNotification = {
    ts: new Date(opts.now ?? Date.now()).toISOString(),
    type: input.type,
    title: String(input.title ?? 'OLYMPUS').slice(0, 160),
    body: String(input.body ?? '').slice(0, 600),
  };
  try {
    const file = notifyFilePath(opts.home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateNotifyFile(file);
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** Recent events, newest first (the panel/debug view). */
export function readDesktopNotifications(limit = 20, opts: { home?: string } = {}): DesktopNotification[] {
  try {
    const raw = fs.readFileSync(notifyFilePath(opts.home), 'utf-8');
    const events: DesktopNotification[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (isNotifyType(ev?.type)) {
          events.push({
            ts: String(ev.ts ?? ''),
            type: ev.type,
            title: String(ev.title ?? ''),
            body: String(ev.body ?? ''),
          });
        }
      } catch { /* skip a torn line */ }
    }
    return events.slice(-Math.max(1, limit)).reverse();
  } catch {
    return [];
  }
}
