/**
 * design-contract.ts — v0.0.91: the interview becomes an artifact.
 *
 * The user's complaint was precise: Apollo planned while the design was still
 * undecided, so the walk discovered the missing decisions as parks and fix
 * loops. The contract fixes the order: inventory the pages, resolve the P0
 * unknowns with Apollo/Athena, name the design stops, and only then plan.
 *
 * This module is deliberately deterministic: the page map comes from the
 * filesystem, the validation is a pure function, and the studio/API write the
 * same JSON the planner reads. The model does the interview; the file is the
 * memory.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';

export type ContractMode = 'new' | 'refactor' | 'rescue';
export type Priority = 'P0' | 'P1' | 'P2';
export type PageStatus = 'pending' | 'decided';

export interface DesignPage {
  route: string;
  file: string;
  purpose?: string;
  keep?: string[];
  change?: string[];
  priority: Priority;
  status: PageStatus;
}

export interface DesignUnknown {
  id: string;
  page?: string;
  severity: Priority;
  question: string;
  owner: 'apollo' | 'athena' | 'user';
}

export interface DesignStop {
  id: string;
  page: string;
  requiresUserApproval: boolean;
  note?: string;
}

export interface DesignSignature {
  id: string;
  page: string;
  status: 'pending' | 'approved';
  variant?: string;
  approvalHash?: string;
}

export interface DesignContract {
  version: 1;
  project: string;
  mode: ContractMode;
  pages: DesignPage[];
  tokens: {
    palette?: string;
    type?: string;
    spacing?: string;
    radius?: string;
    motion?: string;
    density?: string;
  };
  signature: DesignSignature[];
  unknowns: DesignUnknown[];
  stops: DesignStop[];
  updatedAt: string;
}

export interface ContractValidation {
  ok: boolean;
  p0Unknowns: DesignUnknown[];
  pendingP0Pages: DesignPage[];
  stops: number;
  reasons: string[];
}

const PAGE_FILES = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'dist-electron', 'coverage', 'evidence', 'media', '.olympus']);

function walk(dir: string, base: string, out: string[]): void {
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, base, out);
    else if (entry.isFile() && PAGE_FILES.has(entry.name)) out.push(path.relative(base, abs));
  }
}

function routeFromFile(rel: string, root: string): string {
  let r = rel.replace(/\\/g, '/').replace(/\/?page\.(tsx|ts|jsx|js)$/, '');
  // src/app/page.tsx → /
  // src/app/home/page.tsx → /home
  r = r.replace(/^src\//, '').replace(/^app\//, '').replace(/^pages\//, '');
  r = r.split('/').filter((seg) => seg && !/^\(.*\)$/.test(seg)).join('/');
  return r ? `/${r}` : '/';
}

/** The routes the project actually serves, read from the filesystem. */
export function buildPageMap(laneRoot: string): Array<{ route: string; file: string }> {
  const roots = ['src/app', 'app', 'src/pages', 'pages'].filter((rel) => fs.existsSync(path.join(laneRoot, rel)));
  const found: Array<{ route: string; file: string }> = [];
  for (const root of roots) {
    const abs = path.join(laneRoot, root);
    const files: string[] = [];
    walk(abs, laneRoot, files);
    for (const file of files) found.push({ route: routeFromFile(file, root), file });
  }
  // A root page.tsx and an app/page.tsx can both map to '/'; keep the first.
  const seen = new Set<string>();
  return found.filter((p) => (seen.has(p.route) ? false : (seen.add(p.route), true)))
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function defaultContract(laneRoot: string, project: string, mode: ContractMode = 'refactor'): DesignContract {
  const pages = buildPageMap(laneRoot).map((p) => ({
    ...p,
    priority: (p.route === '/' ? 'P0' : 'P1') as Priority,
    status: 'pending' as PageStatus,
  }));
  return {
    version: 1,
    project,
    mode,
    pages,
    tokens: {},
    signature: [],
    unknowns: [],
    stops: pages.filter((p) => p.priority === 'P0').map((p) => ({
      id: `design-stop-${p.route === '/' ? 'home' : p.route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`,
      page: p.route,
      requiresUserApproval: true,
      note: 'Signature surface: the user approves the direction before the build.',
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function contractPath(laneRoot: string): string {
  return path.join(laneRoot, 'design-contract.json');
}

export function readContract(laneRoot: string): DesignContract | null {
  try {
    const raw = JSON.parse(fs.readFileSync(contractPath(laneRoot), 'utf-8')) as DesignContract;
    if (raw?.version !== 1 || !Array.isArray(raw.pages)) return null;
    return raw;
  } catch { return null; }
}

export function writeContract(laneRoot: string, contract: DesignContract): DesignContract {
  const next: DesignContract = { ...contract, version: 1, updatedAt: new Date().toISOString() };
  fs.writeFileSync(contractPath(laneRoot), JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return next;
}

/** Strict: a P0 page or a P0 unknown blocks the plan. P1/P2 can be deferred. */
export function validateContract(contract: DesignContract | null): ContractValidation {
  if (!contract) {
    return { ok: false, p0Unknowns: [], pendingP0Pages: [], stops: 0, reasons: ['no design-contract.json'] };
  }
  const p0Unknowns = contract.unknowns.filter((u) => u.severity === 'P0');
  const pendingP0Pages = contract.pages.filter((p) => p.priority === 'P0' && p.status !== 'decided');
  const reasons: string[] = [];
  if (p0Unknowns.length) reasons.push(`${p0Unknowns.length} P0 unknown(s) unresolved`);
  if (pendingP0Pages.length) reasons.push(`${pendingP0Pages.length} P0 page(s) without a decision`);
  return { ok: reasons.length === 0, p0Unknowns, pendingP0Pages, stops: contract.stops.length, reasons };
}

/** The hops Apollo can append to the plan: one gate per design stop. */
export function designStopHops(contract: DesignContract): Array<Record<string, unknown>> {
  return contract.stops.map((stop) => ({
    id: `design-gate-${stop.id.replace(/^design-stop-/, '')}`,
    god: 'athena',
    kind: 'design-gate',
    prompt: `DESIGN GATE for page ${stop.page}. Review the live preview against the approved design contract (${contract.project}). Capture 1440x900 and 390x844, run scripts/extract-page-styles.mjs, and write design-review.json with scores/overall/issues/fixInstructions. The gate is 7. Do not edit components in this hop.`,
    artifacts: ['design-review.json'],
    budgetTokens: 4096,
    verify: { review: 'deterministic', checks: ['file-exists:design-review.json', 'design-score:7'] },
    requiresUserApproval: stop.requiresUserApproval,
  }));
}

/** A compact block for Apollo/Athena: decisions, unknowns, stops. */
export function contractPrompt(contract: DesignContract | null): string {
  if (!contract) return 'No design contract yet. Generate the page map and interview the user before planning.';
  const v = validateContract(contract);
  const lines = [
    `DESIGN CONTRACT — ${contract.project} (${contract.mode})`,
    `pages: ${contract.pages.length} (${contract.pages.filter((p) => p.status === 'decided').length} decided)`,
    `stops: ${contract.stops.map((s) => `${s.page}${s.requiresUserApproval ? ' (approval)' : ''}`).join(', ') || 'none'}`,
    `tokens: ${Object.entries(contract.tokens).filter(([, value]) => value).map(([k, value]) => `${k}=${value}`).join(' · ') || 'undecided'}`,
    `validation: ${v.ok ? 'READY' : 'BLOCKED — ' + v.reasons.join('; ')}`,
  ];
  const pending = contract.pages.filter((p) => p.status !== 'decided').slice(0, 8);
  if (pending.length) lines.push('pending pages: ' + pending.map((p) => `${p.route} (${p.priority})`).join(', '));
  const unknowns = contract.unknowns.slice(0, 8);
  if (unknowns.length) lines.push('unknowns: ' + unknowns.map((u) => `${u.severity} ${u.question}`).join(' | '));
  return lines.join('\n');
}
