/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * GET /api/olympus/learning/recent?limit=12
 *
 * The learning feed: the newest instincts, knowledge docs, skills and MCPs
 * the machine has acquired. Read-only, bounded, newest first. Each item
 * carries the god it belongs to and a plain-language summary so the Pattern
 * Studio can let the god SAY what it learned and how it improves.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Learning {
  id: string;
  type: 'instinct' | 'knowledge' | 'skill' | 'mcp';
  name: string;
  god: string;
  ts: string;
  summary: string;
  confidence?: number;
  path?: string;
}

const IGNORE = new Set(['node_modules', '.git', '.next', '.obsidian', '.trash']);
const MAX = 600;

function walk(root: string, accept: (file: string) => boolean, depth = 0, out: string[] = []): string[] {
  if (depth > 5 || out.length > MAX) return out;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (out.length > MAX) break;
    if (IGNORE.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) walk(full, accept, depth + 1, out);
    else if (e.isFile() && accept(full)) out.push(full);
  }
  return out;
}

function firstHeading(file: string): string | null {
  try {
    const text = fs.readFileSync(file, 'utf-8').slice(0, 4000);
    const fm = text.match(/^---[\s\S]*?---/);
    const title = text.match(/^#\s+(.+)$/m)?.[1];
    const name = fm?.[0].match(/^name:\s*(.+)$/m)?.[1];
    return (name || title || '').trim() || null;
  } catch { return null; }
}

function frontmatterField(file: string, field: string): string | null {
  try {
    const text = fs.readFileSync(file, 'utf-8').slice(0, 3000);
    const fm = text.match(/^---[\s\S]*?---/)?.[0] ?? '';
    const v = fm.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1];
    return v ? v.replace(/^["']|["']$/g, '').trim() : null;
  } catch { return null; }
}

function godFromPath(file: string): string {
  const m = file.match(/(?:instincts|gods|knowledge)[/\\]([a-z]+)/i);
  return (m?.[1] || '').toLowerCase();
}

export async function GET(req: NextRequest) {
  const limit = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 12)));
  const vault = getVaultRoot();
  const items: Learning[] = [];

  // Instincts
  for (const file of walk(path.join(vault, '05_Auto_Learning', 'instincts'), (f) => f.endsWith('.json'))) {
    try {
      const st = fs.statSync(file);
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const name = String(raw?.name || raw?.title || raw?.statement || raw?.id || path.basename(file, '.json')).slice(0, 110);
      const confidence = typeof raw?.confidence === 'number' ? raw.confidence : Number(raw?.confidence);
      items.push({
        id: `instinct:${file}`,
        type: 'instinct',
        name,
        god: String(raw?.god || godFromPath(file) || 'callimachus').toLowerCase(),
        ts: st.mtime.toISOString(),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined,
        summary: Number.isFinite(confidence)
          ? `confidence ${(confidence * 100).toFixed(0)}% · enters the short-circuit gate before dispatches`
          : 'a new instinct in the vault',
        path: file,
      });
    } catch { /* skip malformed */ }
  }

  // Knowledge
  for (const file of walk(path.join(vault, '04_Knowledge'), (f) => f.endsWith('.md'))) {
    try {
      const st = fs.statSync(file);
      items.push({
        id: `knowledge:${file}`,
        type: 'knowledge',
        name: (firstHeading(file) || path.basename(file, '.md')).slice(0, 110),
        god: (frontmatterField(file, 'god') || godFromPath(file) || 'callimachus').toLowerCase(),
        ts: st.mtime.toISOString(),
        summary: 'a new reference in the vault — retrieved when this domain is in play',
        path: file,
      });
    } catch { /* skip */ }
  }

  // Skills (the repo's skill arsenal)
  const skillsRoot = path.join(process.cwd(), '.opencode', 'skills');
  try {
    for (const name of fs.readdirSync(skillsRoot)) {
      const file = path.join(skillsRoot, name, 'SKILL.md');
      if (!fs.existsSync(file)) continue;
      const st = fs.statSync(file);
      items.push({
        id: `skill:${file}`,
        type: 'skill',
        name: (firstHeading(file) || name).slice(0, 110),
        god: 'athena',
        ts: st.mtime.toISOString(),
        summary: 'a skill in the arsenal — the router can surface it for a matching task',
        path: file,
      });
    }
  } catch { /* no arsenal */ }

  // MCPs registered in the OpenCode lane
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'opencode.json'), 'utf-8'));
    const st = fs.statSync(path.join(process.cwd(), 'opencode.json'));
    for (const [name, entry] of Object.entries(cfg?.mcp || {})) {
      const enabled = (entry as any)?.enabled !== false;
      if (!enabled) continue;
      items.push({
        id: `mcp:${name}`,
        type: 'mcp',
        name,
        god: /design|originkit|figma|shadcn|opendesign/.test(name) ? 'athena' : /postgres|docker|kubernetes|rea/.test(name) ? 'persephone' : 'hermes',
        ts: st.mtime.toISOString(),
        summary: 'a live MCP lane — equipped per dispatch when the domain matches',
      });
    }
  } catch { /* no config */ }

  const seen = new Set<string>();
  const recent = items
    .filter((i) => {
      const key = `${i.type}:${i.name}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit);

  return NextResponse.json({ ok: true, learnings: recent, scanned: items.length, vault }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
