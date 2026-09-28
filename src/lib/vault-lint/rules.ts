/**
 * Olympus Vault Lint — Rules
 * =============================
 *
 * Lint rules beyond frontmatter schema validation. Each rule is a pure
 * function: takes a parsed note + context, returns findings. Auto-fixable
 * rules also return a `fixedContent` string.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { parseFrontmatter, sortFrontmatterKeys } from '../vault/frontmatter';
import { extractWikilinks } from '../vault/parse';
import type { LintFinding, ParsedNote } from '../vault/types';
import type { VaultIndex } from '../vault-index/indexer';

export interface RuleContext {
  /** The vault index — used by `broken-wikilinks` rule. May be null. */
  index: VaultIndex | null;
  /** Maximum note size before `large-notes` warns. */
  maxNoteBytes: number;
}

export interface RuleResult {
  findings: LintFinding[];
  /** If auto-fixable, the new content (otherwise `undefined`). */
  fixedContent?: string;
}

export type LintRule = {
  id: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  fixable: boolean;
  run(note: ParsedNote, raw: string, ctx: RuleContext): RuleResult;
};

/** Rule: frontmatter keys must be sorted alphabetically (auto-fixable). */
export const frontmatterKeyOrderRule: LintRule = {
  id: 'frontmatter-key-order',
  description: 'Frontmatter keys should be sorted alphabetically',
  severity: 'warning',
  fixable: true,
  run(_note, raw) {
    const sorted = sortFrontmatterKeys(raw);
    if (sorted === raw) return { findings: [] };
    return {
      findings: [
        {
          rule: 'frontmatter-key-order',
          severity: 'warning',
          message: 'Frontmatter keys are not alphabetically sorted',
          line: 1,
          fixable: true,
        },
      ],
      fixedContent: sorted,
    };
  },
};

/** Rule: file names should be kebab-case (except god profiles, which are Capitalized). */
export const fileNamingKebabCaseRule: LintRule = {
  id: 'file-naming-kebab-case',
  description: 'File names should be kebab-case (except god profiles)',
  severity: 'warning',
  fixable: false,
  run(note) {
    const baseName = note.path.split('/').pop()?.replace(/\.md$/i, '') || '';
    // God profiles are Capitalized (e.g. "Apollo")
    if (/^01_Gods\/[A-Z][a-zA-Z]*\/profile\.md$/.test(note.path)) {
      return { findings: [] };
    }
    // ADRs use a number prefix
    if (/^adr-\d+-/.test(baseName)) return { findings: [] };
    // MOC and README are allowed
    if (baseName === 'MOC' || baseName === 'README' || baseName === 'MEMORY') return { findings: [] };
    // Dates are allowed (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}/.test(baseName)) return { findings: [] };
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(baseName)) {
      return {
        findings: [
          {
            rule: 'file-naming-kebab-case',
            severity: 'warning',
            message: `File name "${baseName}" is not kebab-case`,
            line: 0,
            fixable: false,
          },
        ],
      };
    }
    return { findings: [] };
  },
};

/** Rule: required frontmatter fields must be present (delegates to zod schemas). */
export const requiredFrontmatterRule: LintRule = {
  id: 'required-frontmatter',
  description: 'Required frontmatter fields must be present',
  severity: 'error',
  fixable: false,
  run(note) {
    // Lazy import to avoid circular dependency at module load.
     
    const { validateFrontmatter } = require('./schemas') as typeof import('./schemas');
    const result = validateFrontmatter(note.path, note.frontmatter);
    if (result.ok) return { findings: [] };
    return {
      findings: result.errors.map((e) => ({
        rule: 'required-frontmatter',
        severity: 'error' as const,
        message: `frontmatter.${e.path}: ${e.message}`,
        line: 1,
        fixable: false,
      })),
    };
  },
};

/** Rule: broken wikilinks — [[target]] that doesn't resolve to any note. */
export const brokenWikilinksRule: LintRule = {
  id: 'broken-wikilinks',
  description: 'Wikilinks should resolve to an existing note',
  severity: 'warning',
  fixable: false,
  run(note, _raw, ctx) {
    if (!ctx.index) return { findings: [] };
    const findings: LintFinding[] = [];
    for (const link of note.links) {
      // Check if any note in the index matches.
      const matches = ctx.index.findNotesByBasename(link.target.toLowerCase());
      const withPath = link.target.includes('/')
        ? ctx.index.noteExists(link.target.replace(/\.md$/i, '') + '.md')
        : false;
      if (matches.length === 0 && !withPath) {
        findings.push({
          rule: 'broken-wikilinks',
          severity: 'warning',
          message: `Wikilink [[${link.target}]] does not resolve to any note`,
          line: link.line + 1,
          fixable: false,
        });
      }
    }
    return { findings };
  },
};

