/**
 * POST /api/olympus/preview/generate — v0.0.80: the fast preview.
 *
 * One bounded Athena turn returns a single static page (HTML + CSS) as JSON;
 * the route writes it to `~/.olympus/previews/<slug>/` (never into the
 * project — a read-only lane is never touched) and starts the tiny static
 * host. The user asks explicitly; nothing is generated automatically.
 *
 * GET ?project → the current generated preview URL (or null).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { getProject } from '@/lib/project-context';
import { getVaultRoot } from '@/lib/vault-root';
import { computeAlignment } from '@/lib/alignment';
import { runGodTurn } from '@/lib/god-run';
import { parsePreviewAnswer, previewUrl, startPreviewServer, writePreview } from '@/lib/generated-preview';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 240_000;

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const slug = req.nextUrl.searchParams.get('project') || '';
  if (!slug) return NextResponse.json({ ok: false, error: 'project is required' }, { status: 400 });
  return NextResponse.json({ ok: true, url: previewUrl(slug) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const slug = String(body?.project || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'project is required' }, { status: 400 });

  const project = getProject(slug);
  if (!project) return NextResponse.json({ ok: false, error: `project not found: ${slug}` }, { status: 404 });
  const lane = project.path || path.join(getVaultRoot(), '02_Projects', slug);
  if (!fs.existsSync(lane)) return NextResponse.json({ ok: false, error: `lane not found: ${lane}` }, { status: 409 });

  const alignment = computeAlignment(slug);
  if (!alignment?.ready) {
    return NextResponse.json({ ok: false, error: `alignment ${alignment?.score ?? 0}/100 — missing: ${(alignment?.missing ?? []).join(', ')}`, alignment }, { status: 409 });
  }

  const prompt = [
    'You are Athena, the frontend god of OLYMPUS. Create a FAST static preview of the project below.',
    '',
    `Project: ${project.name} (${slug})`,
    `Description: ${project.description || '(none)'}`,
    `Stacks: ${(project.stacks || []).join(', ') || '(none detected)'}`,
    '',
    'Return ONLY a JSON object, no markdown fences, no prose:',
    '{"html":"<!doctype html>...","css":"..."}',
    '',
    'Rules:',
    '- ONE page: the first showcase page (hero, 2-3 sections, footer).',
    '- OLYMPUS palette: bg #0B0C10, panel #12141A, gold #D4A574, text #E8E6E1, dim #9A968E, cyan #67C9E8.',
    '- Responsive 320px to desktop, system font stack, NO external assets, NO images, NO scripts.',
    '- Semantic HTML, accessible contrast (>= 4.5:1), a skip link.',
    '- Under 160 lines total. This is a skeleton to navigate, not the final product.',
  ].join('\n');

  const started = Date.now();
  const turn = await runGodTurn('athena', prompt, lane, TIMEOUT_MS);
  if (!turn.ok) return NextResponse.json({ ok: false, error: turn.error, god: 'athena' }, { status: 502 });

  const parsed = parsePreviewAnswer(turn.text);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: 'the god did not return the JSON {html, css}', raw: turn.text.slice(-800) }, { status: 502 });
  }

  writePreview(slug, parsed.html, parsed.css);
  const server = await startPreviewServer(slug);
  if (!server.ok) return NextResponse.json({ ok: false, error: server.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    url: server.url,
    port: server.port,
    god: 'athena',
    durationMs: Date.now() - started,
    modelMs: turn.durationMs,
  }, { headers: NO_CACHE_HEADERS });
}
