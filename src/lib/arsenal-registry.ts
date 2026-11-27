/**
 * arsenal-registry.ts — v0.1.4: what a derived build may equip.
 *
 * A derived build is compiled at dispatch time from the hop's declared
 * arsenal. It must not invent a skill, an MCP or a demigod: every reference
 * is resolved against the real on-disk registry first. The cache keeps a hop
 * from re-walking the skill tree on every prompt compose.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { findOlympusRoot } from './opencode-spawn';

export interface ArsenalValidation {
  ok: boolean;
  skills: string[];
  mcps: string[];
  demigods: string[];
  errors: string[];
}

// v0.1.4 — the standalone server may run from `.next/standalone`; resolve the
// real repo root (OLYMPUS_ROOT first) so the registry sees the actual skills.
const ROOT = () => process.env.OLYMPUS_ROOT || findOlympusRoot();
const TTL_MS = 60_000;

interface Registry {
  at: number;
  skills: Set<string>;
  mcps: Set<string>;
  demigods: Map<string, Set<string>>;
}

let cache: Registry | null = null;

function norm(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/_/g, '-');
}

function walkSkills(dir: string, out: Set<string>, depth = 0): void {
  if (depth > 4) return;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
    const rel = path.relative(path.join(ROOT(), '.opencode', 'skills'), dir).split(path.sep).join('/');
    out.add(rel);
    out.add(path.basename(dir));
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md') || f === 'SKILL.md') continue;
        out.add(`${rel}/${f.replace(/\.md$/, '')}`);
        out.add(f.replace(/\.md$/, ''));
      }
    } catch { /* unreadable dir */ }
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name === '.git') continue;
    walkSkills(path.join(dir, e.name), out, depth + 1);
  }
}

function build(): Registry {
  const skills = new Set<string>();
  walkSkills(path.join(ROOT(), '.opencode', 'skills'), skills);

  const mcps = new Set<string>();
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT(), 'opencode.json'), 'utf-8'));
    for (const key of Object.keys(cfg.mcp || {})) mcps.add(key);
  } catch { /* a missing config means no MCP can be equipped */ }

  const demigods = new Map<string, Set<string>>();
  const root = path.join(ROOT(), '.opencode', 'prompts', 'agents', 'demigods');
  try {
    for (const god of fs.readdirSync(root)) {
      if (god === '_archive') continue;
      const set = demigods.get(god) || new Set<string>();
      for (const file of fs.readdirSync(path.join(root, god))) {
        if (!/\.(txt|md)$/.test(file)) continue;
        set.add(norm(file.replace(/\.(txt|md)$/, '')));
      }
      demigods.set(god, set);
    }
  } catch { /* no prompt tree */ }

  return { at: Date.now(), skills, mcps, demigods };
}

export function arsenalRegistry(): Registry {
  if (!cache || Date.now() - cache.at > TTL_MS) cache = build();
  return cache;
}

export function resetArsenalRegistry(): void {
  cache = null;
}

/**
 * Filter a declared arsenal down to references that resolve. The caller gets
 * the valid lists AND the reasons the invalid ones were dropped — no silent
 * substitution.
 */
export function validateArsenal(god: string, input: {
  skills?: string[];
  mcps?: string[];
  demigods?: string[];
}): ArsenalValidation {
  const reg = arsenalRegistry();
  const leader = String(god || '').trim().toLowerCase();
  const errors: string[] = [];
  const dedupe = (xs: string[]) => [...new Set(xs.map((x) => String(x || '').trim()).filter(Boolean))];

  const skills = dedupe(input.skills || []).filter((s) => {
    const hit = reg.skills.has(s) || reg.skills.has(norm(s));
    if (!hit) errors.push(`skill not found: ${s}`);
    return hit;
  }).slice(0, 3);

  const mcps = dedupe(input.mcps || []).filter((m) => {
    const hit = reg.mcps.has(m);
    if (!hit) errors.push(`MCP not registered: ${m}`);
    return hit;
  }).slice(0, 3);

  const owned = reg.demigods.get(leader) || new Set<string>();
  const demigods = dedupe(input.demigods || []).filter((d) => {
    const key = norm(d);
    if (owned.has(key)) return true;
    const other = [...reg.demigods.entries()].find(([, set]) => set.has(key))?.[0];
    errors.push(other ? `demigod ${d} belongs to ${other}, not ${leader}` : `demigod not found: ${d}`);
    return false;
  }).slice(0, 5);

  return { ok: errors.length === 0, skills, mcps, demigods, errors };
}
