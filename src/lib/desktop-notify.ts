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
    'hop.title': 'OLYMPUS — hop done',
    'hop.body': '{slug}: {god} finished {hop} ({duration}).',
    'hopPark.title': 'OLYMPUS — hop parked',
    'hopPark.body': '{slug}: {hop} parked ({reason}). The campaign keeps going.',
    'done.title': 'OLYMPUS — campaign finished',
    'done.body': '{slug}: the plan is complete ({completed}/{total} hops).',
    'phone.title': 'OLYMPUS — phone prompt sent',
    'phone.body': '{project}: Apollo received the phone prompt — {detail}',
    'phoneDone.title': 'OLYMPUS — Apollo answered',
    'phoneDone.body': '{answer}',
    'phoneFail.title': 'OLYMPUS — phone prompt failed',
    'phoneFail.body': '{reason}',
  },
  'pt-BR': {
    'walk.title': 'OLYMPUS — caminhada iniciando',
    'walk.body': '{slug}: o plano está sendo caminhado (cada hop roda na lane do seu deus).',
    'park.title': 'OLYMPUS — campanha parada',
    'park.body': '{slug}: {reason}',
    'ready.title': 'OLYMPUS — pronto',
    'ready.body': '{detail}',
    'hop.title': 'OLYMPUS — hop concluído',
    'hop.body': '{slug}: {god} concluiu {hop} ({duration}).',
    'hopPark.title': 'OLYMPUS — hop parado',
    'hopPark.body': '{slug}: {hop} parou ({reason}). A campanha continua.',
    'done.title': 'OLYMPUS — campanha concluída',
    'done.body': '{slug}: o plano terminou ({completed}/{total} hops).',
    'phone.title': 'OLYMPUS — prompt do celular enviado',
    'phone.body': '{project}: o Apolo recebeu o prompt do celular — {detail}',
    'phoneDone.title': 'OLYMPUS — Apolo respondeu',
    'phoneDone.body': '{answer}',
    'phoneFail.title': 'OLYMPUS — prompt do celular falhou',
    'phoneFail.body': '{reason}',
  },
  es: {
    'walk.title': 'OLYMPUS — la caminata comienza',
    'walk.body': '{slug}: el plan se está recorriendo (cada hop corre en la lane de su dios).',
    'park.title': 'OLYMPUS — campaña detenida',
    'park.body': '{slug}: {reason}',
    'ready.title': 'OLYMPUS — listo',
    'ready.body': '{detail}',
    'hop.title': 'OLYMPUS — hop completado',
    'hop.body': '{slug}: {god} completó {hop} ({duration}).',
    'hopPark.title': 'OLYMPUS — hop detenido',
    'hopPark.body': '{slug}: {hop} se detuvo ({reason}). La campaña continúa.',
    'done.title': 'OLYMPUS — campaña terminada',
    'done.body': '{slug}: el plan está completo ({completed}/{total} hops).',
    'phone.title': 'OLYMPUS — prompt del móvil enviado',
    'phone.body': '{project}: Apollo recibió el prompt del móvil — {detail}',
    'phoneDone.title': 'OLYMPUS — Apollo respondió',
    'phoneDone.body': '{answer}',
    'phoneFail.title': 'OLYMPUS — el prompt del móvil falló',
    'phoneFail.body': '{reason}',
  },
  fr: {
    'walk.title': 'OLYMPUS — la marche commence',
    'walk.body': '{slug} : le plan est parcouru (chaque hop tourne sur la lane de son dieu).',
    'park.title': 'OLYMPUS — campagne arrêtée',
    'park.body': '{slug} : {reason}',
    'ready.title': 'OLYMPUS — prêt',
    'ready.body': '{detail}',
    'hop.title': 'OLYMPUS — hop terminé',
    'hop.body': '{slug} : {god} a terminé {hop} ({duration}).',
    'hopPark.title': 'OLYMPUS — hop arrêté',
    'hopPark.body': '{slug} : {hop} s\'est arrêté ({reason}). La campagne continue.',
    'done.title': 'OLYMPUS — campagne terminée',
    'done.body': '{slug} : le plan est complet ({completed}/{total} hops).',
    'phone.title': 'OLYMPUS — prompt mobile envoyé',
    'phone.body': '{project} : Apollo a reçu le prompt mobile — {detail}',
    'phoneDone.title': 'OLYMPUS — Apollo a répondu',
    'phoneDone.body': '{answer}',
    'phoneFail.title': 'OLYMPUS — le prompt mobile a échoué',
    'phoneFail.body': '{reason}',
  },
  de: {
    'walk.title': 'OLYMPUS — Lauf startet',
    'walk.body': '{slug}: Der Plan wird abgearbeitet (jeder Hop läuft auf der Lane seines Gottes).',
    'park.title': 'OLYMPUS — Kampagne angehalten',
    'park.body': '{slug}: {reason}',
    'ready.title': 'OLYMPUS — bereit',
    'ready.body': '{detail}',
    'hop.title': 'OLYMPUS — Hop fertig',
    'hop.body': '{slug}: {god} hat {hop} abgeschlossen ({duration}).',
    'hopPark.title': 'OLYMPUS — Hop angehalten',
    'hopPark.body': '{slug}: {hop} wurde angehalten ({reason}). Die Kampagne läuft weiter.',
    'done.title': 'OLYMPUS — Kampagne beendet',
    'done.body': '{slug}: Der Plan ist vollständig ({completed}/{total} Hops).',
    'phone.title': 'OLYMPUS — Handy-Prompt gesendet',
    'phone.body': '{project}: Apollo hat den Handy-Prompt erhalten — {detail}',
    'phoneDone.title': 'OLYMPUS — Apollo hat geantwortet',
    'phoneDone.body': '{answer}',
    'phoneFail.title': 'OLYMPUS — Handy-Prompt fehlgeschlagen',
    'phoneFail.body': '{reason}',
  },
  ja: {
    'walk.title': 'OLYMPUS — ウォーク開始',
    'walk.body': '{slug}: プランを実行中です（各ホップは担当神のレーンで動きます）。',
    'park.title': 'OLYMPUS — キャンペーン停止',
    'park.body': '{slug}: {reason}',
    'ready.title': 'OLYMPUS — 準備完了',
    'ready.body': '{detail}',
    'hop.title': 'OLYMPUS — ホップ完了',
    'hop.body': '{slug}: {god} が {hop} を完了しました（{duration}）。',
    'hopPark.title': 'OLYMPUS — ホップ停止',
    'hopPark.body': '{slug}: {hop} が停止しました（{reason}）。キャンペーンは継続します。',
    'done.title': 'OLYMPUS — キャンペーン完了',
    'done.body': '{slug}: プランが完了しました（{completed}/{total} ホップ）。',
    'phone.title': 'OLYMPUS — スマホのプロンプトを送信',
    'phone.body': '{project}: Apollo がスマホのプロンプトを受け取りました — {detail}',
    'phoneDone.title': 'OLYMPUS — Apollo が回答しました',
    'phoneDone.body': '{answer}',
    'phoneFail.title': 'OLYMPUS — スマホのプロンプトが失敗',
    'phoneFail.body': '{reason}',
  },
  zh: {
    'walk.title': 'OLYMPUS — 开始执行',
    'walk.body': '{slug}：正在执行计划（每个 hop 在对应神的 lane 上运行）。',
    'park.title': 'OLYMPUS — 任务停止',
    'park.body': '{slug}：{reason}',
    'ready.title': 'OLYMPUS — 已就绪',
    'ready.body': '{detail}',
    'hop.title': 'OLYMPUS — hop 完成',
    'hop.body': '{slug}：{god} 完成了 {hop}（{duration}）。',
    'hopPark.title': 'OLYMPUS — hop 停止',
    'hopPark.body': '{slug}：{hop} 已停止（{reason}）。任务继续。',
    'done.title': 'OLYMPUS — 任务完成',
    'done.body': '{slug}：计划已完成（{completed}/{total} 个 hop）。',
    'phone.title': 'OLYMPUS — 手机提示已发送',
    'phone.body': '{project}：Apollo 已收到手机提示 — {detail}',
    'phoneDone.title': 'OLYMPUS — Apollo 已回答',
    'phoneDone.body': '{answer}',
    'phoneFail.title': 'OLYMPUS — 手机提示失败',
    'phoneFail.body': '{reason}',
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
  /** v0.0.85 — optional provenance so the phone can name the hop and god. */
  hop?: string;
  god?: string;
  slug?: string;
  status?: string;
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
  input: {
    type: NotifyType;
    title: string;
    body: string;
    hop?: string;
    god?: string;
    slug?: string;
    status?: string;
  },
  opts: { home?: string; now?: number } = {},
): boolean {
  if (!isNotifyType(input.type)) return false;
  const event: DesktopNotification = {
    ts: new Date(opts.now ?? Date.now()).toISOString(),
    type: input.type,
    title: String(input.title ?? 'OLYMPUS').slice(0, 160),
    body: String(input.body ?? '').slice(0, 600),
    ...(input.hop ? { hop: String(input.hop).slice(0, 80) } : {}),
    ...(input.god ? { god: String(input.god).slice(0, 40) } : {}),
    ...(input.slug ? { slug: String(input.slug).slice(0, 80) } : {}),
    ...(input.status ? { status: String(input.status).slice(0, 60) } : {}),
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
            ...(typeof ev.hop === 'string' ? { hop: ev.hop } : {}),
            ...(typeof ev.god === 'string' ? { god: ev.god } : {}),
            ...(typeof ev.slug === 'string' ? { slug: ev.slug } : {}),
            ...(typeof ev.status === 'string' ? { status: ev.status } : {}),
          });
        }
      } catch { /* skip a torn line */ }
    }
    return events.slice(-Math.max(1, limit)).reverse();
  } catch {
    return [];
  }
}
