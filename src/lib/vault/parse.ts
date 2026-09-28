/**
 * Olympus Vault Backend — Note Parser
 * =====================================
 *
 * Extracts structure from a Markdown note: frontmatter, H1 title, body text,
 * `#tags`, `[[wikilinks]]`, and `- [ ]` task checkboxes.
 *
 * Implementation notes:
 * - Uses `gray-matter` for frontmatter (via `frontmatter.ts`).
 * - Uses regex for tags, wikilinks, tasks. The wikilink regex supports
 *   `[[Target]]`, `[[Target|Alias]]`, and `[[Target#Heading]]` forms.
 * - Does NOT depend on `remark-wiki-link` (last published Oct 2023 —
 *   considered abandoned per §11.2 of the build spec).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { parseFrontmatter } from './frontmatter';
import type { ParsedNote, TaskRef, WikilinkRef } from './types';

// `[[Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]`, `[[Target#Heading|Alias]]`
const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;
// `#tag` — but not inside code spans / URLs. Simple heuristic: must be at
// word boundary and not preceded by an alphanumeric or `&`.
const TAG_RE = /(^|[^\w&/])#([a-zA-Z][a-zA-Z0-9_-]*)/g;
// `- [ ]` / `- [x]` / `- [-]` / `- [>]` (Dataview-style)
const TASK_RE = /^(\s*[-*+]\s+)\[([ xX-])\]\s+(.+?)\s*$/gm;

/**
 * Strip Markdown formatting down to plain text for FTS indexing.
 * Conservative: keeps word boundaries, drops code fences, image syntax,
 * and link URLs.
 */
export function stripMarkdown(md: string): string {
  return md
    // Code fences ```...```
    .replace(/```[\s\S]*?```/g, ' ')
    // Inline code `...`
    .replace(/`[^`]+`/g, ' ')
    // Images ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // Links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Headers
    .replace(/^#{1,6}\s+/gm, '')
    // Bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Horizontal rules
    .replace(/^---+$/gm, ' ')
    // Blockquotes
    .replace(/^>\s+/gm, '')
    // List markers
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract all `[[wikilink]]` references from a Markdown body.
 * Returns one entry per occurrence (duplicates preserved).
 */
export function extractWikilinks(body: string): WikilinkRef[] {
  const out: WikilinkRef[] = [];
  // Pre-split by line for line numbers.
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;
    while ((match = WIKILINK_RE.exec(lines[i])) !== null) {
      const raw = match[1];
      let target = raw;
      let alias: string | undefined;
      const pipeIdx = raw.indexOf('|');
      if (pipeIdx >= 0) {
        target = raw.slice(0, pipeIdx);
        alias = raw.slice(pipeIdx + 1);
      }
      // Strip `#heading` from target.
      const hashIdx = target.indexOf('#');
      if (hashIdx >= 0) {
        target = target.slice(0, hashIdx);
      }
      target = target.trim();
      if (!target) continue;
      out.push({ target, alias, line: i });
    }
  }
  return out;
}

/**
 * Extract all `#tag` occurrences from a Markdown body.
 * Tags inside frontmatter are NOT extracted here (they're in frontmatter.tags).
 */
export function extractTags(body: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(body)) !== null) {
    tags.add(match[2]);
  }
  return Array.from(tags);
}

/**
 * Extract all `- [ ]` / `- [x]` task checkboxes from a Markdown body.
 */
export function extractTasks(body: string): TaskRef[] {
  const out: TaskRef[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^(\s*[-*+]\s+)\[([ xX-])\]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const mark = m[2].toLowerCase();
    const status: TaskRef['status'] =
      mark === 'x' ? 'done' :
      mark === '-' ? 'cancelled' :
      'pending';
    out.push({ line: i, text: m[3], status });
  }
  return out;
}

/** Extract the first H1 title from a Markdown body. */
function extractTitle(body: string, fallback: string): string {
  const m = /^#\s+(.+?)\s*$/m.exec(body);
  return m ? m[1].trim() : fallback;
}

/**
 * Parse a full Markdown note (frontmatter + body + structure).
 *
 * @param path Relative vault path (used for the fallback title).
 * @param content Raw Markdown string.
 * @param size File size in bytes (caller-provided for cheapness).
 * @param modified File mtime.
 */
export function parseNote(
  path: string,
  content: string,
  size: number,
  modified: Date,
): ParsedNote {
  const { frontmatter, body, frontmatterRaw } = parseFrontmatter(content);
  const fallbackTitle = path.split('/').pop()?.replace(/\.md$/i, '') || path;
  const title = extractTitle(body, fallbackTitle);
  const tags = extractTags(body);
  const links = extractWikilinks(body);
  const tasks = extractTasks(body);
  const bodyText = stripMarkdown(body);
  // Also merge frontmatter `tags:` array into the tags list.
  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) {
      if (typeof t === 'string') {
        const cleaned = t.replace(/^#/, '').trim();
        if (cleaned && !tags.includes(cleaned)) tags.push(cleaned);
      }
    }
  }
  return {
    path,
    frontmatter,
    frontmatterRaw,
    body,
    title,
    tags,
    links,
    tasks,
    bodyText,
    size,
    modified,
  };
}
