/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/recent-additions
 *
 * v0.0.1 final-polish-v2 — Returns recently created/modified brain artifacts:
 *   - New skills (SKILL.md files in .opencode/skills/ modified in last 14d)
 *   - New sub-agents (agent prompt files in .opencode/prompts/agents/ modified in last 14d)
 *   - New instincts (.md files in ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/ modified in last 14d)
 *   - New knowledge references (.md files in ~/OLYMPUS-VAULT/04_Knowledge/references/ modified in last 14d)
 *
 * Each entry has: { name, path, type, mtime, age }.
 * Results are sorted by mtime (newest first), capped at 20 per category.
 *
 * This powers the "Recent Brain Activity" section at the bottom of the Vault
 * Summary panel — a dynamic, easy-to-understand view of what the brain has
 * been evolving. Callimachus (the vault curator) is responsible for this
 * evolution; this endpoint surfaces his work.
 */

const VAULT_ROOT = getVaultRoot();
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 14;
const MAX_PER_CATEGORY = 20;

interface RecentAddition {
  name: string;
  path: string;
  type: 'skill' | 'subagent' | 'instinct' | 'knowledge';
  mtime: string;
  age: string;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function scanRecentMd(rootDir: string, type: RecentAddition['type']): RecentAddition[] {
  const results: RecentAddition[] = [];
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * DAY_MS;
  if (!fs.existsSync(rootDir)) return results;

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= MAX_PER_CATEGORY * 2) return;
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '.git') continue;
          walk(fullPath);
        } else if (e.isFile() && e.name.endsWith('.md')) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs >= cutoff) {
              results.push({
                name: e.name.replace(/\.md$/, ''),
                path: fullPath,
                type,
                mtime: stat.mtime.toISOString(),
                age: timeAgo(stat.mtimeMs),
              });
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(rootDir);
  return results
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
    .slice(0, MAX_PER_CATEGORY);
}

function scanRecentSubAgents(olympusRoot: string): RecentAddition[] {
  const results: RecentAddition[] = [];
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * DAY_MS;
  const promptsDir = path.join(olympusRoot, '.opencode', 'prompts', 'agents');
  if (!fs.existsSync(promptsDir)) return results;

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= MAX_PER_CATEGORY * 2) return;
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(fullPath);
        } else if (e.isFile() && e.name.endsWith('.txt')) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs >= cutoff) {
              results.push({
                name: e.name.replace(/\.txt$/, ''),
                path: fullPath,
                type: 'subagent',
                mtime: stat.mtime.toISOString(),
                age: timeAgo(stat.mtimeMs),
              });
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(promptsDir);
  return results
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
    .slice(0, MAX_PER_CATEGORY);
}

export async function GET() {
  const olympusRoot = process.cwd();
  const skillsRoot = path.join(olympusRoot, '.opencode', 'skills');
  const instinctsRoot = path.join(VAULT_ROOT, '05_Auto_Learning', 'instincts');
  const knowledgeRoot = path.join(VAULT_ROOT, '04_Knowledge', 'references');

  const skills = scanRecentMd(skillsRoot, 'skill');
  const subagents = scanRecentSubAgents(olympusRoot);
  const instincts = scanRecentMd(instinctsRoot, 'instinct');
  const knowledge = scanRecentMd(knowledgeRoot, 'knowledge');

  const all = [...skills, ...subagents, ...instincts, ...knowledge]
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
    .slice(0, 30);

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    window_days: RECENT_WINDOW_DAYS,
    skills,
    subagents,
    instincts,
    knowledge,
    all,
  }, { headers: NO_CACHE_HEADERS });
}
