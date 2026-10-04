/**
 * Task Classifier — heuristic prompt classifier for dynamic input token routing.
 *
 * Pure heuristics + stack detection — never makes an LLM call. Invoked before
 * spawning opencode to set the OLYMPUS_TASK_CLASSIFICATION env var, which
 * controls the dynamic context loader's token budget.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { GodId } from './model-strategies';

export interface TaskClassification {
  /**
   * Unique id for THIS classification decision (issue #54 join key).
   * Minted at classification time, echoed through the
   * OLYMPUS_TASK_CLASSIFICATION env payload AND the in-band
   * [OLYMPUS-CLASSIFICATION id=...] marker so the plugin-side dispatch
   * writers can stamp it onto dispatch/dispatch_outcome events — giving
   * the agreement metric an exact join key instead of ts-proximity.
   */
  classificationId: string;
  domain: 'frontend' | 'backend' | 'security' | 'testing' | 'integrations' | 'database' | 'devops' | 'planning' | 'vault-curation';
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'architectural';
  stack: string[];
  files: string[];
  needsPlanning: boolean;
  needsArchive: boolean;
  estimatedTokens: number;
  routeTo: GodId;
  /** Brief human-readable reason explaining the classification (debug aid). */
  reason: string;
}

// ─── Stack detection ──────────────────────────────────────────────────────────

/**
 * Keywords that map to a stack ID. The stack ID is consumed by
 * `src/lib/skill-stacks.ts` `isSkillVisible()` to filter which skills load.
 *
 * Stack IDs are kept lowercase + hyphen-free so they match the existing
 * SKILL_STACKS keys (e.g. 'react', 'postgres', 'docker').
 */
const STACK_KEYWORDS: Record<string, string[]> = {
  react:       ['react', 'jsx', 'tsx', 'next.js', 'nextjs', 'hook', 'useeffect', 'usestate'],
  vue:         ['vue', 'nuxt', 'composition api', 'vuex'],
  svelte:      ['svelte', 'sveltekit'],
  angular:     ['angular', 'ng-', 'ngrx'],
  typescript:  ['typescript', 'ts ', '.ts', 'type ', 'interface ', 'generic'],
  javascript:  ['javascript', 'js ', '.js', 'node', 'npm'],
  python:      ['python', '.py', 'pip', 'pytest', 'django', 'flask', 'fastapi'],
  rust:        ['rust', '.rs', 'cargo', 'tokio', 'serde'],
  go:          ['golang', 'go ', '.go', 'goroutine', 'go module'],
  java:        ['java', 'jvm', 'maven', 'gradle', 'spring'],
  kotlin:      ['kotlin', 'ktor'],
  cpp:         ['c++', 'cpp', '.cpp', '.h', 'cmake', 'makefile'],
  php:         ['php', 'laravel', 'symfony'],
  postgres:    ['postgres', 'postgresql', 'pg ', 'sql', 'prisma', 'drizzle'],
  mysql:       ['mysql', 'maria'],
  sqlite:      ['sqlite'],
  redis:       ['redis', 'cache'],
  docker:      ['docker', 'dockerfile', 'container', 'compose'],
  kubernetes:  ['kubernetes', 'k8s', 'kubectl', 'helm', 'pod'],
  terraform:   ['terraform', 'tf ', 'iac', 'infrastructure as code'],
  ci_cd:       ['ci/cd', 'github actions', 'gitlab ci', 'jenkins', 'pipeline'],
  aws:         ['aws', 's3', 'ec2', 'lambda', 'iam', 'cloudwatch'],
  graphql:     ['graphql', 'gql', 'apollo client', 'apollo server'],
};

/**
 * Detect stacks mentioned in the prompt. Returns a de-duplicated list of
 * stack IDs. Case-insensitive substring match.
 */
export function detectStacks(prompt: string): string[] {
  const lower = ' ' + prompt.toLowerCase() + ' ';
  const found = new Set<string>();
  for (const [stack, keywords] of Object.entries(STACK_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        found.add(stack);
        break;
      }
    }
  }
  return Array.from(found);
}

// ─── File path extraction ─────────────────────────────────────────────────────

/**
 * Extract file paths mentioned in the prompt. Recognizes:
 *   - Relative paths: src/lib/foo.ts, ./bin/olympus.js
 *   - Absolute paths: /home/.../foo.ts (Unix), C:\...foo.ts (Windows)
 *   - Bare filenames with extensions: foo.ts, bar.py
 * Returns de-duplicated paths in order of appearance.
 */
