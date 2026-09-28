/**
 * Olympus Vault Template — Macro Registry
 * ==========================================
 *
 * Built-in macros for common Olympus vault operations. Each macro declares
 * a template path, an output path generator, and required/optional vars.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { Macro, MacroContext } from '../vault/types';
import { randomUUID } from 'node:crypto';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function dateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function timestampStr(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export const MACROS: Macro[] = [
  {
    name: 'new-plan',
    label: 'New Plan',
    description: 'Create a new project plan from 08_Templates/plan.md',
    templatePath: '08_Templates/plan.md',
    outputPath: (ctx) => `02_Projects/${slugify(ctx.vars.projectSlug)}/plan.md`,
    requiredVars: ['projectSlug'],
    optionalVars: ['deadline', 'stack', 'goal'],
  },
  {
    name: 'new-delegation',
    label: 'New Delegation',
    description: 'Create a new delegation envelope in a project inbox',
    templatePath: '08_Templates/delegation.md',
    outputPath: (ctx) =>
      `02_Projects/${slugify(ctx.vars.projectSlug)}/_delegations/inbox/${timestampStr()}-${slugify(ctx.vars.toGod || 'god')}.md`,
    requiredVars: ['projectSlug', 'toGod'],
    optionalVars: ['fromGod', 'task', 'deadline'],
  },
  {
    name: 'new-adr',
    label: 'New ADR',
    description: 'Create a new Architecture Decision Record',
    templatePath: '08_Templates/adr.md',
    outputPath: (ctx) => {
      const n = ctx.vars.number || '001';
      return `02_Projects/${slugify(ctx.vars.projectSlug)}/decisions/adr-${n}-${slugify(ctx.vars.title || 'decision')}.md`;
    },
    requiredVars: ['projectSlug', 'title'],
    optionalVars: ['number', 'status', 'deciders'],
  },
  {
    name: 'new-instinct',
    label: 'New Instinct',
    description: 'Create a new auto-learning instinct for a god',
    templatePath: '08_Templates/instinct.md',
    outputPath: (ctx) => {
      const god = slugify(ctx.vars.god || ctx.god || 'apollo');
      const type = slugify(ctx.vars.type || 'skill-selection');
      const pattern = slugify(ctx.vars.pattern || 'pattern');
      return `05_Auto_Learning/instincts/${god}/${type}/${pattern}.md`;
    },
    requiredVars: ['pattern'],
    optionalVars: ['god', 'type', 'confidence', 'samples', 'scope', 'trigger'],
  },
  {
    name: 'new-god-profile',
    label: 'New God Profile',
    description: 'Create a new god profile (advanced — usually only at install time)',
    templatePath: '08_Templates/god-profile.md',
    outputPath: (ctx) => `01_Gods/${ctx.vars.godName || 'NewGod'}/profile.md`,
    requiredVars: ['godName'],
    optionalVars: ['glyph', 'domain', 'caveman', 'armySize', 'routes_to'],
  },
  {
    name: 'new-skill',
    label: 'New Skill',
    description: 'Create a new skill page in the knowledge base',
    templatePath: '08_Templates/skill.md',
    outputPath: (ctx) => `04_Knowledge/skills/${slugify(ctx.vars.skillSlug)}.md`,
    requiredVars: ['skillSlug'],
    optionalVars: ['stack', 'category', 'difficulty'],
  },
  {
    name: 'new-session-summary',
    label: 'New Session Summary',
    description: 'Create a per-god daily session summary',
    templatePath: '08_Templates/session-summary.md',
    outputPath: (ctx) => {
      const god = ctx.vars.godName || (ctx.god ? ctx.god.charAt(0).toUpperCase() + ctx.god.slice(1) : 'Apollo');
      return `01_Gods/${god}/activity/${dateStr()}.md`;
    },
    requiredVars: [],
    optionalVars: ['godName', 'highlights', 'tokensUsed'],
  },
];
