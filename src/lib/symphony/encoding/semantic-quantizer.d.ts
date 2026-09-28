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
import type { IntentVector, ConstraintMatrix, SuccessPredicate } from '../core/protocol.js';
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
export declare function extractConstraints(text: string): ConstraintMatrix;
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
export declare function extractSuccessPredicates(text: string): SuccessPredicate[];
/**
 * Estimates numeric dimensions for the intent vector. These are heuristic
 * signals used by the Conductor to schedule parallel dispatch priority.
 *
 *  priority  : [0,1] — how urgent (keywords: "urgent", "asap", "now")
 *  risk      : [0,1] — how risky (keywords: "production", "deploy", "drop")
 *  complexity: [0,1] — rough complexity from text length and stack count
 *  novelty   : [0,1] — heuristic for how unusual the request is
 */
export declare function estimateDimensions(text: string, stackCount: number): Record<string, number>;
/**
 * The main entry point: given a free-text task payload, produce an
 * IntentVector — the semantic-quantized core of a VibrationalSignature.
 *
 *  payload  : the original text (a God's verbose markdown prompt)
 *  returns  : the factored IntentVector
 */
export declare function quantizeIntent(payload: string): IntentVector;
/**
 * Re-encode an IntentVector back into a short symbolic string, suitable
 * for log lines and cache keys.
 *
 *   "build|rust,postgres|scope:src/auth|p:0.30,r:0.20,c:0.15,n:0.30"
 */
export declare function symbolicForm(v: IntentVector): string;
