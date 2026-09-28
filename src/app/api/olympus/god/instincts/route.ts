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
 * GET /api/olympus/god/instincts?god=<god>
 *
 * Returns the seed + empirical instincts for a god, with id, name, tags,
 * confidence, scope, and absolute path. Used by god-detail.tsx to render
 * the Instincts section + power the instinct-detail-modal.
 *
 * Returns:
 *   {
 *     ok: true,
 *     god: string,
 *     seed: Array<{ id, name, tags, confidence, scope, path }>,
 *     empirical: Array<{ id, name, tags, confidence, scope, path }>,
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const god = new URL(req.url).searchParams.get('god') || '';
    if (!god) {
      return NextResponse.json({ ok: false, error: 'Missing ?god=' }, { status: 400 });
    }
    const instinctsRoot = path.join(VAULT_ROOT, '05_Auto_Learning', 'instincts', god);
    const seedDir = path.join(instinctsRoot, 'seed');
    const empiricalDir = path.join(instinctsRoot, 'empirical');

    const readInstincts = (dir: string) => {
      if (!fs.existsSync(dir)) return [];
      const out: Array<{
        id: string; name: string; tags: string[];
        confidence: number; scope: string[]; path: string;
      }> = [];
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md') || f.startsWith('_')) continue;
        const full = path.join(dir, f);
        try {
          const content = fs.readFileSync(full, 'utf-8');
          // Parse minimal frontmatter.
          // Fixed CRLF intolerance. The seed instinct .md
          // files ship with CRLF (\r\n) line terminators on Windows; the
          // original LF-only regex returned `null` for every CRLF file,
          // which made `fm = ''` and `getField('confidence')` fall back
          // to `'0.5'` for every instinct. That's why God-Detail showed
          // "50%" for every row regardless of the actual frontmatter
          // value. The `\r?\n` variant below matches both LF and CRLF.
          const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
          const fm = m ? m[1] : '';
          const body = m ? m[2] : content;
          const getField = (k: string): string => {
            // Also CRLF-tolerant. The `m` flag already
            // anchors at line starts; the trailing `$` matches before any
            // \r\n or \n in modern JS, so the existing regex is fine, but
            // we strip any trailing \r to keep the value clean.
            const mm = fm.match(new RegExp(`^${k}:\\s*(.+?)\\s*$`, 'm'));
            return mm ? mm[1].trim().replace(/^["']|["']$/g, '') : '';
          };
          const getList = (k: string): string[] => {
            const v = getField(k);
            if (!v) return [];
            return v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          };
          out.push({
            id: f.replace(/\.md$/, ''),
            name: getField('name') || f.replace(/\.md$/, ''),
            tags: getList('tags'),
            confidence: parseFloat(getField('confidence') || '0.5'),
            scope: getList('scope'),
            path: full,
          });
        } catch { /* skip unreadable */ }
      }
      return out;
    };

    return NextResponse.json({
      ok: true,
      god,
      seed: readInstincts(seedDir),
      empirical: readInstincts(empiricalDir),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
