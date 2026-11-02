/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * GET /api/olympus/build-icon?id=planning[&static=1]
 *
 * The build/talent category icons are animated SVGs with the legacy gold/
 * cyan/purple hexes baked in. Serving them through this route repaints every
 * legacy palette hex with the user's CURRENT theme palette, so the talent
 * nodes, the build editor and the carousel all follow the theme — while the
 * animations (SMIL/CSS inside the SVG) keep running in the <img>.
 *
 * Read-only, whitelisted ids, no-store (a theme change must repaint).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DEFAULT_THEME, resolvePalette, type OlympusPalette } from '@/lib/theme';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'planning', 'code', 'qa', 'security', 'design', 'data',
  'infra', 'integration', 'memory', 'curation',
]);

/** The legacy hex → palette key. Every icon is authored in this family. */
const LEGACY_TO_KEY: Record<string, keyof OlympusPalette> = {
  D4A574: 'gold',
  E5B574: 'gold',
  C4956A: 'amber',
  C4A265: 'amberSoft',
  B79BE0: 'purple',
  '9B7BAE': 'purple',
  '6B8FB5': 'blue',
  '6BAEB5': 'cyan',
  '6BAE9B': 'teal',
  '7BAE8E': 'green',
  C4756A: 'red',
  '8B8B8B': 'textDim',
};

function readPalette(): OlympusPalette {
  const fallback = resolvePalette(DEFAULT_THEME);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.olympus', 'theme.json'), 'utf-8'));
    const p = raw?.palette ?? {};
    const out = { ...fallback };
    for (const key of Object.keys(out) as Array<keyof OlympusPalette>) {
      if (typeof p[key] === 'string' && /^#[0-9a-f]{6}$/i.test(p[key])) out[key] = p[key];
    }
    return out;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!ALLOWED.has(id)) return NextResponse.json({ error: 'unknown build icon' }, { status: 404 });

  const isStatic = req.nextUrl.searchParams.get('static') === '1';
  const file = path.join(process.cwd(), 'public', 'build-icons', isStatic ? 'static' : '', `${id}.svg`);
  if (!fs.existsSync(file)) return NextResponse.json({ error: 'icon not found' }, { status: 404 });

  let svg = fs.readFileSync(file, 'utf-8');
  const palette = readPalette();
  for (const [hex, key] of Object.entries(LEGACY_TO_KEY)) {
    svg = svg.replace(new RegExp(`#${hex}`, 'gi'), palette[key]);
  }

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
