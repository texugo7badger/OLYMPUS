/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/skill?name=<skill>[&sub=<sub-skill>]
 *
 * Returns the SKILL.md content for a skill, plus its directory listing
 * (so the side panel can show linked files like examples/, scripts/).
 *
 * Path resolution:
 *
 *   1. <root>/.opencode/skills/<skill>/SKILL.md
 *      → top-level skill (the common case).
 *
 *   2. <root>/.opencode/skills/<skill>/<sub-skill>/SKILL.md
 *      → nested sub-skill. Triggered when (1) is missing OR when ?sub= is
 *        provided. Some "umbrella" skills (e.g. `superpowers`) ship ONLY as
 *        a directory of sub-skills — there is no top-level SKILL.md — so we
 *        fall back to the sub-skill layout instead of returning a 404.
 *
 *   - If ?sub=<name> is provided, we go straight to that sub-skill's
 *     SKILL.md (error 404 if it doesn't exist).
 *   - If multiple sub-skills exist and no ?sub= is provided, we return
 *     `{ ok: true, nested: true, subSkills: [...] }` so the modal can
 *     render a picker. The first sub-skill (alphabetical) is also returned
 *     inline as `content` so single-click preview still works.
 *   - If exactly one sub-skill exists, we return its content directly
 *     (with `nested: true` and a `subSkills` array of length 1) so the
 *     UI can still show "this is a sub-skill of X" without an extra
 *     round-trip.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get('name') || '';
    const sub = url.searchParams.get('sub') || '';
    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid ?name=' }, { status: 400 });
    }
    // Sub-skill names allow letters, digits, hyphens (e.g. "using-superpowers").
    if (sub && !/^[a-z0-9-]+$/.test(sub)) {
      return NextResponse.json({ ok: false, error: 'Invalid ?sub=' }, { status: 400 });
    }
    // Use process.cwd() instead of __dirname (ESM compatibility).
    // process.cwd() returns the project root in both `next dev` and `next build`.
    const root = process.cwd();
    const skillDir = path.join(/*turbopackIgnore: true*/ root, '.opencode', 'skills', name);
    const topSkillFile = path.join(skillDir, 'SKILL.md');

    // ── Case A: top-level SKILL.md exists, AND no ?sub= override. ──
    if (!sub && fs.existsSync(topSkillFile)) {
      const content = fs.readFileSync(topSkillFile, 'utf-8');
      let extraFiles: string[] = [];
      try {
        extraFiles = fs.readdirSync(skillDir)
          .filter(f => f !== 'SKILL.md')
          .filter(f => !f.startsWith('.'));
      } catch { /* ignore */ }

      return NextResponse.json({
        ok: true,
        name,
        path: topSkillFile,
        content,
        extraFiles,
        nested: false,
      });
    }

    // ── Enumerate sub-skills (directories containing SKILL.md) ──
    // Used for both the fallback path and the ?sub= path (to validate).
    const subSkills = listSubSkills(skillDir);

    // ── Case B: ?sub=<name> explicitly requested. ──
    if (sub) {
      const subFile = path.join(skillDir, sub, 'SKILL.md');
      if (!fs.existsSync(subFile)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Sub-skill "${sub}" not found under ${name}/`,
            nested: true,
            subSkills,
          },
          { status: 404 },
        );
      }
      const content = fs.readFileSync(subFile, 'utf-8');
      const subDir = path.join(skillDir, sub);
      let extraFiles: string[] = [];
      try {
        extraFiles = fs.readdirSync(subDir)
          .filter(f => f !== 'SKILL.md')
          .filter(f => !f.startsWith('.'));
      } catch { /* ignore */ }

      return NextResponse.json({
        ok: true,
        name,
        sub,
        path: subFile,
        content,
        extraFiles,
        nested: true,
        subSkills,
      });
    }

    // ── Case C: top-level missing, no ?sub=. Fall back to sub-skills. ──
    if (subSkills.length === 0) {
      // No top-level SKILL.md AND no sub-skills — genuinely missing.
      return NextResponse.json(
        { ok: false, error: `Skill "${name}" not found at ${topSkillFile}` },
        { status: 404 },
      );
    }

    // Pick the first sub-skill (alphabetical) as the default preview so
    // the modal has something to show without an extra round-trip. The
    // UI uses the `subSkills` array to render the picker so the user can
    // switch to any other sub-skill.
    // For "superpowers" specifically, the canonical entry point is
    // `using-superpowers/SKILL.md` — prefer it if present.
    const defaultSub =
      subSkills.find(s => s.name === 'using-superpowers')?.name
      || subSkills[0].name;
    const defaultFile = path.join(skillDir, defaultSub, 'SKILL.md');
    const content = fs.existsSync(defaultFile)
      ? fs.readFileSync(defaultFile, 'utf-8')
      : '';

    return NextResponse.json({
      ok: true,
      name,
      sub: defaultSub,
      path: defaultFile,
      content,
      extraFiles: [],
      nested: true,
      // Always include the full sub-skill list so the modal can render a
      // picker regardless of how many sub-skills exist.
      subSkills: subSkills.map(s => ({ name: s.name, title: s.title })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * List sub-skill directories under <skillDir>/ that contain a SKILL.md.
 * Each entry includes a best-effort title extracted from the file's first
 * H1 heading (so the picker can show "using-superpowers — Using the
 * superpowers skill" instead of just the slug).
 */
function listSubSkills(skillDir: string): Array<{ name: string; title: string | null }> {
  const out: Array<{ name: string; title: string | null }> = [];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(skillDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch {
    return out;
  }
  for (const entry of entries.sort()) {
    const subFile = path.join(skillDir, entry, 'SKILL.md');
    if (!fs.existsSync(subFile)) continue;
    let title: string | null = null;
    try {
      const raw = fs.readFileSync(subFile, 'utf-8');
      const m = raw.match(/^#\s+(.+)$/m);
      if (m) title = m[1].trim();
    } catch { /* ignore */ }
    out.push({ name: entry, title });
  }
  return out;
}
