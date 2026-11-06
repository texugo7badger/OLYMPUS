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
import { listProjects, getProject, getActiveProjectSlug, setActiveProject, slugify, canonicalSlug, PROJECTS_DIR, type ProjectNote } from './project-context';
import { join } from 'node:path';

export type FirstPromptIntent =
  | { kind: 'new'; projectName: string; reason: string }
  | { kind: 'existing'; slug: string; score: number; reason: string }
  | { kind: 'ask'; candidates: Array<{ slug: string; score: number }>; reason: string };

/** A match at/above this score is a candidate. Tuned on the fixture table. */
export const INTENT_MATCH_THRESHOLD = 0.42;

/**
 * v0.0.85 — A HANDOFF IS A CONTINUATION, NEVER A NEW PROJECT.
 *
 * The specimen (2026-11-06 18:54): the context-window reset wrote a handoff
 * brief and sent `[OLYMPUS HANDOFF] … Read your continuation brief first:
 * /home/texugo/.olympus/handoffs/…/olympus-handoff-context-window.md …`.
 * The intake saw no known project in that text, derived the brief's name and
 * created `olympus-handoff-context-window` while AIME was the active project.
 *
 * Two explicit markers solve it without guessing:
 *   - `[OLYMPUS-PROJECT <slug>]` — the client pins the project it is in;
 *   - `[OLYMPUS HANDOFF]` — an older client; inherit the active project.
 * Both are checked BEFORE the approval/metadata guards, because a handoff is
 * neither a new task nor a project declaration.
 */
const PINNED_PROJECT_RE = /\[OLYMPUS-PROJECT\s+([a-z0-9][a-z0-9-]{0,63})\]/i;
const HANDOFF_RE = /\[OLYMPUS[ -]HANDOFF\]/i;

export function pinnedProjectSlug(text: string): string | null {
  const match = PINNED_PROJECT_RE.exec(String(text || ''));
  return match ? match[1].toLowerCase() : null;
}

export function isHandoffPrompt(text: string): boolean {
  return HANDOFF_RE.test(String(text || ''));
}

/**
 * v0.0.85 — a status/investigation sentence is about the CURRENT campaign,
 * not a new project. The second garbage specimen (`hop-c8-companion-notify-est-parked`)
 * was exactly this: a parked-hop question that the intake minted as a project.
 * Keep the rule conservative: a campaign word AND a question/imperative.
 */
const CAMPAIGN_WORD_RE = /\b(hop|walk|campaign|campanha|parked|dispatch|falhou|failed|erro|error|provider|rate.?limit)\b/i;
const DIAGNOSTIC_RE = /(\?|^(por que|porque|why|o que|what|como|how|investigue|investigar|retome|resume|continue|status)\b)/i;

/**
 * v0.0.85 — a SHORT instruction is a follow-up, not a new project.
 *
 * The second specimen (`background-escolhido-para-padr`): a design critique
 * ("O background escolhido… a home está com o background feio…") was pasted
 * into the terminal; the intake derived a project from the first sentence and
 * stole the active pointer from AIME. The companion follows the user's active
 * project; forking must be explicit ("create", "build", "new project", "crie",
 * "novo projeto", "do zero"). Short instructions, questions and fragment-like
 * briefs inherit the active lane instead.
 *
 * The cap is deliberately generous (600 chars): the specimen was ~300. A real
 * new-project brief is normally explicit or longer; the New Project button is
 * always available.
 */
const EXPLICIT_NEW_PROJECT_RE = /^(create|build|make|start|new project|novo projeto|crie|criar|construa|construir|comece|iniciar|inicie|desenvolva|desenvolver|implemente|implementar)\b/i;
const NEW_PROJECT_PHRASE_RE = /\b(new project|novo projeto|from scratch|do zero)\b/i;

export function shouldInheritActiveProject(text: string): boolean {
  const prompt = String(text || '').trim();
  if (!prompt || prompt.length > 600) return false;
  if (EXPLICIT_NEW_PROJECT_RE.test(prompt)) return false;
  if (NEW_PROJECT_PHRASE_RE.test(prompt)) return false;
  return true;
}

export function isCampaignDiagnostic(text: string): boolean {
  const prompt = String(text || '').trim();
  if (!prompt || prompt.length > 400) return false;
  if (pinnedProjectSlug(prompt) || isHandoffPrompt(prompt)) return false;
  if (!CAMPAIGN_WORD_RE.test(prompt)) return false;
  return DIAGNOSTIC_RE.test(prompt) || /\bparked\b/i.test(prompt);
}

