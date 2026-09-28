/**
 * Olympus Vault Lint — Folder-Scoped Frontmatter Schemas
 * ========================================================
 *
 * Zod schemas keyed by glob pattern. The linter walks the list, finds the
 * first matching pattern for a given path, and validates the file's
 * frontmatter against that schema.
 *
 * Schemas are defined in code (not in the vault) because they're backend
 * logic — the same way a database schema lives in migrations, not in
 * application data.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { z } from 'zod';

export interface SchemaEntry {
  /** Glob pattern, e.g. 02_Projects/<star><star>/plan.md */
  pattern: string;
  /** Zod schema for the frontmatter object. */
  schema: z.ZodType;
  /** Human-readable description of what this schema enforces. */
  description: string;
}

/**
 * Convert a glob pattern to a RegExp for matching.
 * Supports `*` (single segment) and `**` (multi-segment).
 */
export function globToRegex(glob: string): RegExp {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 2;
        // Consume trailing slash
        if (glob[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp('^' + re + '$');
}

/** The canonical Olympus vault schemas. */
export const SCHEMAS: SchemaEntry[] = [
  {
    pattern: '02_Projects/**/plan.md',
    description: 'Project plan files require plan_version, project_slug, status, created, last_active.',
    schema: z.object({
      up: z.string().optional(),
      type: z.literal('plan').or(z.string()).optional(),
      plan_version: z.string().regex(/^v\d+$/, 'plan_version must match vN (e.g. v1, v2)'),
      project_slug: z.string().min(1),
      status: z.enum(['draft', 'active', 'paused', 'done']),
      created: z.union([z.string(), z.date()]),
      last_active: z.union([z.string(), z.date()]),
      gods: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }).passthrough(),
  },
  {
    pattern: '01_Gods/*/profile.md',
    description: 'God profile files require god, glyph, domain, caveman, army_size, router.',
    schema: z.object({
      up: z.string().optional(),
      type: z.literal('profile').or(z.string()).optional(),
      god: z.string().min(1),
      glyph: z.string().min(1),
      domain: z.string().min(1),
      agent: z.string().min(1),
      model: z.string().optional(),
      caveman: z.enum(['never', 'lite', 'full']),
      army_size: z.number().int().positive(),
      routes_to: z.string(),
      invoked_first: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      created: z.union([z.string(), z.date()]).optional(),
      updated: z.union([z.string(), z.date()]).optional(),
    }).passthrough(),
  },
  {
    pattern: '05_Auto_Learning/instincts/**',
    description: 'Instinct files require the 25-field canonical schema (see rules/common/instinct-lifecycle.md). Key fields: agent, selection_type, scope, seed, seed_confidence, empirical_confidence, samples, success_rate, trigger, last_used.',
    schema: z.object({
      // Identity
      type: z.literal('instinct').or(z.string()).optional(),
      agent: z.string().min(1, 'agent is required (god name)'),
      selection_type: z.enum(['skill', 'agent'], { message: 'selection_type must be "skill" or "agent"' }),
      scope: z.enum(['global', 'stack'], { message: 'scope must be "global" or "stack"' }),
      seed: z.boolean(),

      // Confidence (split — see rules/common/instinct-lifecycle.md)
      seed_confidence: z.number().min(0, 'seed_confidence must be >= 0').max(1, 'seed_confidence must be 0.0–1.0 (author confidence, does NOT short-circuit)'),
      empirical_confidence: z.number().min(0, 'empirical_confidence must be >= 0').max(1, 'empirical_confidence must be 0.0–1.0 (measured success rate, DOES short-circuit at >=0.85)'),
      samples: z.number().int().nonnegative('samples must be non-negative integer (0 for new seeds)'),
      success_rate: z.number().min(0, 'success_rate must be >= 0').max(1, 'success_rate must be 0.0–1.0 (successes / samples)'),

      // Context
      stacks: z.array(z.string()),
      projects: z.array(z.string()),

      // Lifecycle
      pinned: z.boolean(),
      deprecated: z.boolean().optional().default(false),
      created: z.union([z.string(), z.date()]),
      updated: z.union([z.string(), z.date()]),
      last_used: z.union([z.string(), z.date()]),

      // Recommendations (at least one must be non-empty depending on selection_type)
      recommended_skills: z.array(z.string()).optional().default([]),
      recommended_agents: z.array(z.string()).optional().default([]),

      // Vault graph
      up: z.string().optional(),
      down: z.array(z.any()).optional().default([]),
      depends_on: z.array(z.any()).optional().default([]),
      aliases: z.array(z.string()).optional().default([]),
      tags: z.array(z.string()),

      // Trigger
      trigger: z.object({
        keywords: z.array(z.string()).min(1, 'trigger.keywords must have at least 1 keyword'),
        min_matches: z.number().int().positive('trigger.min_matches must be positive integer (typically 2)'),
      }),

      // Legacy field: confidence (old schema, for backward compat — not required)
      confidence: z.number().min(0).max(1).optional(),
    }).passthrough(),
  },
  {
    pattern: '02_Projects/**/_delegations/inbox/*.md',
    description: 'Delegation envelopes require envelope_id, from_god, to_god, task, plan_version, dispatched_at.',
    schema: z.object({
      type: z.literal('delegation').or(z.string()).optional(),
      envelope_id: z.string().min(1),
      from_god: z.string().min(1),
      to_god: z.string().min(1),
      task: z.string().min(1),
      plan_version: z.string().regex(/^v\d+$/),
      dispatched_at: z.union([z.string(), z.date()]),
      deadline: z.union([z.string(), z.date()]).optional(),
      status: z.enum(['pending', 'accepted', 'in_progress', 'done', 'blocked']).optional(),
    }).passthrough(),
  },
  {
    pattern: '02_Projects/**/decisions/adr-*.md',
    description: 'ADR files require number, title, status, date, deciders.',
    schema: z.object({
      type: z.literal('adr').or(z.string()).optional(),
      number: z.union([z.string(), z.number().int()]),
      title: z.string().min(1),
      status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']),
      date: z.union([z.string(), z.date()]),
      deciders: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }).passthrough(),
  },
  {
    pattern: '08_Templates/**',
    description: 'Templates require type=template, template_type, tags.',
    schema: z.object({
      up: z.string().optional(),
      type: z.literal('template'),
      template_type: z.string().min(1),
      tags: z.array(z.string()),
    }).passthrough(),
  },
  {
    pattern: '06_Activity_Feed/live.jsonl',
    description: 'Live activity feed is append-only — no schema enforced.',
    schema: z.object({}).passthrough(),
  },
];

/**
 * Find the schema for a given path. Returns `null` if no pattern matches.
 */
export function findSchemaForPath(relPath: string): SchemaEntry | null {
  for (const entry of SCHEMAS) {
    const re = globToRegex(entry.pattern);
    if (re.test(relPath)) return entry;
  }
  return null;
}

/** Validate frontmatter against the schema for this path. Returns zod-formatted errors. */
export function validateFrontmatter(
  relPath: string,
  frontmatter: Record<string, unknown>,
): { ok: boolean; errors: { path: string; message: string }[] } {
  const entry = findSchemaForPath(relPath);
  if (!entry) return { ok: true, errors: [] };
  const result = entry.schema.safeParse(frontmatter);
  if (result.success) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((iss) => ({
      path: iss.path.join('.'),
      message: iss.message,
    })),
  };
}
