/**
 * Olympus Vault Backend — Frontmatter Utilities
 * ===============================================
 *
 * Thin wrapper around `gray-matter` for parsing and serializing
 * YAML frontmatter. Provides:
 *
 * - `parseFrontmatter(content)` — returns `{ frontmatter, body, frontmatterRaw }`
 * - `stringifyFrontmatter(body, frontmatter)` — round-trips safely
 * - `mergeFrontmatter(content, updates)` — merge `updates` into existing fm
 * - `sortFrontmatterKeys(content)` — auto-fix: alphabetical key order
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import matter from 'gray-matter';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

export interface ParsedFrontmatter {
  /** Parsed frontmatter object (or `{}` if no frontmatter block). */
  frontmatter: Record<string, unknown>;
  /** Body content (Markdown without the frontmatter fence). */
  body: string;
  /** Raw YAML text (or `''` if no frontmatter block). */
  frontmatterRaw: string;
}

/** Regular frontmatter delimiter: `---\n...\n---`. */
const FRONTMATTER_FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse a Markdown string into frontmatter + body.
 * Uses `gray-matter` for the heavy lifting, with the `yaml` package as
 * the underlying parser (better error messages than js-yaml).
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  // Fast path: no frontmatter
  if (!FRONTMATTER_FENCE.test(content)) {
    return { frontmatter: {}, body: content, frontmatterRaw: '' };
  }
  // gray-matter handles edge cases (CRLF, BOM, excerpts). We pass `yaml`
  // as the engine so error messages point at the YAML line.
  const parsed = matter(content, {
    engines: {
      yaml: {
        parse: (s: string) => yamlParse(s) || {},
        stringify: (obj: unknown) => yamlStringify(obj, { sortMapEntries: false }),
      },
    },
  });
  return {
    frontmatter: (parsed.data || {}) as Record<string, unknown>,
    body: parsed.content,
    frontmatterRaw: parsed.matter ? parsed.matter.replace(/^---\r?\n/, '').replace(/\r?\n---\r?\n?$/, '') : '',
  };
}

/**
 * Serialize frontmatter + body back into a single Markdown string.
 * Empty frontmatter → no fence.
 */
export function stringifyFrontmatter(
  body: string,
  frontmatter: Record<string, unknown>,
): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return body;
  }
  const yamlText = yamlStringify(frontmatter, {
    sortMapEntries: false,
    lineWidth: 100,
    defaultStringType: 'PLAIN',
  });
  // Trim trailing newline from YAML so we produce exactly one blank line
  // between the closing fence and the body.
  const trimmedYaml = yamlText.replace(/\n+$/, '');
  return `---\n${trimmedYaml}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`;
}

/**
 * Merge `updates` into the frontmatter of an existing Markdown string.
 * Body is preserved byte-for-byte.
 */
export function mergeFrontmatter(
  content: string,
  updates: Record<string, unknown>,
): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const merged: Record<string, unknown> = { ...frontmatter, ...updates };
  // Drop `undefined` values so callers can delete keys by setting them to undefined.
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined) delete merged[k];
  }
  return stringifyFrontmatter(body, merged);
}

/**
 * Auto-fix: sort frontmatter keys alphabetically. Body preserved.
 * Returns the new content. If frontmatter is empty or already sorted,
 * the input is returned unchanged.
 */
export function sortFrontmatterKeys(content: string): string {
  const { frontmatter, body, frontmatterRaw } = parseFrontmatter(content);
  if (Object.keys(frontmatter).length === 0) return content;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(frontmatter).sort()) {
    sorted[k] = frontmatter[k];
  }
  const result = stringifyFrontmatter(body, sorted);
  // Avoid rewrite if nothing changed.
  return result === content ? content : result;
}

/**
 * Read a single frontmatter value by key. Returns `undefined` if missing.
 */
export function getFrontmatterKey(
  content: string,
  key: string,
): unknown {
  const { frontmatter } = parseFrontmatter(content);
  return frontmatter[key];
}

/**
 * Check whether a string has frontmatter.
 */
export function hasFrontmatter(content: string): boolean {
  return FRONTMATTER_FENCE.test(content);
}
