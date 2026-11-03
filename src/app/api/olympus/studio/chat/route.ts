/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * POST /api/olympus/studio/chat
 *
 * The Pattern Studio's discreet chat. It answers from the LIVE walk state
 * (the hop event log + the active project), never by starting a campaign and
 * never by spending a model token. "Summarize what is being done" is the
 * primary question; any other question gets the same honest situational
 * answer plus the right pointer to the terminal for deeper planning.
 *
 * Body: { question: string, god?: string, language?: string }
 * Returns: { ok, answer, summary: { campaignId, total, completed, inFlight, project } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { readHopEvents } from '@/lib/hop-runtime/hop-events';
import { getActiveProject } from '@/lib/project-context';
import { godIntro, godFallback, godThanks, isIntroIntent, isThanksIntent } from '@/lib/god-personas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Lang = 'en' | 'pt-BR' | 'es' | 'fr' | 'de' | 'ja' | 'zh';

const TEXT: Record<Lang, {
  noWalk: string;
  summary: (p: { project: string; campaign: string; total: number | string; completed: number; inflight: number; last: string }) => string;
  recent: string;
  deeper: string;
  youAsked: string;
}> = {
  en: {
    noWalk: 'No walk is running right now. Start a campaign from the terminal and every hop will appear here as a thought node.',
    summary: (p) => `Walk ${p.campaign || '—'} · project ${p.project || '—'}: ${p.completed}/${p.total} hops done, ${p.inflight} in flight. Last: ${p.last}.`,
    recent: 'Recent thoughts',
    deeper: 'I can summarize the live walk here. For a deeper plan or a code change, ask in the terminal — that is where the gods act.',
    youAsked: 'You asked',
  },
  'pt-BR': {
    noWalk: 'Nenhum walk está rodando agora. Inicie uma campanha no terminal e cada hop vai aparecer aqui como um nó de pensamento.',
    summary: (p) => `Walk ${p.campaign || '—'} · projeto ${p.project || '—'}: ${p.completed}/${p.total} hops concluídos, ${p.inflight} em execução. Último: ${p.last}.`,
    recent: 'Pensamentos recentes',
    deeper: 'Eu resumo o walk ao vivo aqui. Para um plano mais profundo ou mudança de código, peça no terminal — é lá que os deuses agem.',
    youAsked: 'Você perguntou',
  },
  es: {
    noWalk: 'No hay ningún walk en marcha. Inicia una campaña en la terminal y cada hop aparecerá aquí como un nodo de pensamiento.',
    summary: (p) => `Walk ${p.campaign || '—'} · proyecto ${p.project || '—'}: ${p.completed}/${p.total} hops hechos, ${p.inflight} en vuelo. Último: ${p.last}.`,
    recent: 'Pensamientos recientes',
    deeper: 'Puedo resumir el walk en vivo aquí. Para un plan más profundo o un cambio de código, pregunta en la terminal.',
    youAsked: 'Preguntaste',
  },
  fr: {
    noWalk: 'Aucun walk en cours. Lancez une campagne depuis le terminal et chaque hop apparaîtra ici comme un nœud de pensée.',
    summary: (p) => `Walk ${p.campaign || '—'} · projet ${p.project || '—'} : ${p.completed}/${p.total} hops terminés, ${p.inflight} en cours. Dernier : ${p.last}.`,
    recent: 'Pensées récentes',
    deeper: 'Je résume le walk en direct ici. Pour un plan plus profond ou un changement de code, demandez dans le terminal.',
    youAsked: 'Vous avez demandé',
  },
  de: {
    noWalk: 'Gerade läuft kein Walk. Starte eine Kampagne im Terminal — jeder Hop erscheint hier als Gedankenknoten.',
    summary: (p) => `Walk ${p.campaign || '—'} · Projekt ${p.project || '—'}: ${p.completed}/${p.total} Hops fertig, ${p.inflight} laufen. Zuletzt: ${p.last}.`,
    recent: 'Letzte Gedanken',
    deeper: 'Ich fasse den Live-Walk hier zusammen. Für einen tieferen Plan oder Codeänderungen frage im Terminal.',
    youAsked: 'Deine Frage',
  },
  ja: {
    noWalk: '現在実行中の walk はありません。ターミナルでキャンペーンを開始すると、各 hop がここに思考ノードとして現れます。',
    summary: (p) => `Walk ${p.campaign || '—'} · プロジェクト ${p.project || '—'}: ${p.completed}/${p.total} hops 完了、${p.inflight} 実行中。最新: ${p.last}.`,
    recent: '最近の思考',
    deeper: 'ここではライブ walk を要約できます。より深い計画やコード変更はターミナルで依頼してください。',
    youAsked: '質問',
  },
  zh: {
    noWalk: '当前没有运行中的 walk。在终端启动行动后，每个 hop 都会在这里显示为思维节点。',
    summary: (p) => `Walk ${p.campaign || '—'} · 项目 ${p.project || '—'}: 已完成 ${p.completed}/${p.total} 个 hops，${p.inflight} 个进行中。最近: ${p.last}.`,
    recent: '最近思维',
    deeper: '我可以在这里总结实时 walk。更深层的计划或代码改动，请在终端中提出。',
    youAsked: '你的问题',
  },
};

function langOf(raw: unknown): Lang {
  const v = String(raw || 'en');
  return (['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh'] as Lang[]).includes(v as Lang) ? (v as Lang) : 'en';
}

export async function POST(req: NextRequest) {
  // v0.0.63 — this route answers from live state; on a public tunnel it must
  // not be readable (or triggerable) by a stranger.
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const question = String(body?.question || '').slice(0, 800);
  const god = String(body?.god || 'apollo').toLowerCase();
  const lang = langOf(body?.language);
  const txt = TEXT[lang];

  const page = readHopEvents({ limit: 300 });
  const events = page.events;
  const lastCampaign = [...events].reverse().find((e) => e.campaignId)?.campaignId ?? null;
  const campaignEvents = lastCampaign ? events.filter((e) => e.campaignId === lastCampaign) : [];
  const project = String(
    campaignEvents[campaignEvents.length - 1]?.project
    || getActiveProject()?.name
    || '',
  );

  // Merge per hop: a single hop may have start/verify/done/park frames.
  const hops = new Map<string, { god: string; status: string; ts: string }>();
  for (const e of campaignEvents) {
    if (!e.hop) continue;
    const status = e.type === 'hop_done' ? 'done' : e.type === 'hop_parked' ? 'parked' : e.type === 'hop_verify' ? 'verified' : 'running';
    hops.set(e.hop, { god: String(e.god || 'god'), status, ts: e.ts });
  }
  const completed = [...hops.values()].filter((h) => h.status === 'done').length;
  const inflight = [...hops.values()].filter((h) => h.status === 'running' || h.status === 'verified').length;
  const total = campaignEvents.find((e) => e.type === 'campaign_start')?.total ?? hops.size;
  const last = [...hops.entries()].sort((a, b) => b[1].ts.localeCompare(a[1].ts))[0];
  const lastLine = last ? `${last[1].god} · ${last[0]} · ${last[1].status}` : '—';

  const summary = {
    campaignId: lastCampaign,
    total: total ?? hops.size,
    completed,
    inFlight: inflight,
    project,
  };

  if (isIntroIntent(question)) {
    return NextResponse.json({ ok: true, answer: godIntro(god, lang), summary });
  }
  if (isThanksIntent(question)) {
    return NextResponse.json({ ok: true, answer: godThanks(lang), summary });
  }

  if (!lastCampaign) {
    return NextResponse.json({ ok: true, answer: godFallback(god, lang, 'idle'), summary });
  }

  const head = `**${god[0].toUpperCase() + god.slice(1)} → ${txt.summary({ project, campaign: lastCampaign, total: summary.total, completed, inflight, last: lastLine })}**`;
  const recentLines = [...hops.entries()]
    .sort((a, b) => b[1].ts.localeCompare(a[1].ts))
    .slice(0, 6)
    .map(([hop, h]) => `- \`${hop}\` · ${h.god} · ${h.status}`)
    .join('\n');
  const wantsSummary = !question || /resum|summary|status|what.*(doing|happening)|andamento|acontec|progress|état|stand|was.*läuft|進捗|当前/i.test(question);
  if (!wantsSummary) {
    return NextResponse.json({
      ok: true,
      answer: `${godFallback(god, lang, `${completed}/${summary.total} hops · ${inflight} in flight`)}`,
      summary,
    });
  }

  return NextResponse.json({
    ok: true,
    answer: `${head}\n\n${txt.recent}:\n${recentLines}`,
    summary,
  });
}