function handoffRoute(text: string): { slug: string; kind: 'existing'; source: 'explicit' | 'memory'; message: string } | null {
  const pinned = pinnedProjectSlug(text);
  if (pinned) {
    const project = getProject(pinned);
    if (project) {
      return {
        slug: project.slug,
        kind: 'existing',
        source: 'explicit',
        message: `Pinned by [OLYMPUS-PROJECT ${project.slug}] — a handoff continues the same project, never a new one`,
      };
    }
  }
  if (isHandoffPrompt(text)) {
    const active = getActiveProjectSlug();
    if (active && getProject(active)) {
      return {
        slug: active,
        kind: 'existing',
        source: 'memory',
        message: `Handoff continuation — routed to the active project '${active}' (a context reset never forks a project)`,
      };
    }
  }
  return null;
}

/** Words too generic to carry project identity. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'onto',
  'make', 'build', 'create', 'write', 'design', 'give', 'want', 'need',
  'please', 'using', 'use', 'add', 'app', 'application', 'project', 'site',
  'website', 'page', 'pages', 'new', 'some', 'like', 'about',
  // #178 (the 'AIME Uploaded Files AIME' specimen): the terminal appends an
  // upload manifest to the prompt — its words are transport metadata, never
  // project identity.
  'uploaded', 'upload', 'file', 'files', 'saved', 'extracted', 'archive',
  'vault', 'projeto', 'arquivo', 'arquivos', 'anexado', 'anexados',
  // W-U: the PT verb openers (the 'Crie AURORA PULSE Painel' specimen —
  // the imperative verb leaked into the derived project name).
  'crie', 'criar', 'cria', 'construa', 'construir', 'faça', 'fazer',
  'pode', 'podemos', 'vamos', 'quero', 'preciso', 'seja',
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

/**
 * #178: strip the terminal's upload manifest (`[Uploaded files: ...]`) before
 * ANY name/word extraction. The block is transport metadata appended by the
 * UI; leaving it in made 'AIME' + AIME.md derive 'AIME Uploaded Files AIME'.
 */