export function extractFilePaths(prompt: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  // Match: (optional ./ or / or drive:) + word chars + (slash word chars)+ + .ext
  const re = /(?:\.?\/|[A-Za-z]:\\)?(?:[\w.-]+[\/\\])+[\w.-]+\.[a-zA-Z]{1,6}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const p = m[0];
    if (!seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }
  return paths;
}

// ─── Domain + routing ─────────────────────────────────────────────────────────

/**
 * Canonical god → domain map for EXPLICITLY ADDRESSED gods (issue #54
 * evidence / RLM memo P5, fixed in BATCH 12c). Atlas has no dedicated
 * domain in the TaskClassification union — orchestration is closest to
 * planning.
 */
const GOD_DOMAINS: Record<GodId, TaskClassification['domain']> = {
  apollo: 'planning',
  atlas: 'planning',
  artemis: 'security',
  athena: 'frontend',
  dionysus: 'testing',
  hephaestus: 'backend',
  hermes: 'integrations',
  persephone: 'database',
  prometheus: 'devops',
  callimachus: 'vault-curation',
};

/**
 * God names are never stack keywords, and an EXPLICITLY ADDRESSED god
 * (structured field: godId=apollo / god: hephaestus …) takes precedence
 * over stack/keyword routing — a prompt that says "dispatch with
 * godId=apollo" is about Apollo the god, not the Apollo GraphQL client
 * (BATCH 12b evidence: such prompts were stack-routed to hermes via the
 * bare 'apollo' keyword, deflating the agreement metric to 0.0).
 */
const GOD_ID_UNION = 'apollo|atlas|artemis|athena|dionysus|hephaestus|hermes|persephone|prometheus|callimachus';
const EXPLICIT_GOD_RE = new RegExp(`\\bgod(?:Id)?\\s*[:=]\\s*["']?(${GOD_ID_UNION})\\b`, 'i');

function explicitGodAddress(prompt: string): { god: GodId; domain: TaskClassification['domain'] } | null {
  const m = prompt.match(EXPLICIT_GOD_RE);
  if (!m) return null;
  const god = m[1].toLowerCase() as GodId;
  return { god, domain: GOD_DOMAINS[god] };
}

/**
 * Route the prompt to a god based on detected domain keywords + stacks.
 *
 * The routing is intentionally simple — Apollo (the master planner) is
 * the default. The classifier only routes directly to a specialist god
 * when the prompt is unambiguous (e.g. "fix this Rust build error" →
 * Hephaestus).
 *
 * When in doubt, return 'apollo' — Apollo will interview the user (if
 * needed) and dispatch to the right specialist god. This preserves the
 * 80/20 fast-path: 80% of prompts go straight to Apollo with a single
 * DISPATCH line.
 */
function routeToGod(
  prompt: string,
  stacks: string[],
  files: string[],
): { god: GodId; domain: TaskClassification['domain'] } {
  const lower = prompt.toLowerCase();

  // Batch 12c (P5): an explicitly addressed god wins outright — the
  // caller named the acting agent; stacks and keywords must not override.
  const addressed = explicitGodAddress(prompt);
  if (addressed) return addressed;

  // Vault-curation triggers — Callimachus.
  if (/\b(compact brain|vault sync|instinct promote|instinct archive|brain backup|brain restore)\b/.test(lower)) {
    return { god: 'callimachus', domain: 'vault-curation' };
  }

  // Security keywords — Artemis.
  if (/\b(security|vulnerability|owasp|cve|pentest|sast|dast|secret|audit|compliance)\b/.test(lower)) {
    return { god: 'artemis', domain: 'security' };
  }

  // Frontend keywords + stacks — Athena.
  if (/\b(ui|ux|frontend|design|css|tailwind|component|accessibility|a11y|figma)\b/.test(lower) ||
      stacks.some(s => ['react', 'vue', 'svelte', 'angular'].includes(s))) {
    return { god: 'athena', domain: 'frontend' };
  }

  // Testing keywords — Dionysus.
  if (/\b(test|tdd|e2e|playwright|jest|vitest|coverage|qa)\b/.test(lower)) {
    return { god: 'dionysus', domain: 'testing' };
  }

  // Database keywords + stacks — Persephone.
  if (/\b(database|migration|schema|sql|table|index|query)\b/.test(lower) ||
      stacks.some(s => ['postgres', 'mysql', 'sqlite', 'redis'].includes(s))) {
    return { god: 'persephone', domain: 'database' };
  }

  // DevOps keywords + stacks — Prometheus.
  if (/\b(deploy|docker|kubernetes|k8s|terraform|ci\/cd|pipeline|sre|incident)\b/.test(lower) ||
      stacks.some(s => ['docker', 'kubernetes', 'terraform', 'ci_cd', 'aws'].includes(s))) {
    return { god: 'prometheus', domain: 'devops' };
  }

  // Integration keywords + stacks — Hermes.
  if (/\b(api|integration|webhook|mcp|provider|oauth|rest|graphql)\b/.test(lower) ||
      stacks.includes('graphql')) {
    return { god: 'hermes', domain: 'integrations' };
  }

  // Backend keywords + stacks — Hephaestus.
  if (/\b(backend|server|endpoint|handler|service|repository|api design)\b/.test(lower) ||
      stacks.some(s => ['python', 'rust', 'go', 'java', 'kotlin', 'cpp', 'php'].includes(s))) {
    return { god: 'hephaestus', domain: 'backend' };
  }

  // Planning keywords — Apollo (spec-interview path).
  if (/\b(plan|architect|design|spec|refactor|feature|roadmap)\b/.test(lower)) {
    return { god: 'apollo', domain: 'planning' };
  }

  // Default: Apollo (master planner).
  return { god: 'apollo', domain: 'planning' };
}

