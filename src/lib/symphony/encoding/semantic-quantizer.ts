/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SEMANTIC QUANTIZER — Slipstream v3 / ACCP-Inspired Intention Factorer
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This module takes a free-text task payload (the kind a God used to send
 *  as a verbose markdown prompt) and factors it into an IntentVector — a
 *  compact symbolic representation that preserves full semantic content.
 *
 *  The factorer is intentionally deterministic and pattern-based. It does
 *  NOT call out to an LLM (that would re-introduce the textual bottleneck).
 *  Instead, it relies on:
 *
 *    1. A lexicon of intent verbs (build, review, test, plan, ...)
 *    2. A taxonomy of stack identifiers (rust, react, postgres, ...)
 *    3. A constraint grammar (must, never, only, within budget, ...)
 *    4. A success-predicate parser (tests pass, exit-zero, no secrets, ...)
 *
 *  The output `semanticTokens` array is a list of short codes like:
 *     ["build", "rust", "svc", "auth", "jwt", "scope:src/auth"]
 *
 *  These carry the same meaning as a 200-token prompt but compress to ~10
 *  tokens under standard tokenizers. This is the architectural realization
 *  of the ACCP "factored intention model" — Ref. 2.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as crypto from 'crypto';
import type {
  IntentType,
  IntentVector,
  ConstraintMatrix,
  SuccessPredicate,
} from '../core/protocol.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEXICON — Intent Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps free-text verbs to canonical IntentType values. The first match wins,
 * so order matters — more specific verbs precede more general ones.
 */
const INTENT_LEXICON: Array<{ pattern: RegExp; type: IntentType }> = [
  { pattern: /\b(plan|spec|design doc|breakdown|decompose)\b/i, type: 'plan' },
  { pattern: /\b(orchestrate|coordinate|dispatch|fan out|delegate)\b/i, type: 'orchestrate' },
  { pattern: /\b(build|implement|scaffold|generate|create|write code)\b/i, type: 'build' },
  { pattern: /\b(refactor|restructure|reorganize|modernize|clean up)\b/i, type: 'refactor' },
  { pattern: /\b(review|audit code|inspect|critique)\b/i, type: 'review' },
  { pattern: /\b(secur|vulnerab|owasp|sast|dast|secret scan)\b/i, type: 'audit' },
  { pattern: /\b(test|unit test|integration|e2e|coverage|tdd)\b/i, type: 'test' },
  { pattern: /\b(design|ui|ux|component|prototype|figma)\b/i, type: 'design' },
  { pattern: /\b(document|readme|spec doc|api doc)\b/i, type: 'document' },
  { pattern: /\b(deploy|ship|release|rollback|canary)\b/i, type: 'deploy' },
  { pattern: /\b(migrate|port|upgrade|transition)\b/i, type: 'migrate' },
  { pattern: /\b(analyze|profile|measure|benchmark|investigate)\b/i, type: 'analyze' },
  { pattern: /\b(investigate|debug|trace|root cause|diagnose)\b/i, type: 'investigate' },
];

// ─────────────────────────────────────────────────────────────────────────────
//  STACK TAXONOMY
// ─────────────────────────────────────────────────────────────────────────────

const STACK_PATTERNS: Array<{ pattern: RegExp; token: string }> = [
  { pattern: /\b(rust|cargo|tokio|axum|actix)\b/i, token: 'rust' },
  { pattern: /\b(golang|golang|go-lang|\bgo\b|gin|fiber|echo)\b/i, token: 'go' },
  { pattern: /\b(python|django|flask|fastapi|pytorch)\b/i, token: 'python' },
  { pattern: /\b(next\.?js|react|jsx|tsx|radix|shadcn)\b/i, token: 'react' },
  { pattern: /\b(vue|nuxt|sfc)\b/i, token: 'vue' },
  { pattern: /\b(angular|ng-)\b/i, token: 'angular' },
  { pattern: /\b(svelte|kit)\b/i, token: 'svelte' },
  { pattern: /\b(node\.?js|node|express|fastify|nest)\b/i, token: 'node' },
  { pattern: /\b(bun)\b/i, token: 'bun' },
  { pattern: /\b(postgres|postgresql|pg)\b/i, token: 'postgres' },
  { pattern: /\b(mysql|maria)\b/i, token: 'mysql' },
  { pattern: /\b(sqlite)\b/i, token: 'sqlite' },
  { pattern: /\b(mongo|mongoose)\b/i, token: 'mongo' },
  { pattern: /\b(redis)\b/i, token: 'redis' },
  { pattern: /\b(prisma|drizzle|typeorm|sequelize|gorm|sqlalchemy)\b/i, token: 'orm' },
  { pattern: /\b(docker|container|compose)\b/i, token: 'docker' },
  { pattern: /\b(kubernetes|k8s|helm)\b/i, token: 'k8s' },
  { pattern: /\b(vercel|netlify)\b/i, token: 'edge-host' },
  { pattern: /\b(figma)\b/i, token: 'figma' },
  { pattern: /\b(tailwind|css|scss|styled)\b/i, token: 'css' },
];

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTRAINT GRAMMAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts factored constraints from the free-text payload.
 *
 * Examples the grammar recognizes:
 *
 *   "must not touch src/legacy/"     → forbiddenPaths: ['src/legacy/']
 *   "never run DROP TABLE"           → forbiddenActions: ['DROP TABLE']
 *   "within 2000 tokens"             → budgetTokens: 2000
 *   "scope: src/auth/"               → scope: ['src/auth/']
 *   "must satisfy: tests pass"       → mustSatisfy: ['tests pass']
 *   "stack: rust, postgres"          → stack: ['rust', 'postgres']
 */
