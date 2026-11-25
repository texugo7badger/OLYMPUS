/**
 * learning.ts — v0.1.0: close the brain loop from a completed hop.
 *
 * The audit found 55 seed instincts, 3 empirical and 0 short-circuits: the
 * hop runtime wrote telemetry and walked away, so the god never learned a
 * reusable pattern from what it just proved. This module writes/updates one
 * empirical instinct per (project, hop, god) with:
 *   - explicit tags (hop id + artifact basenames + prompt keywords), so the
 *     instinct gate can match a future similar task;
 *   - samples/confidence that grow with repeated successes;
 *   - the verified artifacts/checks as evidence.
 *
 * It is deliberately deterministic and cheap: no model, no extra tokens.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from '@/lib/vault-root';

export interface HopLearningInput {
  slug: string;
  hop: string;
  god: string;
  artifacts?: string[] | null;
  checks?: string[] | null;
  promptExcerpt?: string | null;
  status: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  lane?: string | null;
  ts?: string;
}

export interface HopLearningResult {
  ok: boolean;
  path?: string;
  created?: boolean;
  confidence?: number;
  samples?: number;
  tags?: string[];
  error?: string;
}

function safeId(value: string): string {
  return String(value || 'hop').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'hop';
}

function yamlString(value: string): string {
  return JSON.stringify(String(value));
}

export function recordHopLearning(input: HopLearningInput): HopLearningResult {
  try {
    if (input.status !== 'completed') return { ok: false, error: 'only completed hops are learned' };
    const slug = String(input.slug || '').trim();
    const hop = String(input.hop || '').trim();
    const god = String(input.god || 'apollo').trim().toLowerCase();
    if (!slug || !hop) return { ok: false, error: 'slug and hop are required' };
    const artifacts = (input.artifacts || []).filter(Boolean).map(String);
    if (artifacts.length === 0) return { ok: false, error: 'no artifacts to prove the pattern' };

    const base = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts', god, 'empirical');
    const id = `${safeId(slug)}-${safeId(hop)}`;
    const file = path.join(base, `${id}.md`);
    let samples = 1;
    let confidence = 0.86;
    let created = true;
    try {
      const existing = fs.readFileSync(file, 'utf-8');
      const oldSamples = Number(/^samples:\s*(\d+)/m.exec(existing)?.[1] || 0);
      const oldConfidence = Number(/^confidence:\s*([0-9.]+)/m.exec(existing)?.[1] || 0);
      if (oldSamples > 0) {
        samples = oldSamples + 1;
        confidence = Math.min(0.95, Math.max(oldConfidence, 0.84 + samples * 0.03));
        created = false;
      }
    } catch { /* first success */ }

    const artifactTags = artifacts.map((a) => safeId(path.basename(a).replace(/\.[^.]+$/, '')));
    // v0.1.0 — TWO specific tags, both required by the gate (hits >= 2).
    // The hop id + the primary artifact are a strong repeat signal; a generic
    // keyword would create false positives and skip a legitimate turn.
    const tags = [...new Set([safeId(hop), artifactTags[0]].filter(Boolean))].slice(0, 2);
    const ts = input.ts && Number.isFinite(Date.parse(input.ts)) ? input.ts : new Date().toISOString();
    const trigger = `Hop ${hop} in ${slug}: ${String(input.promptExcerpt || '').replace(/\s+/g, ' ').slice(0, 240)}`;
    const action = `Reuse the verified ${god} pattern for ${hop}: write ${artifacts.join(', ')} and satisfy ${(input.checks || []).slice(0, 4).join('; ') || 'the declared checks'}. Keep the same structure; verify before reporting.`;
    const body = [
      `# ${id}`,
      '',
      `**Trigger:** ${trigger}`,
      '',
      `**Action:** ${action}`,
      '',
      `**Confidence:** ${confidence.toFixed(2)} (empirical, ${samples} successful sample${samples === 1 ? '' : 's'})`,
      '',
      `**Scope:** project (${slug}) · god ${god}`,
      '',
      `**Evidence:** ${artifacts.join(', ')}`,
      '',
      `**Tokens:** ${Number(input.tokensIn || 0)} in / ${Number(input.tokensOut || 0)} out · lane ${input.lane || 'unknown'}`,
      '',
    ].join('\n');

    const frontmatter = [
      '---',
      `god: ${yamlString(god)}`,
      `confidence: ${confidence.toFixed(2)}`,
      'scope: project',
      `projects: [${yamlString(slug)}]`,
      'stacks: []',
      `last_used: ${yamlString(ts)}`,
      `samples: ${samples}`,
      'source: empirical',
      `tags: [${tags.map(yamlString).join(', ')}]`,
      `trigger: ${yamlString(trigger)}`,
      `action: ${yamlString(action)}`,
      '---',
      '',
    ].join('\n');

    fs.mkdirSync(base, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, frontmatter + body, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return { ok: true, path: file, created, confidence, samples, tags };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
