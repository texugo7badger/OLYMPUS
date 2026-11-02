/**
 * /api/olympus/artcraft — v0.0.32 (Epic Q): the project style contract.
 *
 * GET  ?project=<slug>  → the saved tokens (or the OLYMPUS default)
 * POST { project, tokens, references } → persist the chosen direction
 *
 * The store is user data (`~/.olympus/artcraft/styles/<slug>.json`), never
 * the repository. The route performs no generation: the prompt is built by
 * the pure `buildStylePrompt` the UI also uses.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_TOKENS, normalizeStyleTokens, type StyleReference } from '@/lib/artcraft';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function artcraftDir(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'artcraft');
}

function safeSlug(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(raw) ? raw : 'project';
}

function stylePath(slug: string): string {
  return path.join(artcraftDir(), 'styles', `${slug}.json`);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const slug = safeSlug(req.nextUrl.searchParams.get('project'));
  const saved = readJson<{ tokens?: unknown; references?: unknown; logo?: unknown; updatedAt?: string }>(stylePath(slug));
  return NextResponse.json({
    ok: true,
    project: slug,
    tokens: normalizeStyleTokens(saved?.tokens ?? DEFAULT_TOKENS),
    references: Array.isArray(saved?.references) ? saved.references : [],
    logo: typeof saved?.logo === 'string' ? saved.logo : null,
    updatedAt: typeof saved?.updatedAt === 'string' ? saved.updatedAt : null,
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const slug = safeSlug(body?.project);
  const tokens = normalizeStyleTokens(body?.tokens);
  const references: StyleReference[] = Array.isArray(body?.references)
    ? body.references
        .filter((r: any) => r && typeof r.demoUrl === 'string' && r.demoUrl.startsWith('http'))
        .slice(0, 24)
        .map((r: any) => ({
          name: String(r.name ?? 'reference').slice(0, 120),
          demoUrl: String(r.demoUrl),
          ...(typeof r.category === 'string' ? { category: r.category.slice(0, 80) } : {}),
          ...(typeof r.library === 'string' ? { library: r.library.slice(0, 40) } : {}),
        }))
    : [];
  // v0.0.32 — the chosen logo mark (our own generated SVG only).
  const logo = typeof body?.logo === 'string' && body.logo.trim().startsWith('<svg') && body.logo.length <= 24_000
    ? body.logo
    : undefined;
  const file = stylePath(slug);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const previous = readJson<{ logo?: unknown }>(file);
    fs.writeFileSync(file, JSON.stringify({
      project: slug,
      tokens,
      references,
      ...(logo ? { logo } : typeof previous?.logo === 'string' ? { logo: previous.logo } : {}),
      updatedAt: new Date().toISOString(),
    }, null, 2) + '\n', 'utf-8');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, project: slug, tokens, references, ...(logo ? { logo } : {}) }, { headers: NO_CACHE_HEADERS });
}
