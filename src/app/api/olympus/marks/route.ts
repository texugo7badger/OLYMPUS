/**
 * /api/olympus/marks — v0.0.92: the durable mark queue.
 *
 * GET    ?slug=aime            → the project's marks
 * POST   { slug, marks: [...] } → replace the whole queue (the window saves)
 * POST   { slug, mark: {...} }  → append one mark
 * DELETE ?slug=aime&id=mark-1   → remove one mark
 * DELETE ?slug=aime             → clear the queue
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { addMark, clearMarks, readMarks, removeMark, writeMarks } from '@/lib/marks-store';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugOf(req: NextRequest, body?: any): string {
  return String(body?.slug ?? req.nextUrl.searchParams.get('slug') ?? '').trim();
}

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const slug = slugOf(req);
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: true, slug, marks: readMarks(slug) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const slug = slugOf(req, body);
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  let marks;
  if (Array.isArray(body?.marks)) marks = writeMarks(slug, body.marks);
  else if (body?.mark) marks = addMark(slug, body.mark);
  else return NextResponse.json({ ok: false, error: 'marks[] or mark is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: true, slug, marks }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  const slug = slugOf(req);
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const id = String(req.nextUrl.searchParams.get('id') ?? '').trim();
  const marks = id ? removeMark(slug, id) : clearMarks(slug);
  return NextResponse.json({ ok: true, slug, marks }, { headers: NO_CACHE_HEADERS });
}