export function stripUploadBlock(prompt: string): string {
  const marker = prompt.search(/\[Uploaded files:/i);
  return (marker >= 0 ? prompt.slice(0, marker) : prompt).trim();
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
  // #CONTINUATION-HEADER (the next-pass specimen, 2026-10-19): when the
  // prompt OPENS with a continuation directive (Continue/Resume/Continue o/
  // Retomar etc.), the quoted-string extraction is SUPPRESSED — deeper
  // quoted strings are feature descriptions ("a 'next pass' countdown
  // card" inside a mission-passes brief), never project declarations.
  // Returning null lets the slug-token matching in classifyFirstPrompt
  // handle the routing (the 22:30 specimen's logic already covers
  // "Continue o lumina Atlas para dispatch" — the word-set similarity).
  if (/^.{0,12}?(?:[Cc]ontinue|[Rr]esume|[Cc]ontinuar|[Rr]etomar|[Cc]ontinue o)\b/m.test(prompt)) {
    return null;
  }
  const quoted = prompt.match(/["“]([^"”\n]{2,60})["”]/);
  if (quoted) {
    const candidate = quoted[1].trim();
    // W-S CRITERION-NOT-NAME (the 'eu publicaria isso' specimen, 23:12):
    // a quoted CRITERION is not a project name. Acceptance bars and
    // answer phrases open with pronouns/sentence shapes ("eu publicaria
    // isso", "pronto, isso vai pro ar") — the #144 distinct-name law
    // grabbed them as project declarations and CREATED junk lanes while
    // the similarity matcher (0.55 on the real project) waited behind the
    // law. A name is title-like: no leading personal pronoun or sentence
    // opener. Rejected candidates fall through — the matcher decides.
    const sentenceShaped = /^(eu|tu|ele|ela|isso|aquilo|voc\u00ea|voc\u00eas|n\u00f3s|aqui|l\u00e1|vai|vou|est\u00e1|estou|sou|pronto|agora|the|this|that|these|those|you|it|i)\b/i.test(candidate);
    if (!sentenceShaped && candidate.split(/\s+/).length <= 6) return candidate;
  }
  // #144 (the unquoted-headline class): prompts open with "Build AURORA
  // FOCUS — a focus-session tracker" — the project name as a TITLE-CASED
  // headline before the em-dash, no quotes. Catch it or the distinct-name
  // law never fires for real-world naming styles.
  const headline = prompt.match(/^[^\n]{0,8}?(?:Build|Create|Make|Construa|Crie)\s+([A-Z][A-Za-z0-9&'\u2019-]*(?:\s+[A-Z][A-Za-z0-9&'\u2019-]*){0,3})\s*(?:\u2014|:|\u2013|-|$)/m);
  if (headline) {
    const name = headline[1].trim();
    // Two+ capitalized words — a single word is too weak a signal.
    if (name.split(/\s+/).length >= 2) return name;
  }
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
  const clean = stripUploadBlock(prompt);
  const sig = clean.replace(/[^a-zA-Z0-9\s-]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 4);
  const name = sig.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  if (name) return name;
  const raw = clean.split(/\s+/).slice(0, 3).join(' ');
  return raw || 'Untitled Project';
}

/**
 * Classify the first prompt against the known projects. Pure + injectable
 * (the fixture passes its own project table — listProjects() only when the
 * caller omits it).
 */
export function classifyFirstPrompt(prompt: string, projects?: ProjectNote[], opts?: { activeSlug?: string | null }): FirstPromptIntent {
  const known = projects ?? listProjects();
  const cleanPrompt = stripUploadBlock(prompt);
  const promptWords = words(cleanPrompt);

  // #PATH-SPECIMEN: a quoted path names a project LOCATION — route, never
  // create. The slug is the basename under 02_Projects (the pinned
  // directive: every project lives at 02_Projects/<slug>).
  const pathCand = extractProjectPathCandidate(cleanPrompt);
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

  // v0.0.28 — A PASTED PLAN IS A CONTINUATION, NEVER A PROJECT NAME.
  // The 2026-10-31 specimen: the CAL-2 prompt list created 'your taste' from
  // the quoted phrase inside the dashboard prompt and stole the active
  // pointer from AIME. THE v0.0.27 GUARD WAS UNREACHABLE: it sat AFTER the
  // #144 distinct-name law, which returns NEW as soon as ANY quoted 2–6 word
  // phrase exists — and plan pastes are full of quoted phrases, so the guard
  // was dead code for the exact specimen it was written for. The guard now
  // runs BEFORE extractProjectName, and its signal is deliberately narrow:
  // 2+ markdown hop headings AND 2+ DONE: markers. A normal brief (one
  // heading, one DONE, maybe a quoted criterion) falls through unchanged.
  const headingCount = (cleanPrompt.match(/^##\s+\S+/gm) ?? []).length;
  const doneCount = (cleanPrompt.match(/\bDONE:/g) ?? []).length;
  const planPaste = headingCount >= 2 && doneCount >= 2;
  if (planPaste) {
    const active = opts?.activeSlug === undefined ? getActiveProjectSlug() : opts.activeSlug;
    if (active && known.some((p) => p.slug === active)) {
      return {
        kind: 'existing',
        slug: active,
        score: 1,
        reason: `continuation — the prompt is a plan/prompt list (${headingCount} hop headings, ${doneCount} DONE: blocks); routed to the active project '${active}' instead of minting a name from prose`,
      };
    }
    return {
      kind: 'ask',
      candidates: known.slice(0, 3).map((p) => ({ slug: p.slug, score: 1 })),
      reason: active
        ? `plan paste — the active pointer '${active}' names no known project; asking instead of deriving a name from prose`
        : 'plan paste with no active project — asking instead of deriving a name from prose',
    };
  }

  const candidateName = extractProjectName(cleanPrompt);

  // #144 THE DISTINCT-NAME LAW (the AURORA specimen, 2026-10-18): a prompt
  // that NAMES its project (quoted — "AURORA FOCUS" — or called/named X)
  // where NO known project carries that name is a NEW project — PERIOD.
  // The similarity heuristics below can never override the user's own
  // words: every spec-shaped prompt shares the stack + design-bar
  // vocabulary, and the project notes store the FULL original prompt as
  // their description — so Jaccard scored 0.55 against an unrelated
  // project and EVERY new campaign routed into the old one (the misroute
  // that contaminated the orbital lane). The name is the strongest signal
  // there is; the exact-name match stays existing (verbatim), the
  // distinct name is new.
  if (candidateName) {
    const lower = candidateName.trim().toLowerCase();
    const named = known.find((p) => p.name.trim().toLowerCase() === lower);
    if (named) {
      return {
        kind: 'existing',
        slug: named.slug,
        score: 1,
        reason: `the prompt names the project '${named.name}' verbatim — routing to '${named.slug}'`,
      };
    }
    // The partial-name case ("update 'Lumina'" -> 'Lumina CRM'): the
    // candidate's words are a SUBSET of known names — route there. One
    // subset = existing; two or more = ask (never a silent guess).
    const candidateWords = words(candidateName);
    const subsets = known.filter((p) => {
      const nameWords = words(p.name);
      return candidateWords.size > 0 && [...candidateWords].every((w) => nameWords.has(w));
    });
    if (subsets.length === 1) {
      return {
        kind: 'existing',
        slug: subsets[0].slug,
        score: 1,
        reason: `the prompt names '${candidateName}' — a partial name of '${subsets[0].name}' — routing to '${subsets[0].slug}'`,
      };
    }
    if (subsets.length >= 2) {
      return {
        kind: 'ask',
        candidates: subsets.map((p) => ({ slug: p.slug, name: p.name, score: 1 })),
        reason: `the prompt names '${candidateName}' which matches ${subsets.length} projects — asking instead of guessing`,
      };
    }
    return {
      kind: 'new',
      projectName: candidateName,
      reason: `the prompt names the project '${candidateName}' and no known project carries that name — a distinct NAME beats every similarity heuristic (the #144 misroute class)`,
    };
  }

  const scored = known
    .map((p) => {
      const nameWords = words(p.name);
      let score = jaccard(nameWords, promptWords);
      // #CONTINUATION-SPECIMEN (2026-10-16, 22:30): "Continue o lumina" must
      // MATCH the project it continues — Jaccard on full prompts starves
      // short continuation instructions (1/11 = 0.09). A distinctive prompt
      // token equal to a slug token is a strong routing signal.
      const slugTokens = new Set(p.slug.toLowerCase().split('-'));
      const lowerPrompt = cleanPrompt.toLowerCase();
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
  // #CONTINUATION-SLUG (the next-pass followup, 2026-10-19): a continuation
  // prompt with exactly ONE slug-token hit routes THERE — never the ask
  // branch. A continuation is the user's explicit resume action; the
  // feature-description vocabulary ("next pass", "telemetry") matching other
  // projects' descriptions is noise, not intent. One slug hit = the project.
  const isContinuation = /^.{0,12}?(?:[Cc]ontinue|[Rr]esume|[Cc]ontinuar|[Rr]etomar|[Cc]ontinue o)\b/m.test(cleanPrompt);
  if (isContinuation && scored.length >= 2) {
    // Only tokens in the CONTINUATION HEADER ZONE (the first ~80 chars —
    // where "Continue ORBITAL project" lives) count. A slug token that
    // only appears deeper in the brief ("next pass" as a feature
    // description 300 chars in) is vocabulary noise, never the resume
    // intent.
    const headerZone = cleanPrompt.slice(0, 80).toLowerCase();
    const slugHits = scored.filter((s) => {
      const st = new Set(s.slug.toLowerCase().split('-'));
      for (const t of st) {
        if (t.length >= 4 && new RegExp(`\\b${t}\\b`).test(headerZone)) return true;
      }
      return false;
    });
    if (slugHits.length === 1) {
      return {
        kind: 'existing',
        slug: slugHits[0].slug,
        score: slugHits[0].score,
        reason: `continuation + slug-token match on '${slugHits[0].slug}' — the resume action routes there (the feature vocabulary matching other descriptions is noise, not intent)`,
      };
    }
  }
  if (scored.length >= 2) {
    return {
      kind: 'ask',
      candidates: scored.slice(0, 3).map((s) => ({ slug: s.slug, score: s.score })),
      reason: `${scored.length} projects match the prompt (>= ${INTENT_MATCH_THRESHOLD}) — ambiguous, asking instead of guessing`,
    };
  }
  // (v0.0.28) The plan-paste guard lives ABOVE extractProjectName now —
  // after the #144 return it could never fire. See the top of this function.
  const projectName = candidateName ?? deriveProjectName(cleanPrompt);
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
/**
 * v0.0.63 — approval/meta messages are NOT project declarations. "Aprovado!",
 * "ok", "pode seguir", "deixe rodando..." must resolve a gate or inherit the
 * active project; they must never mint a slug. The log specimen: "Aprovado!"
 * created 02_Projects/aprovado and then captured every follow-up.
 *
 * APPROVAL is anchored to the WHOLE message (punctuation allowed): "Aprovado!"
 * and "ok" are approvals; "ok aime" and "continue o projeto aime" are not —
 * they name a project and must resolve to it.
 */
const APPROVAL_RE = /^(aprovado|aprovada|aprov|ok|okay|sim|s|yes|y|perfeito|pode seguir|pode continuar|continue|continuar|go|start|seguir)([\s!.,;:)\]]*)$/i;
const META_RE = /^(deixe|deixa|mantenha|sempre que|enquanto|obrigado|valeu|show|beleza|perfeito|aprovado|aprovada|pode seguir|pode continuar|continue|continuar|agora|então|entao)\b/i;

export function isApprovalMessage(prompt: string): boolean {
  const p = (prompt || '').trim();
  return p.length > 0 && p.length <= 80 && APPROVAL_RE.test(p);
}

export function isMetaMessage(prompt: string): boolean {
  const p = (prompt || '').trim();
  return p.length > 0 && p.length <= 160 && META_RE.test(p);
}

/**
 * v0.0.63 — the EXPLICIT project in the text wins over conversation memory.
 * The worklog specimen: "continue o projeto aime" was routed to 'aprovado'
 * because conversationProjectMemory was consulted first. This helper is
 * deliberately conservative: a known slug as a whole word, or a known name
 * of >= 4 chars as a phrase.
 */
export function findExplicitProject(prompt: string, projects?: ProjectNote[]): ProjectNote | null {
  const text = ` ${String(prompt || '').toLowerCase()} `;
  const known = projects ?? listProjects();
  const hits = known.filter((p) => {
    const slug = p.slug.toLowerCase();
    const name = String(p.name || '').toLowerCase();
    const slugHit = new RegExp(`(^|[^a-z0-9-])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9-]|$)`).test(text);
    const nameHit = name.length >= 4 && text.includes(` ${name} `);
    return slugHit || nameHit;
  });
  return hits.sort((a, b) => b.slug.length - a.slug.length)[0] ?? null;
}

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

/**
 * v0.0.63 — THE TURN-ROUTING DECISION, pure and testable.
 *
 * The 2026-11-03 worklog specimen: the conversation memory held 'aprovado'
 * (minted from the word "Aprovado!") and it beat the text "continue o
 * projeto aime" — three turns in a row. The precedence is now explicit:
 *
 *   1. a project NAMED in the text      → route there (wins over memory)
 *   2. conversation memory               → continuity, but ONLY when the
 *      turn is not a new-task marker, not an approval, and not a meta
 *      instruction ("deixe rodando…", "ok", "obrigado")
 *   3. null                              → the caller runs intake (which
 *      itself refuses to mint a slug from approval/continuation text)
 *
 * Returns null when the turn must go through intake.
 */
export function resolveKnownTurnProject(opts: {
  text: string;
  conversationProject?: string | null;
  isNewTask?: boolean;
  projects?: ProjectNote[];
}): { slug: string; kind: 'existing'; source: 'explicit' | 'memory'; message: string } | null {
  const text = opts.text || '';
  // A handoff is a continuation of the same lane, not a new task. The pin
  // (or the active project for an older client) wins over every heuristic.
  const handoff = handoffRoute(text);
  if (handoff) return handoff;
  // An approval is a control word, not a name: "Aprovado!" must never match
  // a project that happens to be called 'aprovado'. It inherits memory (or
  // falls through to intake → active project) but never names a lane.
  const approval = isApprovalMessage(text);
  const explicit = approval ? null : findExplicitProject(text, opts.projects);
  if (explicit) {
    return {
      slug: explicit.slug,
      kind: 'existing',
      source: 'explicit',
      message: `Routed to the project named in the message '${explicit.slug}' (explicit name wins over conversation memory)`,
    };
  }
  const convo = opts.conversationProject ?? null;
  if (convo && !opts.isNewTask) {
    return {
      slug: convo,
      kind: 'existing',
      source: 'memory',
      message: `Routed to the conversation's project '${convo}' (continuity — a follow-up turn never forks a new project)`,
    };
  }
  return null;
}

export async function resolveAndRegisterIntent(
  userRequest: string,
  stacks: string[],
  opts: { targetTui?: 'opencode' | 'generic' } = {},
): Promise<IntentStageResult> {
  // v0.0.85 — the handoff/pin wins before any fuzzy classification. This is
  // the guard that keeps a context reset inside the active project.
  const handoff = handoffRoute(userRequest);
  if (handoff) {
    setActiveProject(handoff.slug);
    return { kind: 'existing', slug: handoff.slug, message: handoff.message };
  }
  // v0.0.85 — a parked-hop/campaign question inherits the active lane too.
  if (isCampaignDiagnostic(userRequest)) {
    const active = getActiveProjectSlug();
    if (active && getProject(active)) {
      setActiveProject(active);
      return { kind: 'existing', slug: active, message: `Campaign diagnostic — routed to the active project '${active}' (a status question never mints a project)` };
    }
  }
  // v0.0.85 — a short follow-up inherits the active lane. Forking a project
  // requires an explicit create/new-project phrase (or the New Project button).
  if (shouldInheritActiveProject(userRequest)) {
    const activeNow = getActiveProjectSlug();
    if (activeNow && getProject(activeNow)) {
      setActiveProject(activeNow);
      return { kind: 'existing', slug: activeNow, message: `Routed to the active project '${activeNow}' (short follow-up — only an explicit new-project request forks)` };
    }
  }
  // v0.0.63 — APPROVAL IS A CONTROL WORD, NEVER A PROJECT NAME. The fuzzy
  // classifier scores "Aprovado!" 1.00 against a project called 'Aprovado'
  // (the ghost that captured three turns). Check the control word BEFORE
  // any classification, and route to the active project — never create.
  if (isApprovalMessage(userRequest)) {
    const active = getActiveProjectSlug();
    if (active) {
      setActiveProject(active);
      return { kind: 'existing', slug: active, message: `Routed to the active project '${active}' (approval is a control word — it never names or creates a project)` };
    }
    const projects = listProjects();
    const recent = [...projects]
      .filter((p) => p.last_active)
      .sort((a, b) => String(b.last_active).localeCompare(String(a.last_active)))[0];
    if (recent) {
      setActiveProject(recent.slug);
      return { kind: 'existing', slug: recent.slug, message: `Routed to the most recent project '${recent.slug}' (approval — no active pointer, newest project by activity)` };
    }
    return {
      kind: 'ask',
      candidates: projects.slice(0, 3).map((p) => ({ slug: p.slug, score: 1 })),
      message: 'Approval noted — but there is no project to route it to. Which project? No project was created.',
    };
  }
  const intent = classifyFirstPrompt(userRequest);
  if (intent.kind === 'existing') {
    setActiveProject(intent.slug);
    return { kind: 'existing', slug: intent.slug, message: `Routed to existing project '${intent.slug}' (${intent.reason})` };
  }
  // v0.0.63 — an explicit project name in the text always wins, even when
  // the classifier fell through to 'new' (the 'continue o projeto aime'
  // specimen that conversation memory stole).
  const explicit = findExplicitProject(userRequest);
  if (explicit) {
    setActiveProject(explicit.slug);
    return { kind: 'existing', slug: explicit.slug, message: `Routed to the project named in the message '${explicit.slug}' (explicit name wins over conversation memory)` };
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
  //
  // #BARE-CONTINUATION (the 00:47 specimen): "continue!" — a bare
  // continuation with zero identity tokens — asked WHICH project while the
  // session's own active pointer and the most-recent project sat right
  // there. A continuation with no name routes to the ACTIVE project; no
  // pointer → the most recently active project; nothing known → the ask,
  // now WITH the candidates listed.
  if (intent.kind === 'new' && (isContinuationMessage(userRequest) || isApprovalMessage(userRequest) || isMetaMessage(userRequest))) {
    const projects = listProjects();
    const active = getActiveProjectSlug();
    if (active) {
      setActiveProject(active);
      return { kind: 'existing', slug: active, message: `Routed to the active project '${active}' (continuation — a bare "continue" inherits the session's active project)` };
    }
    const recent = [...projects]
      .filter((p) => p.last_active)
      .sort((a, b) => String(b.last_active).localeCompare(String(a.last_active)))[0];
    if (recent) {
      setActiveProject(recent.slug);
      return { kind: 'existing', slug: recent.slug, message: `Routed to the most recent project '${recent.slug}' (continuation — no active pointer, newest project by activity)` };
    }
    return {
      kind: 'ask',
      candidates: projects.slice(0, 3).map((p) => ({ slug: p.slug, score: 1 })),
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
  const slug = canonicalSlug(intent.projectName);
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
