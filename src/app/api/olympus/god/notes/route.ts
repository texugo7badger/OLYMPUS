/**
 * /api/olympus/god/notes — v0.0.32: per-god planning and attention notes.
 *
 * The god panel had no place for the human's intent between dispatches. A
 * note is how the maintainer says "keep an eye on hydration" or "the next
 * plan must land the login" without opening a chat. Notes are user data
 * (`~/.olympus/god-notes/<god>.json`), never campaign state.
 *
 * GET    ?god=athena          → { notes: [...] }
 * POST   { god, text, kind }  → append
 * PATCH  { god, id, done? , text? } → toggle/edit
 * DELETE ?god=&id=            → remove
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GODS = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);
const KINDS = new Set(['plan', 'attention', 'note']);

type NoteKind = 'plan' | 'attention' | 'note';
interface GodNote {
  id: string;
  ts: string;
  kind: NoteKind;
  text: string;
  done: boolean;
  doneAt?: string;
}

function notesDir(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'god-notes');
}

function godOf(value: unknown): string | null {
  const god = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return GODS.has(god) ? god : null;
}

function fileFor(god: string): string {
  return path.join(notesDir(), `${god}.json`);
}

function readNotes(god: string): GodNote[] {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(god), 'utf-8'));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.notes) ? raw.notes : [];
    return list
      .filter((n: any) => n && typeof n.text === 'string')
      .map((n: any) => ({
        id: String(n.id ?? ''),
        ts: String(n.ts ?? ''),
        kind: (KINDS.has(n.kind) ? n.kind : 'note') as NoteKind,
        text: String(n.text).slice(0, 2000),
        done: n.done === true,
        ...(typeof n.doneAt === 'string' ? { doneAt: n.doneAt } : {}),
      }));
  } catch {
    return [];
  }
}

function writeNotes(god: string, notes: GodNote[]): void {
  fs.mkdirSync(notesDir(), { recursive: true });
  fs.writeFileSync(fileFor(god), JSON.stringify({ version: 1, god, notes }, null, 2) + '\n', 'utf-8');
}

export async function GET(req: NextRequest) {
  const god = godOf(req.nextUrl.searchParams.get('god'));
  if (!god) return NextResponse.json({ ok: false, error: 'unknown god' }, { status: 400, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: true, god, notes: readNotes(god) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const god = godOf(body?.god);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!god) return NextResponse.json({ ok: false, error: 'unknown god' }, { status: 400 });
  if (!text) return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
  const kind: NoteKind = KINDS.has(body?.kind) ? body.kind : 'note';
  const now = Date.now();
  const note: GodNote = {
    id: `note-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date(now).toISOString(),
    kind,
    text: text.slice(0, 2000),
    done: false,
  };
  const notes = readNotes(god);
  notes.push(note);
  try { writeNotes(god, notes); } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, note, notes }, { headers: NO_CACHE_HEADERS });
}

export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const god = godOf(body?.god);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!god || !id) return NextResponse.json({ ok: false, error: 'god and id are required' }, { status: 400 });
  const notes = readNotes(god);
  const note = notes.find((n) => n.id === id);
  if (!note) return NextResponse.json({ ok: false, error: 'note not found' }, { status: 404 });
  if (typeof body?.done === 'boolean') {
    note.done = body.done;
    if (body.done) note.doneAt = new Date().toISOString();
    else delete note.doneAt;
  }
  if (typeof body?.text === 'string' && body.text.trim()) note.text = body.text.trim().slice(0, 2000);
  try { writeNotes(god, notes); } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, note, notes }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const god = godOf(req.nextUrl.searchParams.get('god'));
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!god || !id) return NextResponse.json({ ok: false, error: 'god and id are required' }, { status: 400 });
  const notes = readNotes(god).filter((n) => n.id !== id);
  try { writeNotes(god, notes); } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, notes }, { headers: NO_CACHE_HEADERS });
}
