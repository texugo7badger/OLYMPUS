/**
 * /api/olympus/native-tools — v0.1.2: Craft Hub external apps.
 * GET ?slug=aime -> detected tools; POST {id, slug} -> launch in project cwd.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { getProject } from '@/lib/project-context';
import { detectNativeTools, launchNativeTool } from '@/lib/native-tools';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const slug = req.nextUrl.searchParams.get('slug') || null;
  return NextResponse.json({ ok: true, slug, tools: detectNativeTools() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const id = String(body?.id || '').trim();
  const slug = String(body?.slug || '').trim();
  const project = slug ? getProject(slug) : null;
  if (!project?.path) return NextResponse.json({ ok: false, error: 'project not found' }, { status: 404 });
  const result = launchNativeTool(id, project.path);
  return NextResponse.json(result, { status: result.ok ? 200 : 409, headers: NO_CACHE_HEADERS });
}
