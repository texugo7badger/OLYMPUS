/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * GET /api/olympus/projects/profile?slug=<slug>
 *
 * The project PROFILE — everything the Projects popover needs to become an
 * interactive card instead of a one-line row: the note, the reconciled path,
 * a bounded filesystem scan (files, size, recent files), the package
 * manifest (name/version/scripts), the git state, detected manifests and a
 * README excerpt.
 *
 * Read-only. The scan is bounded (MAX_ENTRIES, depth 6, heavy directories
 * skipped) so a giant node_modules can never freeze the popover.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getProject, getActiveProjectSlug, reconcileProjectPath } from '@/lib/project-context';
import { detectProjectStacks, folderName, projectSummary } from '@/lib/project-summary';
import { buildProjectBrief } from '@/lib/project-brief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ENTRIES = 2200;
const MAX_DEPTH = 4;
// v0.0.82 — a profile card is not a filesystem census. Stat at most this
// many files; the rest are counted but not measured, and `truncated` is true.
const MAX_STATS = 700;
const PROFILE_TTL_MS = 20_000;
const PROFILE_CACHE = new Map<string, { at: number; data: any }>();

/** v0.0.81 — the profile is a card, not a single point of failure. A
 *  non-git lane (AIME), a vanished folder or a huge tree must degrade to a
 *  partial profile instead of a 500 that makes the project click look dead. */
function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}
const IGNORED = new Set([
  'node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'out', 'target',
  'coverage', '.cache', '.venv', 'venv', '__pycache__', 'vendor', '.gradle',
  '.idea', '.vscode', 'Pods', 'DerivedData', '.svelte-kit', '.nuxt', '.output',
]);

interface RecentFile {
  path: string;
  size: number;
  mtime: string;
}

interface ScanResult {
  files: number;
  directories: number;
  bytes: number;
  recent: RecentFile[];
  truncated: boolean;
}

function scanTree(root: string): ScanResult {
  const result: ScanResult = { files: 0, directories: 0, bytes: 0, recent: [], truncated: false };
  let seen = 0;
  let stats = 0;
  const queue: Array<{ dir: string; rel: string; depth: number }> = [{ dir: root, rel: '', depth: 0 }];
  while (queue.length > 0) {
    const { dir, rel, depth } = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (seen > MAX_ENTRIES) { result.truncated = true; break; }
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.directories += 1;
        if (IGNORED.has(entry.name) || entry.name.startsWith('.') && entry.name !== '.github') continue;
        if (depth < MAX_DEPTH) queue.push({ dir: full, rel: relPath, depth: depth + 1 });
      } else if (entry.isFile()) {
        result.files += 1;
        if (stats >= MAX_STATS) { result.truncated = true; continue; }
        stats += 1;
        try {
          const st = fs.statSync(full);
          result.bytes += st.size;
          if (!entry.name.startsWith('.') && st.size > 0) {
            result.recent.push({ path: relPath, size: st.size, mtime: st.mtime.toISOString() });
          }
        } catch { /* vanished mid-scan */ }
      }
    }
    if (seen > MAX_ENTRIES) break;
  }
  result.recent.sort((a, b) => b.mtime.localeCompare(a.mtime));
  result.recent = result.recent.slice(0, 10);
  return result;
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function gitInfo(root: string): {
  branch: string;
  commit: string;
  subject: string;
  relative: string;
  dirty: number;
} | null {
  try {
    const opts = { encoding: 'utf-8' as const, timeout: 3000 };
    const branch = execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], opts).trim();
    const log = execFileSync('git', ['-C', root, 'log', '-1', '--pretty=%h%x1f%s%x1f%cr'], opts).trim();
    const [commit, subject, relative] = log.split('\x1f');
    const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { ...opts, timeout: 4000 });
    const dirty = status.split('\n').filter(Boolean).length;
    return { branch, commit: commit || '', subject: subject || '', relative: relative || '', dirty };
  } catch {
    return null;
  }
}

function readReadme(root: string): { file: string; excerpt: string } | null {
  for (const name of ['README.md', 'README.MD', 'readme.md', 'README.markdown', 'README.txt']) {
    const file = path.join(root, name);
    try {
      if (!fs.existsSync(file)) continue;
      let text = fs.readFileSync(file, 'utf-8');
      // Drop the image/badge noise but keep the voice.
      text = text
        .replace(/^---[\s\S]*?---\s*/m, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/[*_`>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!text) continue;
      return { file: name, excerpt: text.slice(0, 900) };
    } catch { /* unreadable */ }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });

  const note = getProject(slug);
  if (!note) return NextResponse.json({ ok: false, error: 'project not found' }, { status: 404 });

  const cached = PROFILE_CACHE.get(slug);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const reconciled = safe(() => reconcileProjectPath(slug), null);
  const root = reconciled?.path || note.path;
  const exists = !!root && safe(() => fs.existsSync(root), false);
  const isDir = exists && safe(() => fs.statSync(root).isDirectory(), false);

  const manifestFile = isDir ? path.join(root, 'package.json') : '';
  const pkg = manifestFile && safe(() => fs.existsSync(manifestFile), false) ? readJson(manifestFile) : null;
  // The note's `stacks` is what the user declared at creation; detection adds
  // what the folder actually uses. The union is the honest stack shelf.
  const stacks = Array.from(new Set([...(note.stacks || []), ...safe(() => detectProjectStacks(root, pkg), [] as string[])]));
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? Object.keys(pkg.scripts).slice(0, 24) : [];

  const manifestNames = [
    'package.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'package-lock.json',
    'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'Gemfile',
    'pom.xml', 'build.gradle', 'composer.json', 'Dockerfile', 'docker-compose.yml',
    'Makefile', 'justfile', 'tsconfig.json', 'vite.config.ts', 'next.config.ts',
  ];
  const manifests = isDir ? manifestNames.filter((name) => fs.existsSync(path.join(root, name))) : [];

  const stats = isDir ? safe(() => scanTree(root), { files: 0, directories: 0, bytes: 0, recent: [], truncated: true }) : { files: 0, directories: 0, bytes: 0, recent: [], truncated: false };
  const git = isDir ? safe(() => gitInfo(root), null) : null;
  const readme = isDir ? safe(() => readReadme(root), null) : null;

  const payload = {
    ok: true,
    active: getActiveProjectSlug() === note.slug,
    project: { ...note, name: folderName(note.slug), stacks },
    folder: folderName(note.slug),
    path: root,
    pathSource: reconciled?.source ?? 'note',
    exists,
    isDir,
    stacks,
    // A summary, not the prompt that created the project.
    brief: safe(() => buildProjectBrief(isDir ? root : undefined), undefined),
    description: safe(() => projectSummary({
      slug: note.slug,
      pkg,
      root: isDir ? root : undefined,
      stacks,
      files: stats.files,
      port: note.livePreviewPort,
    }), note.description || `${note.slug} project`),
    stats,
    manifest: pkg ? {
      name: typeof pkg.name === 'string' ? pkg.name : '',
      version: typeof pkg.version === 'string' ? pkg.version : '',
      description: typeof pkg.description === 'string' ? pkg.description : '',
      scripts,
      dependencies: pkg.dependencies && typeof pkg.dependencies === 'object' ? Object.keys(pkg.dependencies).length : 0,
      devDependencies: pkg.devDependencies && typeof pkg.devDependencies === 'object' ? Object.keys(pkg.devDependencies).length : 0,
    } : null,
    manifests,
    git,
    readme,
  };
  PROFILE_CACHE.set(slug, { at: Date.now(), data: payload });
  return NextResponse.json(payload);
}
