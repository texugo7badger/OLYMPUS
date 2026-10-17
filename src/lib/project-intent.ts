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

/**
 * #PATH-SPECIMEN (2026-10-16, 22:32): detect a quoted PATH candidate (any
 * quote flavor — the terminal converts ASCII quotes to typographic ones).
 * Returns the raw path when the quoted text contains a path separator,
 * null otherwise. Routing resolves it; it is NEVER a project name.
 */
export function extractProjectPathCandidate(prompt: string): string | null {
  const quoted = prompt.match(/["'“‘]([^"'”’\n]{2,300})["'”’]/);
  if (!quoted) return null;
  const raw = quoted[1].trim().replace(/^["'“‘”’]+|["'“‘”’]+$/g, '');
  return raw.includes('/') ? raw : null;
}

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
 *
 * #PATH-SPECIMEN (2026-10-16, 22:32): the terminal's typographic quotes made
 * a quoted PROJECT PATH ("'/home/.../02_Projects/lumina-crm'") land here as
 * the project NAME — the intake created 'home-texugo-olympus-vault-02-
 * projects-lumina-crm' instead of routing to the live lumina-crm at exactly
 * that path. A quoted candidate containing a path separator is a LOCATION,
 * never a name — classifyFirstPrompt resolves it BEFORE any naming path.
 */
export function extractProjectName(prompt: string): string | null {
  const pathCand = extractProjectPathCandidate(prompt);
  if (pathCand) return null; // a path is a routing signal, not a name
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

  // #PATH-SPECIMEN: a quoted path names a project LOCATION — route, never
  // create. The slug is the basename under 02_Projects (the pinned
  // directive: every project lives at 02_Projects/<slug>).
  const pathCand = extractProjectPathCandidate(prompt);
  if (pathCand) {
    const base = pathCand.replace(/\/+$/, '').split('/').pop()?.toLowerCase() ?? '';
    const hit = known.find((p) => p.slug.toLowerCase() === base);
    if (hit) {
      return {
        kind: 'existing',
        slug: hit.slug,
        score: 1,
        reason: `the prompt names the project's path '${pathCand}' — routing to '${hit.slug}'`,
      };
    }
  }

  const candidateName = extractProjectName(prompt);

  const scored = known
    .map((p) => {
      const nameWords = words(p.name);
      let score = jaccard(nameWords, promptWords);
      // #CONTINUATION-SPECIMEN (2026-10-16, 22:30): "Continue o lumina" must
      // MATCH the project it continues — Jaccard on full prompts starves
      // short continuation instructions (1/11 = 0.09). A distinctive prompt
      // token equal to a slug token is a strong routing signal.
      const slugTokens = new Set(p.slug.toLowerCase().split('-'));
      const lowerPrompt = prompt.toLowerCase();
      for (const t of slugTokens) {
        if (t.length >= 4 && new RegExp(`\\b${t}\\b`).test(lowerPrompt)) {
          score = Math.max(score, 0.55);
          break;
        }
      }
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
/** UAT-5: the continuation detector — phrases that signal the user is
 *  trying to CONTINUE an existing project, not start a new one. When
 *  detected and NO project matches, the intake returns 'ask' (the honest
 *  "not found") instead of creating a garbage-named project from a
 *  continuation instruction. */
const CONTINUATION_RE = /^(continue|continua[r]?|prosseguir|retomar|resume|keep going|keep working|sig[aau]\b|segue|seguindo)\b/i;
export function isContinuationMessage(prompt: string): boolean {
  // UAT-5 refinement: the guard must be CONSERVATIVE — only trigger on
  // SHORT messages that READ as continuation instructions (the 09:10:09
  // specimen: "Continue o projeto Lumina..." at ~60 chars). A full project
  // description (600+ chars) that happens to contain "o projeto" in its
  // DoD clause must NEVER be misclassified (the self-test specimen: the
  // original Lumina prompt contains "o projeto registrado" in its
  // Definition of Done and was caught by the aggressive regex).
  const p = (prompt || '').trim();
  return p.length <= 200 && CONTINUATION_RE.test(p);
}

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
  // UAT-5 (the continuation guard): when the message reads as a CONTINUATION
  // instruction ("continue o projeto Lumina") and no project matched, the
  // honest response is ASK, never a garbage-named creation. The 09:10:09
  // specimen: "Continue o projeto Lumina seguindo todo o planejamento!"
  // became the project 'continue-projeto-lumina-seguindo'.
  if (intent.kind === 'new' && isContinuationMessage(userRequest)) {
    return {
      kind: 'ask',
      candidates: [],
      message: `This looks like a continuation of an existing project, but I can't find a match. Which project? (Or re-send the original prompt to start fresh.)`,
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
    message: `Created project '${result.project.name}' (${result.project.slug}) at ${result.projectDir ?? result.project.path} — ALL project files (the scaffold, dispatch-plan.json, and every artifact) belong at THIS absolute path, NEVER the session cwd or any workspace lane — ${intent.reason}`,
  };
}

/** Exported for the caller's dispatch-cwd resolution: the active lane. */
export function activeProjectSlug(): string | null {
  return getActiveProjectSlug();
}