// ─── Complexity estimation ────────────────────────────────────────────────────

/**
 * Estimate the prompt's complexity. This drives the dynamic context
 * loader's token budget.
 *
 *   trivial       — greetings, simple questions ("hi", "what is X")
 *   simple        — single-file fix, small refactor
 *   moderate      — multi-file feature, integration work
 *   complex       — architectural change, new system, cross-cutting refactor
 *   architectural — full design + spec interview (rare; 5% of prompts)
 */
function estimateComplexity(
  prompt: string,
  stacks: string[],
  files: string[],
): { complexity: TaskClassification['complexity']; estimatedTokens: number; needsPlanning: boolean } {
  const lower = prompt.toLowerCase();
  const len = prompt.length;

  // Trivial — single-word or short greeting.
  if (len < 30 && /^(hi|hello|yo|hey|sup|thanks?|ok|done)\b/.test(lower.trim())) {
    return { complexity: 'trivial', estimatedTokens: 5000, needsPlanning: false };
  }

  // Architectural — explicit design / spec / refactor keywords.
  if (/\b(design|architect|spec|interview|from scratch|new system|rewrite|refactor (the|entire|whole))\b/.test(lower)) {
    return { complexity: 'architectural', estimatedTokens: 150000, needsPlanning: true };
  }

  // Complex — multiple files + multiple stacks + cross-cutting keywords.
  if (files.length >= 3 || stacks.length >= 3 ||
      /\b(migrate|integration|cross-cutting|end-to-end|full-stack|infrastructure)\b/.test(lower)) {
    return { complexity: 'complex', estimatedTokens: 150000, needsPlanning: true };
  }

  // Moderate — multiple files OR multiple stacks OR non-trivial length.
  if (files.length === 2 || stacks.length === 2 || len > 200) {
    return { complexity: 'moderate', estimatedTokens: 80000, needsPlanning: false };
  }

  // Simple — single file or short, focused prompt.
  return { complexity: 'simple', estimatedTokens: 30000, needsPlanning: false };
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Mint a unique classification id (issue #54): `cls_<ms-base36><rand>`.
 * Chronologically sortable, URL-safe, zero dependencies.
 */
function mintClassificationId(): string {
  return `cls_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Classify a user prompt. Pure function — no LLM call, no I/O.
 *
 * Returns a TaskClassification that the action/intake API routes pass to
 * the spawned OpenCode process via the OLYMPUS_TASK_CLASSIFICATION env var.
 */
export function classifyTask(prompt: string): TaskClassification {
  const stacks = detectStacks(prompt);
  const files = extractFilePaths(prompt);
  const { god, domain } = routeToGod(prompt, stacks, files);
  const { complexity, estimatedTokens, needsPlanning } = estimateComplexity(prompt, stacks, files);

  // needsArchive — true when the prompt references the vault or an archive
  // intake (e.g. "ingest this PR", "learn from this session").
  const needsArchive = /\b(ingest|archive|intake|learn from|seed vault)\b/.test(prompt.toLowerCase());

  const reason = `domain=${domain} complexity=${complexity} stacks=[${stacks.join(',')}] files=[${files.length}] planning=${needsPlanning}`;

  return {
    classificationId: mintClassificationId(),
    domain,
    complexity,
    stack: stacks,
    files,
    needsPlanning,
    needsArchive,
    estimatedTokens,
    routeTo: god,
    reason,
  };
}

/**
 * Serialize a TaskClassification to a compact JSON string for passing as
 * an env var. Whitespace is stripped to minimize the env-var payload size.
 */
export function serializeClassification(c: TaskClassification): string {
  return JSON.stringify(c);
}

// ─── #63: continuation-turn inheritance ─────────────────────────────────────

/**
 * Issue #63 (BATCH 13): turns inside a warm session inherit god / class /
 * budget from the session's prior classification, unless the user
 * explicitly redirects to another god or explicitly starts a new task.
 * Rationale (PetLove F3): the plain approval turn "Recomendação sua pode
 * seguir - nome PetLove" was freshly classified `devops · simple →
 * prometheus` — a follow-up answer misrouted to an unrelated god. Only the
 * warm-session dispatch preserved continuity; the classification layer must
 * too. Re-classification happens for cold sessions, explicit redirects,
 * and explicit new tasks ONLY.
 */

/** Explicit new-task markers (pt-BR + en). */
const NEW_TASK_RE =
  /\b(nova tarefa|novo projeto|new task|new project|come[çc]ando (um |a )?novo|starting (a )?new)\b/i;

/** Explicit free-text god redirect ("com a Athena", "with Hephaestus", "switch to Prometeus"…). */
const FREE_TEXT_REDIRECT_RE =
  /\b(?:com|para|with|to|switch to|fale (?:com|para)|v[áa] (?:para|com))\s+(?:a\s+|o\s+|as?\s+|os?\s+)?(apollo|artemis|athena[ns]?|atlas|calimaco|callimachus|dioniso|dionysus|hefest[ou]|hephaestus|hermes|persefone|persephone|promete[uo]|prometheus)\b/i;

export function isNewTaskMarker(prompt: string): boolean {
  return NEW_TASK_RE.test(prompt);
}

export function isFreeTextGodRedirect(prompt: string): boolean {
  return FREE_TEXT_REDIRECT_RE.test(prompt);
}

/**
 * Inherit a prior classification for a continuation turn: same god, class,
 * and budget; FRESH classificationId (the #54 join-key chain must stay
 * unique per classification event) + a provenance note in the reason.
 */
export function inheritClassification(prior: TaskClassification): TaskClassification {
  return {
    ...prior,
    classificationId: mintClassificationId(),
    reason: `inherited-from=${prior.classificationId} · ${prior.reason}`,
  };
}

/**
 * Classify one turn of a conversation with warm-session inheritance
 * (#63). `prior` is the session's last APPLIED classification (null on a
 * cold session). Decision table:
 *   - cold session (prior === null)              → fresh classifyTask
 *   - answer / context turns                     → inherit (structural
 *     continuations by definition)
 *   - prompt with a new-task marker             → fresh (explicit reset)
 *   - explicit redirect (structured godId=/god: per the 12c P5 precedence,
 *     or free-text "com Athena")                  → fresh
 *   - otherwise (warm prompt)                     → inherit
 */
export function classifyTurnWithInheritance(
  action: 'prompt' | 'answer' | 'context',
  text: string,
  prior: TaskClassification | null,
): TaskClassification {
  const promptText = action === 'answer'
    ? `[User answer to your question] ${text}`
    : action === 'context'
      ? `[Additional context from user] ${text}`
      : text;
  const structuredRedirect = explicitGodAddress(promptText) !== null;
  const freeTextRedirect = isFreeTextGodRedirect(promptText);
  const explicitNewTask = action === 'prompt' && isNewTaskMarker(text);
  if (!prior || structuredRedirect || freeTextRedirect || explicitNewTask) {
    return classifyTask(promptText);
  }
  return inheritClassification(prior);
}

/**
 * Parse a TaskClassification from an env var value. Returns null if the
 * value is missing or malformed (the dynamic loader falls back to loading
 * the full context in that case).
 */
export function parseClassification(s: string | undefined | null): TaskClassification | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    if (typeof o !== 'object' || o === null) return null;
    if (typeof o.domain !== 'string') return null;
    if (typeof o.complexity !== 'string') return null;
    if (!Array.isArray(o.stack)) return null;
    return o as TaskClassification;
  } catch {
    return null;
  }
}
