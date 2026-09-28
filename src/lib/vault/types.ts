/**
 * Olympus Vault Backend — Core Type Definitions
 * ===============================================
 *
 * Public types shared across the vault backend library. These types model
 * the on-disk vault: Markdown + YAML frontmatter + [[wikilinks]] + #tags +
 * - [ ] task checkboxes.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** POSIX-style relative path from the vault root, e.g. "01_Gods/Apollo/profile.md". */
export type RelPath = string;

/** A vault entry returned by `list()` / `stat()`. */
export interface VaultEntry {
  /** POSIX-style relative path from vault root. */
  path: string;
  /** Base filename, e.g. "profile.md". */
  name: string;
  /** 'file' or 'directory'. */
  type: 'file' | 'directory';
  /** Size in bytes (0 for directories). */
  size: number;
  /** Last-modified time. */
  modified: Date;
}

/** Options accepted by `VaultBackend.write()`. */
export interface WriteOpts {
  /** Acquire a file lock via file-lock-guard.js before writing. Default: true. */
  lock?: boolean;
  /** Create parent directories if missing. Default: true. */
  mkdirp?: boolean;
  /** God name to attribute the lock to (used in lock metadata). */
  god?: string;
}

/** Parsed Markdown file: frontmatter + body. */
export interface ParsedNote {
  /** Relative path. */
  path: string;
  /** Raw frontmatter object (or `{}` if none). */
  frontmatter: Record<string, unknown>;
  /** Raw YAML frontmatter text (or `''` if none). */
  frontmatterRaw: string;
  /** Body text (Markdown without the frontmatter fence). */
  body: string;
  /** First H1 title (or basename without .md if no H1). */
  title: string;
  /** All `#tag` occurrences found in the body. */
  tags: string[];
  /** All `[[wikilink]]` targets found in the body. */
  links: WikilinkRef[];
  /** All `- [ ]` / `- [x]` task checkboxes found in the body. */
  tasks: TaskRef[];
  /** Plain body text (markdown stripped) — used for FTS indexing. */
  bodyText: string;
  /** File size in bytes. */
  size: number;
  /** Last-modified time. */
  modified: Date;
}

/** A `[[wikilink]]` reference found in a note. */
export interface WikilinkRef {
  /** Raw target text inside the brackets, e.g. "Apollo" or "01_Gods/Apollo/profile". */
  target: string;
  /** Optional alias after `|`, e.g. `[[Apollo|the sun god]]` → "the sun god". */
  alias?: string;
  /** 0-based line number where the link appears. */
  line: number;
}

/** A `- [ ]` / `- [x]` checkbox found in a note. */
export interface TaskRef {
  /** 0-based line number. */
  line: number;
  /** Task text after the checkbox. */
  text: string;
  /** Checkbox status. */
  status: 'pending' | 'done' | 'cancelled' | 'in-progress';
}

/** Result row from a search query. */
export interface SearchResult {
  /** Relative note path. */
  path: string;
  /** Matched snippet (HTML-stripped, ~200 chars around the hit). */
  snippet: string;
  /** Relevance score (higher = more relevant). */
  score: number;
  /** Matched tags (for `searchByTag`). */
  tags?: string[];
}

/** Result of a DQL query — see `vault-query/executor.ts`. */
export interface QueryResult {
  /** Rows returned by the query (one row per matching note or group). */
  rows: Record<string, unknown>[];
  /** Original DQL query string. */
  query: string;
  /** Generated SQL (for debugging). */
  sql: string;
  /** Bind parameters used in the SQL. */
  params: unknown[];
  /** Query duration in milliseconds. */
  durationMs: number;
}

/** Lint finding severity. */
export type LintSeverity = 'error' | 'warning' | 'info';

/** A single lint finding. */
export interface LintFinding {
  /** Rule ID, e.g. "frontmatter-key-order". */
  rule: string;
  /** Severity. */
  severity: LintSeverity;
  /** Human-readable message. */
  message: string;
  /** 1-based line number (0 if file-level). */
  line: number;
  /** Auto-fixable? */
  fixable: boolean;
}

/** Result of running the linter on one file. */
export interface LintReport {
  path: string;
  errors: number;
  warnings: number;
  infos: number;
  findings: LintFinding[];
  /** Number of findings that were auto-fixed. */
  fixed: number;
  /** Resulting file content after auto-fixes (same as input if no fixes). */
  fixedContent?: string;
}

/** Result of running the linter over many files. */
export interface LintAllReport {
  filesChecked: number;
  errors: number;
  warnings: number;
  fixed: number;
  reports: LintReport[];
}

/** Macro context passed to template helpers and macro outputPath functions. */
export interface MacroContext {
  /** All variables provided by the caller. */
  vars: Record<string, string>;
  /** Current god (from `OLYMPUS_GOD` env or macro var). */
  god?: string;
  /** Current session ID (from `OLYMPUS_SESSION_ID` env or macro var). */
  sessionId?: string;
  /** Current plan version (from `OLYMPUS_PLAN_VERSION` env or macro var). */
  planVersion?: string;
  /** Current timestamp (ISO string). */
  now: string;
  /** Vault root absolute path. */
  vaultRoot: string;
}

/** A registered template macro. */
export interface Macro {
  /** Machine name, e.g. "new-plan". */
  name: string;
  /** Human label, e.g. "New Plan". */
  label: string;
  /** One-line description. */
  description: string;
  /** Template path inside the vault, e.g. "08_Templates/plan.md". */
  templatePath: string;
  /** Returns the output path (POSIX-style, relative to vault root). */
  outputPath: (ctx: MacroContext) => string;
  /** Required variables (caller must supply). */
  requiredVars: string[];
  /** Optional variables (caller may supply). */
  optionalVars: string[];
}

/** Result of applying a macro. */
export interface TemplateApplyResult {
  /** Output path (POSIX-style, relative to vault root). */
  path: string;
  /** Rendered content. */
  content: string;
  /** Size in bytes. */
  size: number;
}
