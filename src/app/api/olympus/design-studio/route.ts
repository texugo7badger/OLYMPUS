/**
 * /api/olympus/design-studio — Athena's design decision surface (#208).
 *
 * GET  ?project=<slug>&query=<text>
 *   Returns Athena-authored proposals: curated reference cards (OriginKit /
 *   UX patterns), visual palettes, and logo concepts — plus the project's
 *   SAVED decisions (design-decisions.jsonl), so a chosen palette renders in
 *   later sessions.
 *
 * POST {project, kind, decision, conversationId}
 *   Appends the structured decision to the project record and the durable
 *   activity feed. Read-only GET; the only write is the append.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from '@/lib/vault-root';
import { appendActivity } from '@/lib/activity-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReferenceCard {
  id: string;
  title: string;
  source: 'OriginKit' | 'UX pattern' | 'Editorial';
  url: string;
  pattern: string;
  description: string;
  tags: string[];
  accent: string;
}

interface Palette {
  id: string;
  name: string;
  mood: string;
  colors: Array<{ role: string; hex: string }>;
}

interface LogoConcept {
  id: string;
  name: string;
  style: string;
  monogram: string;
  paletteId: string;
}

const REFERENCES: ReferenceCard[] = [
  {
    id: 'ref-aurora-glass', title: 'Aurora Glass Hero', source: 'OriginKit',
    url: 'https://originkit.dev', pattern: 'Glassmorphic hero + floating product frame',
    description: 'A soft gradient field with a single glass panel; depth comes from layered blur, not shadows. Strong for AI and devtools launches.',
    tags: ['hero', 'glass', 'gradient', 'ai'], accent: '#8B7CF6',
  },
  {
    id: 'ref-swiss-grid', title: 'Swiss Editorial Grid', source: 'UX pattern',
    url: 'https://land-book.com', pattern: '12-column editorial grid, oversized type',
    description: 'Asymmetric column spans with a strict baseline. Type scale contrast does the work; color stays near-monochrome with one signal accent.',
    tags: ['editorial', 'grid', 'typography', 'minimal'], accent: '#E8E3D9',
  },
  {
    id: 'ref-bento', title: 'Bento Feature Wall', source: 'OriginKit',
    url: 'https://originkit.dev', pattern: 'Bento grid of mixed-size feature cells',
    description: 'A 4×2 bento where one cell carries the hero interaction and the rest are quiet proof points. Avoid equal cells — hierarchy is the point.',
    tags: ['bento', 'features', 'dashboard'], accent: '#5FB0B8',
  },
  {
    id: 'ref-terminal-noir', title: 'Terminal Noir', source: 'OriginKit',
    url: 'https://originkit.dev', pattern: 'Dark terminal chrome + phosphor accent',
    description: 'Near-black layered surfaces, mono type, one phosphor accent used only on live state. Reads technical without costume.',
    tags: ['dark', 'terminal', 'developer', 'mono'], accent: '#9BE564',
  },
  {
    id: 'ref-pricing-anchor', title: 'Pricing Anchor Ladder', source: 'UX pattern',
    url: 'https://pageflows.com', pattern: 'Three-tier pricing with anchored middle plan',
    description: 'The recommended tier is visually elevated (scale + border + badge) while the others recede. Monthly/annual toggle sits above the fold.',
    tags: ['pricing', 'conversion', 'saas'], accent: '#F2B84B',
  },
  {
    id: 'ref-onboarding-steps', title: 'Three-Step Onboarding', source: 'UX pattern',
    url: 'https://mobbin.com', pattern: 'Progressive onboarding with visible progress',
    description: 'One decision per screen, a persistent progress rail, and a skip path. The first screen earns the second — never a wall of fields.',
    tags: ['onboarding', 'forms', 'flow'], accent: '#7FC8F8',
  },
  {
    id: 'ref-command-palette', title: 'Command Palette First', source: 'OriginKit',
    url: 'https://originkit.dev', pattern: '⌘K palette as the primary navigation',
    description: 'For dense tools: a command palette with grouped results and keyboard hints. The sidebar becomes secondary, not the hero.',
    tags: ['navigation', 'dashboard', 'keyboard'], accent: '#C7A6FF',
  },
  {
    id: 'ref-case-study', title: 'Case-Study Story Scroll', source: 'Editorial',
    url: 'https://www.awwwards.com', pattern: 'Scroll-driven narrative with pinned media',
    description: 'Pinned media column + scrolling copy; each section earns a scroll. Motion is scroll-linked, never autoplaying carousels.',
    tags: ['story', 'scroll', 'portfolio', 'motion'], accent: '#F08A7E',
  },
  {
    id: 'ref-settings-density', title: 'Dense Settings, Calm Surface', source: 'UX pattern',
    url: 'https://mobbin.com', pattern: 'Two-pane settings with grouped rows',
    description: 'Left rail of groups, right pane of labeled rows with inline help. Destructive actions sit apart with confirmation, never adjacent to save.',
    tags: ['settings', 'forms', 'dashboard'], accent: '#9AA7B8',
  },
  {
    id: 'ref-empty-state', title: 'Empty State That Teaches', source: 'UX pattern',
    url: 'https://www.nngroup.com', pattern: 'Empty state with one primary action + example',
    description: 'An empty screen is an onboarding surface: one sentence of value, one primary action, and a sample artifact. Never a bare "no data".',
    tags: ['empty-state', 'onboarding', 'ux'], accent: '#D6C7A1',
  },
];

const PALETTES: Palette[] = [
  {
    id: 'pal-aurora-noir', name: 'Aurora Noir', mood: 'AI · nocturnal · premium',
    colors: [
      { role: 'bg', hex: '#0B0B10' }, { role: 'surface', hex: '#14141C' },
      { role: 'elevated', hex: '#1E1E2A' }, { role: 'accent', hex: '#8B7CF6' },
      { role: 'accent-2', hex: '#5FB0B8' }, { role: 'text', hex: '#EDEAF5' },
    ],
  },
  {
    id: 'pal-solar-paper', name: 'Solar Paper', mood: 'editorial · warm · calm',
    colors: [
      { role: 'bg', hex: '#FAF7F0' }, { role: 'surface', hex: '#F1EBDF' },
      { role: 'elevated', hex: '#E7DECC' }, { role: 'accent', hex: '#C4622D' },
      { role: 'accent-2', hex: '#3E5C50' }, { role: 'text', hex: '#1E1B16' },
    ],
  },
  {
    id: 'pal-deep-ocean', name: 'Deep Ocean', mood: 'data · trustworthy · cool',
    colors: [
      { role: 'bg', hex: '#071018' }, { role: 'surface', hex: '#0D1B26' },
      { role: 'elevated', hex: '#14293A' }, { role: 'accent', hex: '#38BDF8' },
      { role: 'accent-2', hex: '#22C55E' }, { role: 'text', hex: '#E6F1F8' },
    ],
  },
  {
    id: 'pal-clay-sage', name: 'Clay & Sage', mood: 'wellness · organic · soft',
    colors: [
      { role: 'bg', hex: '#F5F1EA' }, { role: 'surface', hex: '#E9E2D6' },
      { role: 'elevated', hex: '#DCD2C2' }, { role: 'accent', hex: '#A65A3A' },
      { role: 'accent-2', hex: '#7C8C6E' }, { role: 'text', hex: '#2A241D' },
    ],
  },
  {
    id: 'pal-neon-archive', name: 'Neon Archive', mood: 'culture · bold · night',
    colors: [
      { role: 'bg', hex: '#0A0A0A' }, { role: 'surface', hex: '#151515' },
      { role: 'elevated', hex: '#222222' }, { role: 'accent', hex: '#FF3D81' },
      { role: 'accent-2', hex: '#FFE24B' }, { role: 'text', hex: '#F5F5F5' },
    ],
  },
];

const LOGOS: LogoConcept[] = [
  { id: 'logo-mono', name: 'Monogram Block', style: 'Solid geometric monogram, tight tracking', monogram: 'OL', paletteId: 'pal-aurora-noir' },
  { id: 'logo-orbit', name: 'Orbit Mark', style: 'Monogram inside an orbital ring (animated 3D)', monogram: 'A', paletteId: 'pal-deep-ocean' },
  { id: 'logo-split', name: 'Split Serif', style: 'High-contrast serif split by the accent', monogram: 'OX', paletteId: 'pal-solar-paper' },
];

function projectDir(slug: string): string | null {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean || !/^[a-z0-9][a-z0-9._-]{0,80}$/.test(clean)) return null;
  return path.join(getVaultRoot(), '02_Projects', clean);
}

function savedPath(slug: string): string | null {
  const dir = projectDir(slug);
  return dir ? path.join(dir, 'design-decisions.jsonl') : null;
}

function readSaved(slug: string): any[] {
  const file = savedPath(slug);
  if (!file) return [];
  try {
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean).slice(-20);
    const out: any[] = [];
    for (const line of lines) {
      try { out.push(JSON.parse(line)); } catch { /* skip a torn row */ }
    }
    return out;
  } catch { return []; }
}