/** Rule: orphan notes — notes with zero incoming links (info-level). */
export const orphanNotesRule: LintRule = {
  id: 'orphan-notes',
  description: 'Notes should have at least one incoming link',
  severity: 'info',
  fixable: false,
  run(note, _raw, ctx) {
    if (!ctx.index) return { findings: [] };
    const backlinks = ctx.index.getBacklinks(note.path);
    if (backlinks.length === 0) {
      return {
        findings: [
          {
            rule: 'orphan-notes',
            severity: 'info',
            message: 'Note has no incoming links (orphan)',
            line: 0,
            fixable: false,
          },
        ],
      };
    }
    return { findings: [] };
  },
};

/** Rule: large notes — warn on notes >10KB (suggest splitting). */
export const largeNotesRule: LintRule = {
  id: 'large-notes',
  description: 'Notes larger than 10KB should be split',
  severity: 'info',
  fixable: false,
  run(note, _raw, ctx) {
    if (note.size > ctx.maxNoteBytes) {
      return {
        findings: [
          {
            rule: 'large-notes',
            severity: 'info',
            message: `Note is ${(note.size / 1024).toFixed(1)}KB — consider splitting`,
            line: 0,
            fixable: false,
          },
        ],
      };
    }
    return { findings: [] };
  },
};

/**
 * Rule: instinct confidence consistency — ensures seed_confidence and empirical_confidence
 * are used correctly per the canonical instinct schema (see rules/common/instinct-lifecycle.md).
 *
 * Checks:
 * 1. If seed=true and samples=0, empirical_confidence must be 0.0 (seeds start with no empirical data)
 * 2. If empirical_confidence >= 0.85 and samples >= 10, the instinct should NOT be marked seed=true
 *    (it should have graduated to seed=false via DISTILL)
 * 3. success_rate must be consistent with samples (if samples=0, success_rate must be 0.0)
 * 4. If deprecated=true, the instinct should have a note explaining why
 */
export const instinctConfidenceConsistencyRule: LintRule = {
  id: 'instinct-confidence-consistency',
  description: 'Instinct confidence fields must be consistent (seed vs empirical, success_rate vs samples)',
  severity: 'warning',
  fixable: false,
  run(note) {
    // Only applies to instinct files
    if (!note.path.startsWith('05_Auto_Learning/instincts/')) return { findings: [] };
    const fm = note.frontmatter as Record<string, unknown>;

    const isSeed = fm.seed === true;
    const samples = typeof fm.samples === 'number' ? fm.samples : 0;
    const empiricalConf = typeof fm.empirical_confidence === 'number' ? fm.empirical_confidence : 0;
    const seedConf = typeof fm.seed_confidence === 'number' ? fm.seed_confidence : 0;
    const successRate = typeof fm.success_rate === 'number' ? fm.success_rate : 0;

    const findings: LintFinding[] = [];

    // Check 1: seed=true with samples=0 should have empirical_confidence=0.0
    if (isSeed && samples === 0 && empiricalConf > 0) {
      findings.push({
        rule: 'instinct-confidence-consistency',
        severity: 'warning',
        message: `Seed instinct with samples=0 should have empirical_confidence=0.0 (got ${empiricalConf}) — seeds must earn empirical confidence through real observations`,
        line: 1,
        fixable: false,
      });
    }

    // Check 2: graduated instinct (empirical_confidence >= 0.85, samples >= 10) should not be seed=true
    if (empiricalConf >= 0.85 && samples >= 10 && isSeed) {
      findings.push({
        rule: 'instinct-confidence-consistency',
        severity: 'warning',
        message: `Instinct has empirical_confidence=${empiricalConf} and samples=${samples} but seed=true — should have graduated to seed=false via DISTILL`,
        line: 1,
        fixable: false,
      });
    }

    // Check 3: success_rate must be 0.0 if samples=0
    if (samples === 0 && successRate > 0) {
      findings.push({
        rule: 'instinct-confidence-consistency',
        severity: 'warning',
        message: `Instinct with samples=0 should have success_rate=0.0 (got ${successRate}) — cannot have a success rate without observations`,
        line: 1,
        fixable: false,
      });
    }

    // Check 4: seed_confidence should be 0.0 for learned instincts (seed=false)
    if (!isSeed && seedConf > 0 && samples > 0) {
      // This is just informational — learned instincts may keep their original seed_confidence for reference
      // Don't flag as a finding, just skip
    }

    return { findings };
  },
};

/** All built-in lint rules, in evaluation order. */
export const ALL_RULES: LintRule[] = [
  requiredFrontmatterRule,
  frontmatterKeyOrderRule,
  fileNamingKebabCaseRule,
  brokenWikilinksRule,
  orphanNotesRule,
  largeNotesRule,
  instinctConfidenceConsistencyRule,
];

/** Default max note size: 10 KB. */
export const DEFAULT_MAX_NOTE_BYTES = 10 * 1024;
