/**
 * knowledge-hints.ts — make 04_Knowledge actually reach the gods (v0.0.24).
 *
 * The vault's reference notes existed but nothing injected them into a task
 * prompt; they were only atlas nodes. This module selects the few notes that
 * match the addressed god + project stacks + task words and returns a compact
 * `[OLYMPUS-KNOWLEDGE]` block. Bounded: top 3, ~700 chars — a hint, never a
 * context dump.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';

interface KnowledgeNote {
  relPath: string;
  title: string;
  category: string;
  god?: string;
  stacks: string[];
  excerpt: string;
  body: string;
}

const CATEGORY_GOD: Record<string, string> = {
  backend: 'hephaestus',
  frontend: 'athena',
  devops: 'prometheus',
  security: 'artemis',
  testing: 'dionysus',
  integrations: 'hermes',
  planning: 'apollo',
  orchestration: 'atlas',
  design: 'athena',
  qa: 'dionysus',
  data: 'persephone',
  vault: 'callimachus',
  release: 'prometheus',
};

let cache: { at: number; notes: KnowledgeNote[] } | null = null;
const CACHE_TTL_MS = 60_000;

function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: raw.slice(m[0].length) };
}

function loadNotes(): KnowledgeNote[] {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.notes;
  const root = path.join(getVaultRoot(), '04_Knowledge', 'references');
  const notes: KnowledgeNote[] = [];
  const walk = (dir: string, prefix = '') => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(p, rel); continue; }
      if (!e.name.endsWith('.md')) continue;
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const { fm, body } = parseFrontmatter(raw);
        const category = fm.category || rel.split('/')[0] || 'general';
        const stacks = (fm.stacks || '')
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        const first = body
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith('#') && !l.startsWith('- [') && !l.startsWith('---')) || '';
        notes.push({
          relPath: rel,
          title: fm.title || e.name.replace(/\.md$/, ''),
          category,
          god: fm.god,
          stacks,
          excerpt: first.slice(0, 180),
          body: body.slice(0, 2_000),
        });
      } catch { /* unreadable note */ }
    }
  };
  walk(root);
  cache = { at: Date.now(), notes };
  return notes;
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 400),
  );
}

export interface KnowledgeSelection {
  title: string;
  relPath: string;
  score: number;
  excerpt: string;
}

export function selectKnowledgeForTask(opts: {
  god?: string | null;
  stacks?: string[] | null;
  text?: string | null;
  limit?: number;
}): KnowledgeSelection[] {
  const notes = loadNotes();
  const wants = words(opts.text || '');
  const stacks = new Set((opts.stacks ?? []).map((s) => s.toLowerCase()));
  const god = (opts.god || '').toLowerCase();
  const text = (opts.text || '').toLowerCase();
  const scored = notes.map((n) => {
    let score = 0;
    if (god && (n.god === god || CATEGORY_GOD[n.category] === god)) score += 4;
    if (stacks.size > 0 && n.stacks.some((s) => stacks.has(s.toLowerCase()))) score += 3;
    if (wants.size > 0) {
      const noteWords = words(`${n.title} ${n.excerpt}`);
      let overlap = 0;
      for (const w of wants) if (noteWords.has(w)) overlap++;
      score += Math.min(overlap, 4);
    }
    // Stem-level intent (accessible → accessibility, a11y → accessibility).
    if (/accessib|a11y|wcag/.test(text) && /accessibility/.test(n.relPath)) score += 7;
    if (/perform|slow|latency|vital|core web/.test(text) && /performance/.test(n.relPath)) score += 5;
    if (/schema|migration|database|table/.test(text) && /schema-design/.test(n.relPath)) score += 5;
    if (/query|index|explain/.test(text) && /query-performance/.test(n.relPath)) score += 5;
    if (/threat|attack|owasp|stride/.test(text) && /threat-modeling/.test(n.relPath)) score += 6;
    if (/mcp|tool server/.test(text) && /integrations\/mcp/.test(n.relPath)) score += 5;
    return { ...n, score };
  });
  return scored
    .filter((n) => n.score > 0)
    .sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath))
    .slice(0, Math.max(1, Math.min(opts.limit ?? 3, 5)))
    .map((n) => ({ title: n.title, relPath: n.relPath, score: n.score, excerpt: n.excerpt }));
}

/**
 * The prompt block. Deliberately small: paths + one-line excerpts, so the god
 * can open the note if it needs the detail.
 */
export function composeKnowledgeBlock(opts: {
  god?: string | null;
  stacks?: string[] | null;
  text?: string | null;
}): string {
  const picks = selectKnowledgeForTask(opts);
  if (picks.length === 0) return '';
  const lines = [
    '[OLYMPUS-KNOWLEDGE] The vault has references for this domain. Use them; do not invent a conflicting rule:',
    ...picks.map((p) => `- ${p.title} (04_Knowledge/references/${p.relPath})${p.excerpt ? ` — ${p.excerpt}` : ''}`),
  ];
  const block = lines.join('\n');
  return block.length > 700 ? `${block.slice(0, 700)}…` : block;
}
