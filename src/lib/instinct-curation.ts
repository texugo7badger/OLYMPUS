/**
 * instinct-curation.ts — v0.1.2: the deterministic half of Callimachus.
 *
 * The quick-circuit theory is only useful if a single project's convention
 * never becomes a global shortcut. This pass is cheap (no model):
 *   - synthetic smoke/hoplane projects are archived;
 *   - project-specific patterns stay project-scoped;
 *   - a quick circuit requires samples >= 2, confidence >= 0.90 AND evidence
 *     from at least two distinct non-synthetic projects.
 *
 * It returns what changed. Heartbeat uses it to decide whether a model pass is
 * worth any tokens at all.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { computeInstinctConfidence } from './learning/confidence';

export interface CurationResult {
  scanned: number;
  archived: number;
  /** Project-specific files whose scope/kind were corrected. */
  projectScoped: number;
  demoted: number;
  promoted: number;
  candidates: number;
  quickCircuits: number;
  /** v0.1.7 — project-scoped hints, never global shortcuts. */
  projectHints: number;
  changed: number;
}

const SYNTHETIC = /olympus-smoke|olympus-hoplane|lane-preflight|fixture-demo/i;
const PROJECT_SPECIFIC = /(^|\W)aime(\W|$)/i;

function field(text: string, key: string): string {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

function setField(text: string, key: string, value: string): string {
  if (new RegExp(`^${key}:\\s*.*$`, 'm').test(text)) {
    return text.replace(new RegExp(`^${key}:\\s*.*$`, 'm'), `${key}: ${value}`);
  }
  return text.replace('\n---\n', `\n${key}: ${value}\n---\n`);
}

export function curateInstincts(opts: { apply?: boolean } = {}): CurationResult {
  const apply = opts.apply === true;
  const root = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts');
  const result: CurationResult = { scanned: 0, archived: 0, projectScoped: 0, demoted: 0, promoted: 0, candidates: 0, quickCircuits: 0, projectHints: 0, changed: 0 };
  let gods: fs.Dirent[] = [];
  try { gods = fs.readdirSync(root, { withFileTypes: true }); } catch { return result; }
  for (const god of gods) {
    if (!god.isDirectory()) continue;
    const empirical = path.join(root, god.name, 'empirical');
    let files: string[] = [];
    try { files = fs.readdirSync(empirical).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const file of files) {
      const abs = path.join(empirical, file);
      let text = '';
      try { text = fs.readFileSync(abs, 'utf-8'); } catch { continue; }
      result.scanned++;
      const trigger = field(text, 'trigger');
      const projects = field(text, 'projects');
      const legacyConfidence = Number(field(text, 'confidence') || 0);
      const successes = field(text, 'successes');
      const failures = field(text, 'failures');
      const samples = field(text, 'samples');
      const counts = computeInstinctConfidence({
        successes: successes ? Number(successes) : undefined,
        failures: failures ? Number(failures) : undefined,
        samples: samples ? Number(samples) : undefined,
        legacyConfidence,
      });
      const confidence = counts.confidence || legacyConfidence;
      const quick = field(text, 'quick_circuit') === 'true';
      const synthetic = SYNTHETIC.test(`${trigger} ${projects} ${file}`);
      if (synthetic) {
        result.archived++;
        result.changed++;
        if (apply) {
          const archive = path.join(root, god.name, '_archive');
          fs.mkdirSync(archive, { recursive: true });
          try { fs.renameSync(abs, path.join(archive, file)); } catch { /* collision */ }
        }
        continue;
      }
      // Distinct non-synthetic projects are the proof for a global shortcut.
      const projectList = (projects.match(/["']([^"']+)["']/g) || []).map((s) => s.replace(/["']/g, '')).filter((p) => p && !SYNTHETIC.test(p));
      const distinctProjects = new Set(projectList).size;
      // AIME-only evidence is project memory. A pattern proven in AIME AND
      // another project is exactly the cross-project evidence we want.
      const aimeOnly = projectList.length > 0 && projectList.every((p) => p.toLowerCase() === 'aime');
      const projectSpecific = aimeOnly || (PROJECT_SPECIFIC.test(trigger) && distinctProjects < 2);
      // Global quick circuits must clear the ECC bar: 20+ samples, 90%+
      // success, and two distinct projects. A candidate is weaker evidence a
      // model pass may judge; it is never a shortcut.
      const proven = counts.samples >= 20 && counts.successRate >= 0.9 && confidence >= 0.82 && distinctProjects >= 2;
      // A project-scoped quick circuit is a hint, not a short-circuit. It
      // needs 5+ samples, 80%+ success and the ECC confidence floor.
      // v0.1.7 — a project-scoped pattern is a HINT, never a quick circuit.
      // Only cross-project proof (proven) earns `quick_circuit: true`.
      const projectHint = projectSpecific && counts.samples >= 5 && counts.successRate >= 0.8 && confidence >= 0.72;
      const shouldQuick = proven;
      const candidate = !projectSpecific && !proven && distinctProjects >= 2 && counts.samples >= 3 && confidence >= 0.5;
      if (projectSpecific && (field(text, 'scope') !== 'project' || field(text, 'kind') !== 'project')) {
        text = setField(text, 'scope', 'project');
        text = setField(text, 'kind', 'project');
        result.projectScoped++;
        result.changed++;
        if (apply) fs.writeFileSync(abs, text);
      }
      if (projectHint) {
        result.projectHints++;
        if (field(text, 'project_hint') !== 'true') {
          text = setField(text, 'project_hint', 'true');
          result.changed++;
        }
      }
      if (quick && !shouldQuick) {
        result.demoted++;
        result.changed++;
        if (apply) fs.writeFileSync(abs, setField(text, 'quick_circuit', 'false'));
      } else if (!quick && shouldQuick) {
        result.promoted++;
        result.changed++;
        if (apply) fs.writeFileSync(abs, setField(text, 'quick_circuit', 'true'));
      }
      if (shouldQuick) result.quickCircuits++;
      else if (candidate) result.candidates++;
    }
  }
  return result;
}
