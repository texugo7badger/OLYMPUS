/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');

/**
 * Maps a god ID to the reference subdirectories under
 * ~/OLYMPUS-VAULT/04_Knowledge/references/ that are relevant to its domain.
 * Mirrors the per-god loadout table in spec §6.3.
 */
const GOD_REFERENCE_DIRS: Record<string, string[]> = {
  apollo:      [],
  artemis:     ['security'],
  athena:      ['frontend'],
  dionysus:    ['testing'],
  hephaestus:  ['backend'],
  hermes:      ['integrations'],
  persephone:  ['backend'],
  prometheus:  ['devops'],
  callimachus: [],
};

/**
 * GET /api/olympus/god/references?god=<god>
 *
 * Returns the reference docs under ~/OLYMPUS-VAULT/04_Knowledge/references/<dir>/
 * for each directory relevant to the god's domain. Used by god-detail.tsx to
 * render the References section. Each entry includes the path (clickable →
 * opens in the IDE panel) and a one-line description (extracted from the
 * markdown's first H1 or frontmatter `description`).
 */
export async function GET(req: NextRequest) {
  try {
    const god = new URL(req.url).searchParams.get('god') || '';
    if (!god) {
      return NextResponse.json({ ok: false, error: 'Missing ?god=' }, { status: 400 });
    }
    const refsRoot = path.join(VAULT_ROOT, '04_Knowledge', 'references');
    const dirs = GOD_REFERENCE_DIRS[god] ?? [];
    const out: Array<{ path: string; name: string; description: string }> = [];
    if (fs.existsSync(refsRoot)) {
      for (const d of dirs) {
        const dir = path.join(refsRoot, d);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.md')) continue;
          const full = path.join(dir, f);
          try {
            const content = fs.readFileSync(full, 'utf-8');
            const h1 = content.match(/^#\s+(.+)$/m);
            const descMatch = content.match(/^description:\s*(.+)$/m);
            out.push({
              path: full,
              name: h1 ? h1[1].trim() : f.replace(/\.md$/, ''),
              description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '',
            });
          } catch { /* skip */ }
        }
      }
    }
    return NextResponse.json({ ok: true, god, references: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
