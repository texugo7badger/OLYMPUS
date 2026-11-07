/**
 * companion-text.ts — v0.0.85: the companion speaks every user's language.
 *
 * The briefing API is structured and language-neutral. This module turns it
 * into the short, readable sentences the widget renders and Apollo speaks:
 * project summary, the hop in flight, the last park, recent settles and the
 * next steps. Deterministic, no LLM, no tokens.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { godDisplayName, godDomainText } from './god-names';
import { t, type Language } from './i18n';
import type { BriefEvent, BriefHop, ProjectBriefing } from './project-briefing';

type Vars = Record<string, string | number>;

interface Templates {
  summary: string;
  summaryNoPlan: string;
  summaryDone: string;
  current: string;
  currentLost: string;
  parked: string;
  recentDone: string;
  recentParked: string;
  next: string;
  nextEmpty: string;
  speakIntro: string;
  listen: string;
}

const TEXT: Record<Language, Templates> = {
  en: {
    summary: '{name} is at {pct}% of the current plan — {done}/{total} hops. {running} running, {parked} parked.',
    summaryNoPlan: '{name} has no campaign plan on disk yet.',
    summaryDone: '{name} finished the current plan — {total} hops, {artifacts} artifacts on disk.',
    current: '{god} ({domain}) is working on {hop}.',
    currentLost: '{hop} was left in flight without a live process — resume to dispatch it again.',
    parked: '{hop} parked: {reason}. Apollo can investigate it.',
    recentDone: '{god} finished {hop}.',
    recentParked: '{god} parked {hop}.',
    next: 'Next: {items}.',
    nextEmpty: 'No pending hops — the plan is complete.',
    speakIntro: 'Apollo, briefing for {name}:',
    listen: 'listen',
  },
  'pt-BR': {
    summary: '{name} está em {pct}% do plano atual — {done}/{total} hops. {running} em voo, {parked} parado(s).',
    summaryNoPlan: '{name} ainda não tem um plano de campanha em disco.',
    summaryDone: '{name} concluiu o plano atual — {total} hops, {artifacts} artefatos em disco.',
    current: '{god} ({domain}) está trabalhando em {hop}.',
    currentLost: '{hop} ficou em voo sem processo vivo — retome para despachar de novo.',
    parked: '{hop} parou: {reason}. O Apolo pode investigar.',
    recentDone: '{god} concluiu {hop}.',
    recentParked: '{god} parou {hop}.',
    next: 'A seguir: {items}.',
    nextEmpty: 'Nenhum hop pendente — o plano está completo.',
    speakIntro: 'Apolo, resumo de {name}:',
    listen: 'ouvir',
  },
  es: {
    summary: '{name} está al {pct}% del plan actual — {done}/{total} hops. {running} en vuelo, {parked} detenido(s).',
    summaryNoPlan: '{name} todavía no tiene un plan de campaña en disco.',
    summaryDone: '{name} terminó el plan actual — {total} hops, {artifacts} artefactos en disco.',
    current: '{god} ({domain}) está trabajando en {hop}.',
    currentLost: '{hop} quedó en vuelo sin un proceso vivo — reanuda para enviarlo de nuevo.',
    parked: '{hop} se detuvo: {reason}. Apollo puede investigarlo.',
    recentDone: '{god} completó {hop}.',
    recentParked: '{god} detuvo {hop}.',
    next: 'Después: {items}.',
    nextEmpty: 'No hay hops pendientes — el plan está completo.',
    speakIntro: 'Apollo, resumen de {name}:',
    listen: 'escuchar',
  },
  fr: {
    summary: '{name} est à {pct}% du plan actuel — {done}/{total} hops. {running} en cours, {parked} arrêté(s).',
    summaryNoPlan: "{name} n'a pas encore de plan de campagne sur le disque.",
    summaryDone: '{name} a terminé le plan actuel — {total} hops, {artifacts} artefacts sur le disque.',
    current: '{god} ({domain}) travaille sur {hop}.',
    currentLost: "{hop} est resté en vol sans processus vivant — reprends pour le relancer.",
    parked: '{hop} est arrêté : {reason}. Apollo peut enquêter.',
    recentDone: '{god} a terminé {hop}.',
    recentParked: '{god} a arrêté {hop}.',
    next: 'Ensuite : {items}.',
    nextEmpty: 'Aucun hop en attente — le plan est complet.',
    speakIntro: 'Apollo, point sur {name} :',
    listen: 'écouter',
  },
  de: {
    summary: '{name} ist bei {pct}% des aktuellen Plans — {done}/{total} Hops. {running} laufen, {parked} angehalten.',
    summaryNoPlan: '{name} hat noch keinen Kampagnenplan auf der Platte.',
    summaryDone: '{name} hat den aktuellen Plan abgeschlossen — {total} Hops, {artifacts} Artefakte auf der Platte.',
    current: '{god} ({domain}) arbeitet an {hop}.',
    currentLost: '{hop} blieb ohne lebenden Prozess in der Luft — fortsetzen, um ihn erneut zu starten.',
    parked: '{hop} wurde angehalten: {reason}. Apollo kann es untersuchen.',
    recentDone: '{god} hat {hop} abgeschlossen.',
    recentParked: '{god} hat {hop} angehalten.',
    next: 'Als Nächstes: {items}.',
    nextEmpty: 'Keine offenen Hops — der Plan ist vollständig.',
    speakIntro: 'Apollo, Lage zu {name}:',
    listen: 'anhören',
  },
  ja: {
    summary: '{name} は現在のプランの {pct}% — {done}/{total} ホップ。{running} 実行中、{parked} 停止。',
    summaryNoPlan: '{name} にはまだキャンペーンプランがありません。',
    summaryDone: '{name} は現在のプランを完了しました — {total} ホップ、{artifacts} 個の成果物。',
    current: '{god}（{domain}）が {hop} に取り組んでいます。',
    currentLost: '{hop} はプロセスなしで残っています — 再開して再送してください。',
    parked: '{hop} が停止しました：{reason}。Apollo が調査できます。',
    recentDone: '{god} が {hop} を完了しました。',
    recentParked: '{god} が {hop} を停止しました。',
    next: '次：{items}。',
    nextEmpty: '保留中のホップはありません — プランは完了しています。',
    speakIntro: 'Apollo、{name} のブリーフィング：',
    listen: '聞く',
  },
  zh: {
    summary: '{name} 当前计划完成 {pct}% — {done}/{total} 个 hop。{running} 个运行中，{parked} 个已停止。',
    summaryNoPlan: '{name} 还没有磁盘上的任务计划。',
    summaryDone: '{name} 已完成当前计划 — {total} 个 hop，{artifacts} 个产物。',
    current: '{god}（{domain}）正在处理 {hop}。',
    currentLost: '{hop} 仍在飞行但没有活跃进程 — 恢复后将重新派发。',
    parked: '{hop} 已停止：{reason}。Apollo 可以调查。',
    recentDone: '{god} 完成了 {hop}。',
    recentParked: '{god} 停止了 {hop}。',
    next: '接下来：{items}。',
    nextEmpty: '没有待处理的 hop — 计划已完成。',
    speakIntro: 'Apollo，{name} 简报：',
    listen: '收听',
  },
};

function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

function god(godId: string, lang: Language): string {
  return godDisplayName(godId, lang) || godId;
}

function domain(godId: string, lang: Language): string {
  return godDomainText(godId, lang) || '';
}

export function hopText(hop: BriefHop, lang: Language): string {
  return `${god(hop.god, lang)} · ${hop.id}`;
}

export function summaryLine(briefing: ProjectBriefing, lang: Language): string {
  const tt = TEXT[lang] ?? TEXT.en;
  const overall = briefing.progress?.overall;
  if (!overall || overall.total === 0) return fill(tt.summaryNoPlan, { name: briefing.name });
  if (overall.completed >= overall.total && briefing.campaign.state !== 'running') {
    return fill(tt.summaryDone, {
      name: briefing.name,
      total: overall.total,
      artifacts: briefing.progress?.size.artifacts ?? 0,
    });
  }
  return fill(tt.summary, {
    name: briefing.name,
    pct: overall.pct,
    done: overall.completed,
    total: overall.total,
    running: overall.running,
    parked: briefing.parked ? 1 : 0,
  });
}

export function currentLine(hop: BriefHop, lang: Language): string {
  const tt = TEXT[lang] ?? TEXT.en;
  if (hop.status === 'lost') return fill(tt.currentLost, { hop: hop.id });
  return fill(tt.current, { god: god(hop.god, lang), domain: domain(hop.god, lang), hop: hop.id });
}

export function parkedLine(briefing: ProjectBriefing, lang: Language): string {
  if (!briefing.parked) return '';
  return fill((TEXT[lang] ?? TEXT.en).parked, {
    hop: briefing.parked.hopId,
    reason: briefing.parked.reason,
  });
}

export function recentLine(event: BriefEvent, lang: Language): string {
  const tt = TEXT[lang] ?? TEXT.en;
  const line = fill(event.status === 'completed' ? tt.recentDone : tt.recentParked, {
    god: god(event.god, lang),
    hop: event.hopId,
  });
  // v0.0.87 — measured speed, never a fake number; settled hops only.
  return event.tokensPerSec ? `${line} · ${event.tokensPerSec.toFixed(1)} tok/s` : line;
}

export function nextLine(briefing: ProjectBriefing, lang: Language): string {
  const tt = TEXT[lang] ?? TEXT.en;
  if (briefing.next.length === 0) return tt.nextEmpty;
  const items = briefing.next.slice(0, 3).map((hop) => hop.id).join(', ');
  return fill(tt.next, { items });
}

/** The complete spoken briefing; short enough for the TTS lane. */
export function briefingSpeech(briefing: ProjectBriefing, lang: Language): string {
  if (!briefing.ok) return briefing.error || 'briefing unavailable';
  const tt = TEXT[lang] ?? TEXT.en;
  const parts = [
    fill(tt.speakIntro, { name: briefing.name }),
    summaryLine(briefing, lang),
  ];
  if (briefing.current.length > 0) parts.push(currentLine(briefing.current[0], lang));
  if (briefing.parked) parts.push(parkedLine(briefing, lang));
  if (briefing.recent.length > 0 && !briefing.parked) parts.push(recentLine(briefing.recent[0], lang));
  parts.push(nextLine(briefing, lang));
  return parts.join(' ');
}