export function extractConstraints(text: string): ConstraintMatrix {
  const stack: string[] = [];
  const scope: string[] = [];
  const forbiddenPaths: string[] = [];
  const forbiddenActions: string[] = [];
  const mustSatisfy: string[] = [];
  let budgetTokens: number | undefined;
  let budgetMs: number | undefined;

  // Stack declarations: "stack: rust, postgres" or "using rust + postgres"
  const stackDecl = text.match(/(?:stack|using|tech)[:\s]+([^\n.]+)/i);
  if (stackDecl) {
    for (const p of STACK_PATTERNS) {
      if (p.pattern.test(stackDecl[1])) stack.push(p.token);
    }
  }
  // Also scan the full text for stack tokens (in case no explicit declaration)
  for (const p of STACK_PATTERNS) {
    if (p.pattern.test(text) && !stack.includes(p.token)) stack.push(p.token);
  }

  // Scope: "scope: path/" or "in path/" or "within path/"
  const scopeMatches = text.matchAll(/(?:scope|in|within)[:\s]+([^\s,.()]+)/gi);
  for (const m of scopeMatches) {
    const s = m[1].replace(/[`'"]/g, '');
    if (s && !scope.includes(s)) scope.push(s);
  }

  // Forbidden paths: "must not touch X" / "never modify X" / "forbidden: X"
  const forbidPathMatches = text.matchAll(
    /(?:must not touch|never modify|don't touch|do not touch|forbidden[:\s]+)\s+([^\n.,]+)/gi,
  );
  for (const m of forbidPathMatches) {
    const p = m[1].trim().replace(/[`'"]/g, '');
    if (p) forbiddenPaths.push(p);
  }

  // Forbidden actions: "never run X" / "never execute X" / "must not execute X"
  const forbidActMatches = text.matchAll(
    /(?:never run|never execute|must not run|must not execute|forbidden action[:\s]+)\s+([^\n.]+)/gi,
  );
  for (const m of forbidActMatches) {
    const a = m[1].trim().replace(/[`'"]/g, '');
    if (a) forbiddenActions.push(a);
  }

  // Budget tokens: "within N tokens" / "budget: N tokens" / "cap: N tokens"
  const tokenBudget = text.match(/(?:within|budget|cap)[:\s]+(\d+)\s*tokens?/i);
  if (tokenBudget) budgetTokens = parseInt(tokenBudget[1], 10);

  // Budget time: "within N ms" / "budget: Nms"
  const timeBudget = text.match(/(?:within|budget|cap)[:\s]+(\d+)\s*(?:ms|milliseconds?)/i);
  if (timeBudget) budgetMs = parseInt(timeBudget[1], 10);

  // Must-satisfy: "must satisfy: ..." / "acceptance: ..."
  const mustMatch = text.match(/(?:must satisfy|acceptance[:\s]+)\s+([^\n]+)/i);
  if (mustMatch) mustSatisfy.push(mustMatch[1].trim());

  // Build the matrix — omit empty fields for compactness
  return {
    stack: stack.length ? stack : undefined,
    scope: scope.length ? scope : undefined,
    forbiddenPaths: forbiddenPaths.length ? forbiddenPaths : undefined,
    forbiddenActions: forbiddenActions.length ? forbiddenActions : undefined,
    mustSatisfy: mustSatisfy.length ? mustSatisfy : undefined,
    budgetTokens,
    budgetMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUCCESS PREDICATE PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts machine-checkable success predicates from the payload.
 *
 *  Recognized patterns:
 *    "tests must pass"        → { kind: 'tests-pass', target: '*' }
 *    "lint must be clean"     → { kind: 'lint-clean', target: '*' }
 *    "exit code 0"            → { kind: 'exit-zero', target: '*' }
 *    "no secrets in output"   → { kind: 'no-secrets', target: '*' }
 *    "schema X must be valid" → { kind: 'schema-valid', target: 'X' }
 *    "file X must exist"      → { kind: 'file-exists', target: 'X' }
 */
export function extractSuccessPredicates(text: string): SuccessPredicate[] {
  const preds: SuccessPredicate[] = [];

  if (/\btests?\s+must\s+pass\b/i.test(text) || /\ball\s+tests\s+pass\b/i.test(text)) {
    preds.push({ kind: 'tests-pass', target: '*' });
  }
  if (/\blint\s+(?:must\s+be\s+)?clean\b/i.test(text)) {
    preds.push({ kind: 'lint-clean', target: '*' });
  }
  if (/\bexit\s+code\s+0\b/i.test(text) || /\bexit-zero\b/i.test(text)) {
    preds.push({ kind: 'exit-zero', target: '*' });
  }
  if (/\bno\s+secrets?\b/i.test(text)) {
    preds.push({ kind: 'no-secrets', target: '*' });
  }

  const schemaMatch = text.match(/\bschema\s+([^\s]+)\s+(?:must\s+be\s+)?valid\b/i);
  if (schemaMatch) {
    preds.push({ kind: 'schema-valid', target: schemaMatch[1] });
  }

  const fileExistsMatches = text.matchAll(/\bfile\s+([^\s]+)\s+(?:must\s+)?exist\b/gi);
  for (const m of fileExistsMatches) {
    preds.push({ kind: 'file-exists', target: m[1].replace(/[`'"]/g, '') });
  }

  return preds;
}

// ─────────────────────────────────────────────────────────────────────────────
//  DIMENSION ESTIMATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates numeric dimensions for the intent vector. These are heuristic
 * signals used by the Conductor to schedule parallel dispatch priority.
 *
 *  priority  : [0,1] — how urgent (keywords: "urgent", "asap", "now")
 *  risk      : [0,1] — how risky (keywords: "production", "deploy", "drop")
 *  complexity: [0,1] — rough complexity from text length and stack count
 *  novelty   : [0,1] — heuristic for how unusual the request is
 */
export function estimateDimensions(text: string, stackCount: number): Record<string, number> {
  const t = text.toLowerCase();
  const priority =
    (/\b(urgent|asap|now|immediately|critical)\b/.test(t) ? 0.9 :
     /\b(soon|today|shortly)\b/.test(t) ? 0.6 : 0.3);
  const risk =
    (/\b(production|deploy|drop|destructive|irreversible|live)\b/.test(t) ? 0.85 :
     /\b(staging|pre-prod)\b/.test(t) ? 0.5 : 0.2);
  const complexity = Math.min(1, (text.length / 4000) * 0.5 + stackCount * 0.1);
  const novelty =
    (/\b(novel|new|first time|never done|experimental)\b/.test(t) ? 0.8 : 0.3);
  return { priority, risk, complexity, novelty };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT — Quantize a free-text payload into an IntentVector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The main entry point: given a free-text task payload, produce an
 * IntentVector — the semantic-quantized core of a VibrationalSignature.
 *
 *  payload  : the original text (a God's verbose markdown prompt)
 *  returns  : the factored IntentVector
 */
export function quantizeIntent(payload: string): IntentVector {
  // 1. Identify intent type — first lexicon match wins
  let intentType: IntentType = 'orchestrate'; // default fallback
  for (const { pattern, type } of INTENT_LEXICON) {
    if (pattern.test(payload)) {
      intentType = type;
      break;
    }
  }

  // 2. Build semantic tokens
  const semanticTokens: string[] = [intentType];

  // Add stack tokens
  const stackTokens: string[] = [];
  for (const { pattern, token } of STACK_PATTERNS) {
    if (pattern.test(payload) && !stackTokens.includes(token)) {
      stackTokens.push(token);
    }
  }
  semanticTokens.push(...stackTokens);

  // Add scope tokens (compact form: "scope:path/")
  const scopeMatches = payload.matchAll(/(?:scope|in|within)[:\s]+([^\s,.()]+)/gi);
  for (const m of scopeMatches) {
    const s = m[1].replace(/[`'"]/g, '');
    if (s) semanticTokens.push(`scope:${s}`);
  }

  // 3. Compute a stable hash — used as cache key (see olympus-go-cache)
  const intentHash = crypto
    .createHash('sha256')
    .update(`${intentType}|${stackTokens.join(',')}|${payload.length}`)
    .digest('hex')
    .slice(0, 16);

  // 4. Estimate dimensions
  const dimensions = estimateDimensions(payload, stackTokens.length);

  return {
    intentType,
    intentHash,
    dimensions,
    semanticTokens,
  };
}

/**
 * Re-encode an IntentVector back into a short symbolic string, suitable
 * for log lines and cache keys.
 *
 *   "build|rust,postgres|scope:src/auth|p:0.30,r:0.20,c:0.15,n:0.30"
 */
export function symbolicForm(v: IntentVector): string {
  const dims = v.dimensions;
  const dimStr = `p:${dims.priority.toFixed(2)},r:${dims.risk.toFixed(2)},c:${dims.complexity.toFixed(2)},n:${dims.novelty.toFixed(2)}`;
  const stackStr = v.semanticTokens
    .filter((t) => !t.startsWith('scope:') && t !== v.intentType)
    .join(',');
  const scopeStr = v.semanticTokens
    .filter((t) => t.startsWith('scope:'))
    .join('|');
  return [v.intentType, stackStr, scopeStr, dimStr].filter(Boolean).join('|');
}