function filterReferences(query: string): ReferenceCard[] {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return REFERENCES;
  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  const scored = REFERENCES.map((r) => {
    const hay = `${r.title} ${r.pattern} ${r.description} ${r.tags.join(' ')}`.toLowerCase();
    return { r, score: terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) };
  }).sort((a, b) => b.score - a.score);
  const hits = scored.filter((s) => s.score > 0).map((s) => s.r);
  return hits.length > 0 ? hits : REFERENCES;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') || '';
  const query = url.searchParams.get('query') || '';
  return NextResponse.json({
    ok: true,
    project,
    generatedAt: new Date().toISOString(),
    references: filterReferences(query),
    palettes: PALETTES,
    logos: LOGOS,
    saved: project ? readSaved(project) : [],
  }, { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const project = String(body?.project || '').trim();
    const kind = String(body?.kind || '').trim();
    const decision = body?.decision;
    if (!['palette', 'reference', 'logo', 'combo'].includes(kind)) {
      return NextResponse.json({ ok: false, error: 'Invalid "kind". Expected palette | reference | logo | combo.' }, { status: 400 });
    }
    if (!decision || typeof decision !== 'object') {
      return NextResponse.json({ ok: false, error: 'Missing structured "decision" object.' }, { status: 400 });
    }
    const file = savedPath(project);
    if (!file) {
      return NextResponse.json({ ok: false, error: 'Invalid or missing project slug (the decision is saved to a project record).' }, { status: 400 });
    }
    const record = {
      ts: new Date().toISOString(),
      project,
      conversationId: typeof body?.conversationId === 'string' ? body.conversationId : null,
      kind,
      decision,
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf-8');
    try {
      appendActivity({
        god: 'athena',
        action: 'design-decision',
        msg: `Design decision saved (${kind}) for ${project}: ${String(decision?.name || decision?.title || decision?.id || 'selection')}`,
        meta: { project, kind, conversationId: record.conversationId, decision },
      });
    } catch { /* the feed never blocks a saved decision */ }
    return NextResponse.json({ ok: true, saved: record });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'save failed' }, { status: 500 });
  }
}
