/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
// Shared no-cache headers for live API routes.
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const EPISODES_DIR = path.join(VAULT, '05_Auto_Learning', 'episodes');

interface Episode {
  id: string;
  god: string;
  /** Lucide icon key (matches GOD_ICONS in olympus-store.ts). */
  icon: string;
  ts: string;
  impact: string;
  confidence: number;
  summary: string;
  outcome: string;
  tools: string[];
  source: 'vault' | 'simulated';
}

const GOD_ICONS: Record<string, string> = {
  apollo: 'apollo', hephaestus: 'hephaestus', athena: 'athena', hermes: 'hermes',
  artemis: 'artemis', dionysus: 'dionysus', persephone: 'persephone', prometheus: 'prometheus',
};

function parseFrontmatter(raw: string): Record<string, any> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      const v = kv[2].trim();
      fm[kv[1]] = isNaN(parseFloat(v)) ? v.replace(/["']/g, '') : parseFloat(v);
    }
  }
  return fm;
}

/**
 * GET /api/olympus/episodes
 *
 * v0.0.1: returns ONLY real vault episodes from
 * ~/OLYMPUS-VAULT/05_Auto_Learning/episodes/*.md. NO simulated episodes.
 *
 * Returns { episodes: [], total: 0, vaultCount: 0 } if the vault hasn't
 * been initialized yet or no episodes exist.
 *
 * Issue 5: `glyph` field replaced with `icon` (lucide icon key string).
 */
export async function GET() {
  const out: Episode[] = [];
  try {
    if (fs.existsSync(EPISODES_DIR)) {
      for (const f of fs.readdirSync(EPISODES_DIR).filter(f => f.endsWith('.md'))) {
        try {
          const raw = fs.readFileSync(path.join(EPISODES_DIR, f), 'utf-8');
          const fm = parseFrontmatter(raw);
          const body = raw.replace(/^---[\s\S]*?---/, '').trim();
          const god = (fm.agent || 'unknown').toLowerCase();
          out.push({
            id: f.replace(/\.md$/, ''),
            god,
            icon: GOD_ICONS[god] || 'apollo',
            ts: fm.ts || new Date().toISOString(),
            impact: fm.impact || 'medium',
            confidence: fm.confidence || 0.5,
            summary: body.split('\n').find(l => l.includes('Summary'))?.replace(/^.*Summary\]?\s*/, '') || f,
            outcome: body.split('\n').find(l => l.includes('Outcome'))?.replace(/^.*Outcome\]?\s*/, '') || '',
            tools: [],
            source: 'vault',
          });
        } catch {}
      }
    }
  } catch {}

  out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return NextResponse.json({ episodes: out, total: out.length, vaultCount: out.length }, {
    headers: NO_CACHE_HEADERS,
  });
}
