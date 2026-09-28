/**
 * Olympus Vault Lint — Runner
 * =============================
 *
 * Orchestrates lint runs over one file or the whole vault. The runner
 * parses the file, runs each rule, applies auto-fixes (if requested),
 * writes the fixed file back, and returns a structured report.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { parseNote } from '../vault/parse';
import { parseFrontmatter, sortFrontmatterKeys } from '../vault/frontmatter';
import type { VaultBackend } from '../vault/backend';
import type { VaultIndex } from '../vault-index/indexer';
import type { LintAllReport, LintFinding, LintReport, ParsedNote } from '../vault/types';
import { ALL_RULES, DEFAULT_MAX_NOTE_BYTES, type LintRule, type RuleContext } from './rules';

function countBySeverity(findings: LintFinding[]): { errors: number; warnings: number; infos: number } {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const f of findings) {
    if (f.severity === 'error') errors++;
    else if (f.severity === 'warning') warnings++;
    else infos++;
  }
  return { errors, warnings, infos };
}

/**
 * Lint a single note. If `autoFix` is true, writes the fixed content back
 * to disk (via `VaultBackend.write` with lock acquired).
 */
export async function lintNote(
  backend: VaultBackend,
  relPath: string,
  autoFix: boolean = false,
  index: VaultIndex | null = null,
  rules: LintRule[] = ALL_RULES,
): Promise<LintReport> {
  let buf: Buffer | null;
  try {
    buf = await backend.readIfExists(relPath);
  } catch (err) {
    return {
      path: relPath,
      errors: 1,
      warnings: 0,
      infos: 0,
      findings: [
        {
          rule: 'read-error',
          severity: 'error',
          message: `Failed to read file: ${(err as Error).message}`,
          line: 0,
          fixable: false,
        },
      ],
      fixed: 0,
    };
  }
  if (!buf) {
    return {
      path: relPath,
      errors: 1,
      warnings: 0,
      infos: 0,
      findings: [
        {
          rule: 'missing-file',
          severity: 'error',
          message: 'File does not exist',
          line: 0,
          fixable: false,
        },
      ],
      fixed: 0,
    };
  }
  const content = buf.toString('utf-8');
  const stat = await backend.stat(relPath);
  const parsed = parseNote(relPath, content, buf.length, stat?.modified ?? new Date());
  const ctx: RuleContext = { index, maxNoteBytes: DEFAULT_MAX_NOTE_BYTES };
  const findings: LintFinding[] = [];
  let currentContent = content;
  let fixed = 0;
  for (const rule of rules) {
    const result = rule.run(parsed, currentContent, ctx);
    for (const f of result.findings) {
      findings.push({
        rule: f.rule,
        severity: f.severity,
        message: f.message,
        line: f.line,
        fixable: f.fixable,
      });
    }
    if (autoFix && result.fixedContent && result.fixedContent !== currentContent) {
      currentContent = result.fixedContent;
      fixed += result.findings.length;
    }
  }
  if (autoFix && currentContent !== content) {
    try {
      await backend.write(relPath, currentContent, { lock: true });
    } catch (err) {
      // Don't fail the whole lint — just add a finding.
      findings.push({
        rule: 'fix-write-error',
        severity: 'warning',
        message: `Auto-fix could not be written: ${(err as Error).message}`,
        line: 0,
        fixable: false,
      });
    }
  }
  const counts = countBySeverity(findings);
  return {
    path: relPath,
    errors: counts.errors,
    warnings: counts.warnings,
    infos: counts.infos,
    findings,
    fixed,
    fixedContent: autoFix && currentContent !== content ? currentContent : undefined,
  };
}

/**
 * Lint every `.md` file under a directory (or the whole vault). Auto-fix
 * is opt-in. Returns one report per file.
 */
export async function lintVault(
  backend: VaultBackend,
  dir: string = '.',
  autoFix: boolean = false,
  index: VaultIndex | null = null,
  rules: LintRule[] = ALL_RULES,
): Promise<LintAllReport> {
  const entries = await backend.listRecursive(dir);
  const mdFiles = entries.filter((e) => e.type === 'file' && e.name.endsWith('.md'));
  const reports: LintReport[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFixed = 0;
  for (const entry of mdFiles) {
    const report = await lintNote(backend, entry.path, autoFix, index, rules);
    reports.push(report);
    totalErrors += report.errors;
    totalWarnings += report.warnings;
    totalFixed += report.fixed;
  }
  return {
    filesChecked: mdFiles.length,
    errors: totalErrors,
    warnings: totalWarnings,
    fixed: totalFixed,
    reports,
  };
}

/** Re-export for tests. */
export { parseFrontmatter, sortFrontmatterKeys, parseNote };
export type { ParsedNote };
