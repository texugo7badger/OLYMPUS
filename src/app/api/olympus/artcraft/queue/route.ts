/**
 * /api/olympus/artcraft/queue — v0.0.32 (Epic Q): the design queue.
 *
 * GET  ?project=<slug> → queued design directions (newest first)
 * POST { project, title, prompt, tokens, references, priority } → enqueue
 *
 * Priority is named (`now` | `high` | `normal`) so the UI never implies an
 * ordering it cannot honour. The queue is a user file, not campaign state;
 * the Build system (Epic P) consumes it when it turns a direction into hops.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildQueueItem, normalizeStyleTokens, type StyleReference } from '@/lib/artcraft';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function queuePath(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'artcraft', 'queue.json');
}

function safeSlug(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(raw) ? raw : 'project';
}

function readQueue(): any[] {
  try {
    const raw = JSON.parse(fs.readFileSync(queuePath(), 'utf-8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get('project');
  const slug = project ? safeSlug(project) : null;
  const items = readQueue()
    .filter((i) => (slug ? i?.project === slug : true))
    .sort((a, b) => String(b?.ts ?? '').localeCompare(String(a?.ts ?? '')));
  return NextResponse.json({ ok: true, items }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const project = safeSlug(body?.project);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 });
  }
  const references: StyleReference[] = Array.isArray(body?.references)
    ? body.references
        .filter((r: any) => r && typeof r.demoUrl === 'string' && r.demoUrl.startsWith('http'))
        .slice(0, 12)
        .map((r: any) => ({
          name: String(r.name ?? 'reference').slice(0, 120),
          demoUrl: String(r.demoUrl),
          ...(typeof r.category === 'string' ? { category: r.category.slice(0, 80) } : {}),
          ...(typeof r.library === 'string' ? { library: r.library.slice(0, 40) } : {}),
        }))
    : [];
  const item = buildQueueItem({
    project,
    title: typeof body?.title === 'string' ? body.title : 'Design direction',
    prompt,
    tokens: normalizeStyleTokens(body?.tokens),
    references,
    priority: body?.priority,
  });
  const items = readQueue();
  items.push(item);
  try {
    fs.mkdirSync(path.dirname(queuePath()), { recursive: true });
    fs.writeFileSync(queuePath(), JSON.stringify(items, null, 2) + '\n', 'utf-8');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item }, { headers: NO_CACHE_HEADERS });
}
