/**
 * /api/olympus/projects/github — v0.0.54: one repo per project, simple.
 *
 * GET  ?slug= → the project's git remote, gh auth state, last commits.
 * POST { slug, action: 'create'|'connect'|'push', visibility?, repo?, url? }
 *
 * Uses the user's own `gh` CLI auth (never stores a token). The project path
 * is resolved from the OLYMPUS store; no shell, no interpolation. Creating a
 * repo is an explicit user action; it never runs from a hop.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getProject, reconcileProjectPath } from '@/lib/project-context';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8', timeout: 8000 }).trim();
}
function ghReady(): boolean {
  try { execFileSync('gh', ['auth', 'status'], { encoding: 'utf-8', timeout: 5000 }); return true; } catch { return false; }
}
/** The source-only contract: a project push never carries dependencies,
 *  build output, caches, secrets or runtime hop state. Existing lines are
 *  preserved; missing lines are appended once. */
const GITIGNORE_LINES = [
  'node_modules/',
  '.next/',
  'out/',
  'dist/',
  'dist-electron/',
  'dist-electron-tsc/',
  '.turbo/',
  '.cache/',
  'coverage/',
  '.nyc_output/',
  '.env',
  '.env.*',
  '!.env.example',
  '*.log',
  'npm-debug.log*',
  '.DS_Store',
  'Thumbs.db',
  '.olympus-backups/',
  '.olympus-hop-state.json',
  '.olympus-hop-telemetry.jsonl',
  '.olympus-walk.lock',
  '.olympus-context.json',
  '.opencode/node_modules/',
];

function ensureGitignore(root: string): string[] {
  const file = path.join(root, '.gitignore');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const lines = new Set(existing.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const added = GITIGNORE_LINES.filter((l) => !lines.has(l));
  if (added.length > 0) {
    const sep = existing && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(file, `${existing}${sep}${added.join('\n')}\n`, 'utf-8');
  }
  return added;
}

/** Initialize the repo when absent, stage with the source-only ignore file,
 *  and make the first commit so `gh repo create --push` has something to push. */
function ensureRepo(root: string): { initialized: boolean; committed: boolean; ignored: string[] } {
  const ignored = ensureGitignore(root);
  let initialized = false;
  try { git(root, ['rev-parse', '--is-inside-work-tree']); } catch {
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, encoding: 'utf-8', timeout: 15000 });
    initialized = true;
  }
  git(root, ['add', '-A']);
  let committed = false;
  try { git(root, ['diff', '--cached', '--quiet']); } catch {
    try {
      execFileSync('git', ['commit', '-m', 'chore: initial OLYMPUS snapshot'], { cwd: root, encoding: 'utf-8', timeout: 30000 });
    } catch {
      execFileSync('git', ['-c', 'user.name=OLYMPUS', '-c', 'user.email=olympus@localhost', 'commit', '-m', 'chore: initial OLYMPUS snapshot'], { cwd: root, encoding: 'utf-8', timeout: 30000 });
    }
    committed = true;
  }
  return { initialized, committed, ignored };
}

function slugFromUrl(url: string): string {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/.exec(url);
  return m ? `${m[1]}/${m[2]}` : url;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const note = getProject(slug);
  if (!note) return NextResponse.json({ ok: false, error: 'project not found' }, { status: 404, headers: NO_CACHE_HEADERS });
  const root = reconcileProjectPath(slug)?.path || note.path;
  let remote: string | null = null;
  let commits: Array<{ hash: string; subject: string; relative: string }> = [];
  let branch: string | null = null;
  try {
    remote = git(root, ['remote', 'get-url', 'origin']);
    branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    commits = git(root, ['log', '-5', '--pretty=%h%x1f%s%x1f%cr']).split('\n').filter(Boolean).map((line) => {
      const [hash, subject, relative] = line.split('\x1f');
      return { hash, subject, relative };
    });
  } catch { /* not a git repo / no remote */ }
  return NextResponse.json({
    ok: true,
    slug, path: root, repo: remote ? slugFromUrl(remote) : null, remote, branch, commits,
    ghReady: ghReady(), githubUrl: remote && /github\.com/.test(remote) ? `https://${slugFromUrl(remote)}` : null,
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const slug = String(body?.slug || '');
  const action = String(body?.action || '');
  const note = getProject(slug);
  if (!note) return NextResponse.json({ ok: false, error: 'project not found' }, { status: 404, headers: NO_CACHE_HEADERS });
  const root = reconcileProjectPath(slug)?.path || note.path;
  if (!ghReady()) return NextResponse.json({ ok: false, error: 'gh CLI is not authenticated — run `gh auth login` once' }, { status: 401, headers: NO_CACHE_HEADERS });
  try {
    if (action === 'create') {
      const repo = String(body?.repo || slug).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
      const visibility = body?.visibility === 'public' ? '--public' : '--private';
      const prep = ensureRepo(root);
      const out = execFileSync('gh', ['repo', 'create', repo, visibility, '--source', root, '--remote', 'origin', '--push'], { cwd: root, encoding: 'utf-8', timeout: 120000 });
      return NextResponse.json({
        ok: true, action, repo,
        output: out.slice(0, 800),
        prepared: prep,
        note: 'source only — node_modules, .next, dist, caches, .env and hop runtime files are ignored',
      }, { headers: NO_CACHE_HEADERS });
    }
    if (action === 'connect') {
      const url = String(body?.url || '');
      if (!/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/.test(url)) {
        return NextResponse.json({ ok: false, error: 'a GitHub https URL is required' }, { status: 400, headers: NO_CACHE_HEADERS });
      }
      try { git(root, ['remote', 'set-url', 'origin', url]); } catch { git(root, ['remote', 'add', 'origin', url]); }
      return NextResponse.json({ ok: true, action, url }, { headers: NO_CACHE_HEADERS });
    }
    if (action === 'push') {
      const prep = ensureRepo(root);
      const out = execFileSync('git', ['-C', root, 'push', '-u', 'origin', 'HEAD'], { encoding: 'utf-8', timeout: 120000 });
      return NextResponse.json({ ok: true, action, output: String(out).slice(0, 800), prepared: prep }, { headers: NO_CACHE_HEADERS });
    }
    return NextResponse.json({ ok: false, error: "action must be 'create' | 'connect' | 'push'" }, { status: 400, headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.stderr || e?.message || e).slice(0, 800) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
