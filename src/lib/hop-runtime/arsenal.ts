/**
 * arsenal.ts (v0.0.5-prelude, the PARALLELISM-OF-PARALLELISM night):
 * the god→demigod roster loader. Each god's demigods live as prompt .txt
 * files under .opencode/prompts/agents/demigods/<god>/ — the ARSENAL
 * DIRECTIVE composes them into every hop prompt so the god KNOWS who it
 * commands and DISPATCHES by fit (olympus-dispatch + the native task
 * system spawns the demigod in-process).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface ArsenalDemigod {
  /** The demigod id (the prompt file's basename). */
  id: string;
  /** The one-line identity from the file's H1. */
  line: string;
}

const CACHE = new Map<string, ArsenalDemigod[]>();

/**
 * Load a god's demigod roster (name + the H1's identity line, kept to one
 * line — the directive rides EVERY hop, so the roster is a menu, not a
 * biography). Cached per god: the files are static between releases.
 */
export function loadArsenal(god: string, repoRoot?: string): ArsenalDemigod[] {
  const key = god;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const root = repoRoot ?? process.cwd();
  const dir = join(root, '.opencode', 'prompts', 'agents', 'demigods', god);
  const out: ArsenalDemigod[] = [];
  try {
    if (!existsSync(dir)) return out;
    for (const f of readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
      try {
        const raw = readFileSync(join(dir, f), 'utf-8');
        // The H1: "# Api-designer — Demigod of API Contract Design (under Hephaestus)"
        const h1 = (raw.split('\n').find(l => l.startsWith('# ')) || '')
          .replace(/^#\s+/, '')
          // The identity line only — drop the "(under X)" suffix.
          .replace(/\s*\(under [A-Z][a-z]+\)\s*$/, '')
          .trim();
        const id = f.replace(/\.txt$/, '');
        out.push({ id, line: h1 || id });
      } catch { /* a broken roster file never breaks the walk */ }
    }
  } catch { /* no arsenal = no directive addition */ }
  CACHE.set(key, out);
  return out;
}

/**
 * THE ARSENAL DIRECTIVE — the hop prompt block that makes the god an
 * ORCHESTRATOR of its own demigods: the roster (one line each) + the
 * doctrine (dispatch BY FIT via olympus-dispatch; the native task system
 * spawns the demigod; the god VERIFIES their artifacts and owns the
 * outcome). Composed into every hop prompt (v0.0.4+).
 */
export function composeArsenalDirective(god: string, repoRoot?: string): string {
  const roster = loadArsenal(god, repoRoot);
  if (roster.length === 0) return '';
  const lines = [
    '[YOUR ARSENAL — DEMIGOD ORCHESTRATION]',
    `You command ${roster.length} demigods. For sub-tasks of this hop, DISPATCH them via the olympus-dispatch tool — the demigod spawns as your in-process subagent and works in your lane.`,
    'Choose each demigod BY FIT for the sub-task (the tool suggests proven pairs). Dispatch MULTIPLE demigods when the sub-tasks are independent. YOU verify their artifacts before declaring your hop done — your hop owns the outcome.',
    'Your roster:',
  ];
  for (const d of roster) lines.push(`- ${d.id} — ${d.line}`);
  return lines.join('\n');
}
