/**
 * instinct-rag.ts — the instinct prior-context lane, now scope-aware (v0.1.3).
 *
 * The old implementation token-matched every empirical instinct for a god,
 * with no project/stack filter. A generic Athena task in any project could
 * receive an AIME instruction to write `evidence/clips/...`. This version
 * reuses the canonical `filterInstinct()` rules:
 *
 *   - project instincts are visible only in that project;
 *   - stack instincts only when the active stack intersects;
 *   - global/stack-tagged instincts follow the cross-stack rule;
 *   - seed instincts are always visible.
 *
 * Retrieval stays deliberately cheap: token overlap over the trigger, with a
 * small stoplist. Vectors are for the Retrieval Bus; this lane is the fast
 * prior-context fallback.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVaultRoot } from './vault-root';
import { filterInstinct, type ActiveProject, type InstinctScope } from './instinct-scope';
import { getActiveContext, activeProjectForScope } from './learning/active-context';
import { computeInstinctConfidence } from './learning/confidence';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are',
  'be', 'this', 'that', 'it', 'as', 'at', 'by', 'from', 'into', 'any', 'when', 'if',
  'then', 'than', 'so', 'we', 'you', 'use', 'make', 'build', 'task', 'please',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

interface ParsedInstinct {
  confidence: number;
  trigger: string;
  action: string;
  source: string;
  scope: InstinctScope;
  stacks: string[];
  projects: string[];
  quickCircuit: boolean;
  samples: number;
  successes: number;
  failures: number;
}

function parseList(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function parseInstinctFile(filePath: string): ParsedInstinct | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const fm: Record<string, string> = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim();
    }
    const legacyConfidence = Number.parseFloat(fm.confidence ?? '');
    if (!Number.isFinite(legacyConfidence)) return null;
    const counts = computeInstinctConfidence({
      successes: fm.successes ? Number(fm.successes) : undefined,
      failures: fm.failures ? Number(fm.failures) : undefined,
      samples: fm.samples ? Number(fm.samples) : undefined,
      legacyConfidence,
    });
    const scope = (['global', 'stack', 'project'].includes(fm.scope) ? fm.scope : 'global') as InstinctScope;
    return {
      confidence: counts.confidence || legacyConfidence,
      trigger: String(fm.trigger ?? ''),
      action: String(fm.action ?? ''),
      source: String(fm.source ?? 'unknown'),
      scope,
      stacks: parseList(String(fm.stacks ?? '')),
      projects: parseList(String(fm.projects ?? '')),
      quickCircuit: fm.quick_circuit === 'true',
      samples: counts.samples,
      successes: counts.successes,
      failures: counts.failures,
    };
  } catch { return null; }
}

function thresholdFor(scope: InstinctScope): number {
  // Prior context is cheaper than a short-circuit: project memory is useful
  // before it has enough samples to skip deliberation.
  if (scope === 'project') return 0.45;
  if (scope === 'stack') return 0.6;
  return 0.75;
}

export interface InstinctPriorContextOptions {
  vaultRoot?: string;
  maxBlocks?: number;
  /** Explicit project; defaults to the active project file. */
  project?: string | null;
  /** Explicit stacks; defaults to the active project note. */
  stacks?: string[] | null;
  /** Override the visibility filter (tests only). */
  activeProject?: ActiveProject | null;
}

/**
 * Compose the prior-context block for a dispatch: the composer's proven
 * instincts matching the task text AND the active scope. Returns null when
 * nothing qualifies — the dispatch stays lean, never padded.
 */
export function instinctPriorContext(
  godId: string,
  taskText: string,
  opts: InstinctPriorContextOptions = {},
): string | null {
  let vaultRoot = opts.vaultRoot ?? null;
  if (!vaultRoot) {
    try { vaultRoot = getVaultRoot(); } catch { return null; }
  }
  if (!vaultRoot || !godId) return null;
  const maxBlocks = opts.maxBlocks ?? 2;
  const taskTokens = tokenize(taskText);
  if (taskTokens.size === 0) return null;

  const ctx = opts.project !== undefined || opts.stacks !== undefined
    ? { slug: opts.project ?? null, stacks: opts.stacks ?? [] }
    : getActiveContext();
  const activeProject = opts.activeProject !== undefined
    ? opts.activeProject
    : activeProjectForScope(ctx);

  const candidates: Array<{
    trigger: string;
    action: string;
    confidence: number;
    overlap: number;
    source: string;
    scope: InstinctScope;
    quick: boolean;
  }> = [];

  for (const pool of ['seed', 'empirical']) {
    const dir = join(vaultRoot, '05_Auto_Learning', 'instincts', godId, pool);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const inst = parseInstinctFile(join(dir, f));
      if (!inst || !inst.action) continue;
      if (inst.confidence < thresholdFor(inst.scope)) continue;
      const visibility = filterInstinct({
        id: f.replace(/\.md$/, ''),
        god: godId,
        confidence: inst.confidence,
        scope: inst.scope,
        stacks: inst.stacks,
        projects: inst.projects,
        samples: inst.samples,
        path: join(dir, f),
      }, activeProject);
      if (!visibility.visible) continue;
      const triggerTokens = tokenize(inst.trigger);
      let overlap = 0;
      for (const t of triggerTokens) if (taskTokens.has(t)) overlap++;
      if (overlap >= 1) {
        candidates.push({
          trigger: inst.trigger,
          action: inst.action,
          confidence: inst.confidence,
          overlap,
          source: inst.source,
          scope: inst.scope,
          quick: inst.quickCircuit,
        });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.overlap - a.overlap) || (b.confidence - a.confidence));
  const blocks = candidates.slice(0, maxBlocks);
  return [
    '[PRIOR CONTEXT — proven instincts for this god and this scope. Trust but verify.]',
    ...blocks.map((c) => `- [${c.scope}${c.quick ? ' · quick' : ''}] ${c.trigger || '(general)'} → ${c.action} (confidence ${c.confidence.toFixed(2)}, ${c.source})`),
  ].join('\n');
}
