/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * POST /api/olympus/studio/converse
 *
 * The Pattern Studio's HUMAN conversation lane. The deterministic chat route
 * can summarize; this one lets the active god answer in its own words, in the
 * selected language, using the live walk as context — and never use tools or
 * start a campaign.
 *
 * Body: { message, god, language, conversationId? }
 * Returns: { ok, answer } or 503 (the client falls back to /studio/chat).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ensureServer, getOrCreateSession, runWarmMessage } from '@/lib/opencode-session';
import { readHopEvents } from '@/lib/hop-runtime/hop-events';
import { GOD_PERSONAS, godPersona } from '@/lib/god-personas';
import { godDisplayName, godDomainText, type GodLanguage } from '@/lib/god-names';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LANG: Record<string, { name: string; tag: string }> = {
  en: { name: 'English', tag: 'en' },
  'pt-BR': { name: 'Brazilian Portuguese', tag: 'pt-BR' },
  es: { name: 'Spanish', tag: 'es' },
  fr: { name: 'French', tag: 'fr' },
  de: { name: 'German', tag: 'de' },
  ja: { name: 'Japanese', tag: 'ja' },
  zh: { name: 'Chinese', tag: 'zh' },
};

function liveContext(): string {
  try {
    const events = readHopEvents({ limit: 160 }).events;
    const campaignId = [...events].reverse().find((e) => e.campaignId)?.campaignId ?? null;
    const campaign = campaignId ? events.filter((e) => e.campaignId === campaignId) : [];
    const hops = new Map<string, { god: string; status: string }>();
    for (const e of campaign) {
      if (!e.hop) continue;
      hops.set(e.hop, {
        god: String(e.god || 'god'),
        status: e.type === 'hop_done' ? 'done' : e.type === 'hop_parked' ? 'parked' : e.type === 'hop_verify' ? 'verified' : 'running',
      });
    }
    const done = [...hops.values()].filter((h) => h.status === 'done').length;
    const inflight = [...hops.values()].filter((h) => h.status === 'running' || h.status === 'verified').length;
    const recent = [...hops.entries()].slice(-8).map(([h, v]) => `${h} (${v.god}, ${v.status})`).join('; ');
    return `campaign ${campaignId ?? 'none'}; ${done}/${hops.size} hops done; ${inflight} in flight; recent: ${recent || 'none'}`;
  } catch {
    return 'no readable walk state';
  }
}

export async function POST(req: NextRequest) {
  // v0.0.63 — an LLM-spending POST on a public tunnel is a door with a bill
  // attached. The desktop passes via the HttpOnly cookie; the phone via
  // x-olympus-token.
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const message = String(body?.message || '').slice(0, 1200).trim();
  if (!message) return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  const god = String(body?.god || 'apollo').toLowerCase();
  const langKey = String(body?.language || 'en');
  const lang = LANG[langKey] ?? LANG.en;
  const persona = GOD_PERSONAS[god] ?? GOD_PERSONAS.apollo;
  const name = godDisplayName(god, langKey as GodLanguage);
  const domain = godDomainText(god, langKey as GodLanguage);
  // v0.0.63 — the Greek character (epithet + tone), authored in all seven
  // languages. The temperament sentence stays as the first-person voice.
  const character = godPersona(god, (langKey as GodLanguage));

  const prompt = `[OLYMPUS-STUDIO-CHAT — CONVERSATION ONLY]
You are ${name} — ${character.epithet}. ${domain}.
Your tone: ${character.tone}.
${langKey === 'pt-BR' ? persona.temperament.pt : persona.temperament.en}
Speak naturally in ${lang.name}, first person, warm, calm and concise (at most 90 words).
Do NOT use any tool. Do NOT read, write or edit files. Do NOT start a campaign or dispatch.
Do NOT repeat the user's message verbatim and do NOT read a report like a robot: understand it and answer in your own words, with one natural follow-up when useful.
Live walk context (use only if relevant): ${liveContext()}
User: ${message}`;

  try {
    const server = await ensureServer();
    if (!server) throw new Error('warm server unavailable');
    const sessionId = await getOrCreateSession(`studio-${god}`);
    let answer = '';
    await runWarmMessage({
      sessionId,
      text: prompt,
      agent: god,
      maxRuntimeMs: 85_000,
      onEvent: (ev: any) => {
        if (ev?.type === 'text') {
          const part = String(ev.part?.text || ev.text || '');
          if (!part) return;
          // The warm lane can emit the full block twice (stream + final).
          if (part.includes(answer) && answer.length > 0) answer = part;
          else if (!answer.includes(part)) answer += part;
        }
      },
    });
    answer = answer.trim();
    if (!answer) throw new Error('empty answer');
    return NextResponse.json({ ok: true, answer: answer.slice(0, 2400) });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      fallback: 'deterministic',
      error: e?.message || 'conversation lane unavailable',
    }, { status: 503 });
  }
}
