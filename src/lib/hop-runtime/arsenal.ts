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
    '[YOUR ARSENAL — DEMIGOD TEAM ORCHESTRATION]',
    `You command ${roster.length} demigods. You are the MIND of this hop: you decompose the work, your demigods are the HANDS, and you own the outcome.`,
    '',
    'THE TEAM CONTRACT (v0.0.23):',
    '1. SIZE THE WORK FIRST. A hop with 2+ independent sub-tasks (separate files, separate checks, separate research) MUST become a team of 2–5 demigods. A trivial hop (one file, one change, under ~50 lines) works alone — never spawn a team to look busy.',
    '2. ONE PARALLEL WAVE. Dispatch every independent sub-task in the SAME wave (multiple olympus-dispatch calls in one step) — never serially, never one-at-a-time. Dependent sub-tasks wait for the wave that produces their input.',
    '3. DISPATCH BY FIT. Choose each demigod for the sub-task it was built for (the roster below says what each one does). Give each one: the exact files, the done-condition, and the artifact to return.',
    '4. VERIFY, THEN SYNTHESIZE. Read every returned artifact yourself. If one failed, re-dispatch that sub-task only (never the whole team). Your hop closes only when the artifacts are real and consistent.',
    '5. REPORT THE CHAIN. Your final answer names: the sub-tasks, the demigods that did them, what you verified, and what remains. Apollo reads this to validate the campaign.',
    '',
    'COST DISCIPLINE: a team multiplies tokens. Keep the wave at the smallest size that covers the independent work (2–5), and never dispatch the same sub-task twice.',
    '',
    'Your roster:',
  ];
  for (const d of roster) lines.push(`- ${d.id} — ${d.line}`);
  return lines.join('\n');
}
