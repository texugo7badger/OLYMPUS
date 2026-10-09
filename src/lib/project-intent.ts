/**
 * project-intent.ts — #110 (FLUENCY-1, Batch D): the autonomous first-prompt
 * intake. OLYMPUS opens with NO folder selected — the FIRST prompt decides:
 *
 *   new              -> quickIntake (name + description + the classifier's
 *                       stack hints registered before any file exists) and
 *                       the project becomes the active lane
 *   existing:<slug>  -> route into the existing project (no duplicate)
 *   ask              -> AMBIGUOUS (>= 2 strong matches): the HITL gate asks
 *                       (the only non-autonomous path — autonomy with a
 *                       safety seam; never a silent guess)
 *
 * Deterministic, no LLM — the match is word-set similarity (the Jaccard
 * class already in the arsenal resolver) against listProjects().
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { listProjects, getActiveProjectSlug, setActiveProject, slugify, PROJECTS_DIR, type ProjectNote } from './project-context';
import { join } from 'node:path';

export type FirstPromptIntent =
  | { kind: 'new'; projectName: string; reason: string }
  | { kind: 'existing'; slug: string; score: number; reason: string }
  | { kind: 'ask'; candidates: Array<{ slug: string; score: number }>; reason: string };

/** A match at/above this score is a candidate. Tuned on the fixture table. */
export const INTENT_MATCH_THRESHOLD = 0.42;

/** Words too generic to carry project identity. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'onto',
  'make', 'build', 'create', 'write', 'design', 'give', 'want', 'need',
  'please', 'using', 'use', 'add', 'app', 'application', 'project', 'site',
  'website', 'page', 'pages', 'new', 'some', 'like', 'about',
]);

function words(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Extract an explicitly named project from the prompt: quoted ("Lumina
 * CRM"), or `called|named|titled X [Y]`. Null when the prompt names nothing.
 */
export function extractProjectName(prompt: string): string | null {
  const quoted = prompt.match(/["“]([^"”\n]{2,60})["”]/);
  if (quoted) return quoted[1].trim();
  const called = prompt.match(/\b(?:called|named|titled)\s+([A-Za-z0-9&'’-]+)(?:\s+([A-Za-z0-9&'’-]+))?/i);
  if (called) {
    const second = called[2];
    const useSecond = !!second && !STOPWORDS.has(second.toLowerCase());
    const name = useSecond ? `${called[1]} ${second}` : called[1];
    return name.replace(/[.'’-]+$/, '').trim();
  }
  return null;
}

/** Derive a name from the prompt's significant words (no interrogation). */
export function deriveProjectName(prompt: string): string {
  const sig = prompt.replace(/[^a-zA-Z0-9\s-]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 4);
  const name = sig.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  if (name) return name;
  const raw = prompt.trim().split(/\s+/).slice(0, 3).join(' ');
  return raw || 'Untitled Project';
}

/**
 * Classify the first prompt against the known projects. Pure + injectable
 * (the fixture passes its own project table — listProjects() only when the
 * caller omits it).
 */
export function classifyFirstPrompt(prompt: string, projects?: ProjectNote[]): FirstPromptIntent {
  const known = projects ?? listProjects();
  const promptWords = words(prompt);
  const candidateName = extractProjectName(prompt);

  const scored = known
    .map((p) => {
      const nameWords = words(p.name);
      let score = jaccard(nameWords, promptWords);
      if (candidateName) {
        const candidateWords = words(candidateName);
        const candidateScore = jaccard(nameWords, candidateWords);
        const exact = p.name.trim().toLowerCase() === candidateName.trim().toLowerCase();
        score = Math.max(score, exact ? 1 : candidateScore);
      }
      if (p.description) score = Math.max(score, jaccard(words(p.description), promptWords));
      return { slug: p.slug, name: p.name, score };
    })
    .filter((s) => s.score >= INTENT_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) {
    return {
      kind: 'existing',
      slug: scored[0].slug,
      score: scored[0].score,
      reason: `prompt matches project '${scored[0].name}' (score ${scored[0].score.toFixed(2)} >= ${INTENT_MATCH_THRESHOLD})`,
    };
  }
  if (scored.length >= 2) {
    return {
      kind: 'ask',
      candidates: scored.slice(0, 3).map((s) => ({ slug: s.slug, score: s.score })),
      reason: `${scored.length} projects match the prompt (>= ${INTENT_MATCH_THRESHOLD}) — ambiguous, asking instead of guessing`,
    };
  }
  const projectName = candidateName ?? deriveProjectName(prompt);
  return {
    kind: 'new',
    projectName,
    reason: candidateName
      ? `no project matches; the prompt names '${candidateName}' — creating it`
      : `no project matches; deriving the name '${projectName}' from the prompt`,
  };
}

export interface IntentStageResult {
  kind: 'new' | 'existing' | 'ask' | 'skipped';
  slug?: string;
  message: string;
  candidates?: Array<{ slug: string; score: number }>;
}

/**
 * The app-side stage: classify, then ACT — new creates + activates, existing
 * routes, ask emits the HITL question. Never throws into the dispatch path
 * (the caller wraps; a failed intake must not block the user's run).
 */
export async function resolveAndRegisterIntent(
  userRequest: string,
  stacks: string[],
  opts: { targetTui?: 'opencode' | 'generic' } = {},
): Promise<IntentStageResult> {
  const intent = classifyFirstPrompt(userRequest);
  if (intent.kind === 'existing') {
    setActiveProject(intent.slug);
    return { kind: 'existing', slug: intent.slug, message: `Routed to existing project '${intent.slug}' (${intent.reason})` };
  }
  if (intent.kind === 'ask') {
    const names = intent.candidates.map((c) => `${c.slug} (${c.score.toFixed(2)})`).join(', ');
    return {
      kind: 'ask',
      candidates: intent.candidates,
      message: `Which project should this run in? Candidates: ${names}. No project was created; answer with the project name to route there.`,
    };
  }
  // new: register BEFORE any file exists — name + description + the
  // classifier's stack hints (honest: hints from the prompt's intent).
  // #110 rider (FLUENCY-1): the lane project dir is EXPLICIT — 02_Projects/
  // <slug>, the user's pinned directive. Without it, runIntake's createPath
  // falls back to process.cwd() — an API route's cwd is the OLYMPUS repo
  // (the #99 shape: the note would point at the working tree). NOTE: we do
  // NOT pre-create the dir — createProject owns creation (its existence
  // check would else collide).
  const { quickIntake } = await import('./intake-orchestrator');
  const slug = slugify(intent.projectName);
  const laneProjectDir = join(PROJECTS_DIR, slug);
  const result = await quickIntake({
    userRequest,
    projectName: intent.projectName,
    targetTui: opts.targetTui ?? 'opencode',
    manualStacks: stacks,
    laneProjectDir,
  });
  if (!result.ok || !result.project) {
    return { kind: 'skipped', message: `Intake failed (${result.error ?? 'unknown'}) — proceeding without a registered project` };
  }
  setActiveProject(result.project.slug);
  return {
    kind: 'new',
    slug: result.project.slug,
    message: `Created project '${result.project.name}' (${result.project.slug}) at ${result.projectDir ?? result.project.path} — ${intent.reason}`,
  };
}

/** Exported for the caller's dispatch-cwd resolution: the active lane. */
export function activeProjectSlug(): string | null {
  return getActiveProjectSlug();
}