/** The visible briefing body (the same sentences the voice reads). */
export function briefingBody(briefing: ProjectBriefing, lang: Language): string[] {
  if (!briefing.ok) return [briefing.error || 'briefing unavailable'];
  const lines = [summaryLine(briefing, lang)];
  for (const hop of briefing.current.slice(0, 3)) lines.push(currentLine(hop, lang));
  if (briefing.parked) lines.push(parkedLine(briefing, lang));
  for (const event of briefing.recent.slice(0, 3)) lines.push(recentLine(event, lang));
  lines.push(nextLine(briefing, lang));
  return lines;
}

/** Relative time in the user's language (browser lane). */
export function relativeTime(iso: string, lang: Language): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const seconds = Math.round((Date.now() - ts) / 1_000);
  try {
    const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (Math.abs(seconds) < 60) return format.format(-seconds, 'second');
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return format.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return format.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    return format.format(-days, 'day');
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

const BRIEFING_INTENT = [
  /^(qual\s+(é|e)\s+o\s+)?(resumo|briefing|status|novidades|atualiza[cç][aã]o)(\s+do\s+(projeto|aime|olympus))?(\s+por\s+favor)?\??$/i,
  /^me\s+(atualiza|atualize|diz|conta|resume)\b/i,
  /o\s+que\s+(est[aá]\s+)?(sendo\s+)?(desenvolvido|acontecendo)/i,
  /como\s+(est[aá]|vai)\s+(o\s+|a\s+)?(projeto|campanha|aime|olympus)/i,
  /^(briefing|summary|status|update)(\s+me)?\??$/i,
  /^(catch\s+me\s+up|what'?s\s+(happening|being\s+developed)|how'?s\s+(the\s+)?(project|campaign))/i,
  /^(resumen|novedades|estado|c[oó]mo\s+v[aá])\b/i,
  /^(r[eé]sum[eé]|nouveaut[eé]s|point\s+sur)\b/i,
  /^(zusammenfassung|status|neuigkeiten|lage)\b/i,
  /^(概要|状況|進捗|まとめ)/,
  /^(总结|状态|进展|简报)/,
];

/** True only for an unambiguous "brief me" request — never a task command. */
export function isBriefingIntent(text: string): boolean {
  const q = String(text || '').trim();
  if (!q || q.length > 160) return false;
  // A command that names the walk/campaign/parked hop is work, not a briefing.
  if (/\b(walk|campaign|campanha|parked|hop|dispatch|deploy|build|code|c[oó]digo)\b/i.test(q)) return false;
  return BRIEFING_INTENT.some((re) => re.test(q));
}

export function listenLabel(lang: Language): string {
  return (TEXT[lang] ?? TEXT.en).listen || t('m.listen', lang);
}
