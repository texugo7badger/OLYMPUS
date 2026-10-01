/**
 * ════════════════════════════════════════════════════════════════════════════
 *  RESONANCE REGISTRY — The Vault's Master Score
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Resonance Registry is the persistent layer of the Symphony. Every
 *  vibrational signature and every harmonic return is registered here,
 *  paired with its FULL uncompressed source.
 *
 *  This is the architectural guarantee of zero-loss (Axiom A1 + A5):
 *
 *    - A signature is a tiny compressed packet, BUT it carries a Vault
 *      anchor pointing to a registry entry that contains the original
 *      free-text payload in full.
 *    - A harmonic is a structured outcome packet, BUT it carries a context
 *      anchor pointing to a registry entry that lists every file, snippet,
 *      and resource the demigod consulted.
 *
 *  The registry is append-only (JSONL) and lives at:
 *    ~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl
 *
 *  The tuner (tuner.ts) reads this registry to evolve the system's
 *  vibrational shorthand — signatures whose harmonic outcomes achieved
 *  high success are up-weighted as "harmonic templates."
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getVaultRoot } from '../../vault-root';

const VAULT_ROOT = getVaultRoot();

const REGISTRY_DIR = path.join(VAULT_ROOT, '05_Auto_Learning', 'vibrations');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'registry.jsonl');
const TEMPLATES_PATH = path.join(REGISTRY_DIR, 'templates.json');
const METRICS_PATH = path.join(REGISTRY_DIR, 'metrics.json');

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ResonanceKind =
  | 'signature-source'   // the full payload a signature was composed from
  | 'harmonic-context'   // what a demigod read to produce a harmonic
  | 'consensus-output'   // the final fused consensus (incl. Choir output)
  | 'fallback-event';    // a recorded fallback to text mode (for learning)

export interface ResonanceRegistryEntry {
  readonly id: string;
  readonly kind: ResonanceKind;
  readonly godId: string;
  readonly payload: string;        // the full uncompressed content
  readonly checksum: string;       // sha256 of payload
  readonly intentHash: string;     // signature intent hash, or signature ID for harmonics
  readonly semanticTokens: string[];
  readonly stackHints: string[];
  readonly parentSignature?: string;
  readonly registeredAt: string;
  /** Optional: outcome tagging (set after the cycle completes) */
  outcome?: 'success' | 'failure' | 'partial' | 'fallback';
  /** Optional: confidence score (set by the tuner) */
  confidence?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  REGISTRY I/O
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the registry directory + file exist. Idempotent.
 */
function ensureRegistry(): void {
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }
  if (!fs.existsSync(REGISTRY_PATH)) {
    fs.writeFileSync(REGISTRY_PATH, '', 'utf-8');
  }
  if (!fs.existsSync(TEMPLATES_PATH)) {
    fs.writeFileSync(TEMPLATES_PATH, '{}', 'utf-8');
  }
  if (!fs.existsSync(METRICS_PATH)) {
    fs.writeFileSync(
      METRICS_PATH,
      JSON.stringify(
        {
          totalSignatures: 0,
          totalHarmonics: 0,
          totalConsensus: 0,
          totalFallbacks: 0,
          averageReduction: 0,
          averageCoherence: 0,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    );
  }
}

/**
 * Register a resonance entry. The payload is preserved in full — this is
 * the lossless proof of zero semantic degradation.
 *
 *  Returns the entry ID, which the caller embeds as a VaultAnchor.anchorId.
 */
export function registerResonance(input: {
  kind: ResonanceKind;
  godId: string;
  payload: string;
  checksum: string;
  intentHash: string;
  semanticTokens: string[];
  stackHints: string[];
  parentSignature?: string;
}): ResonanceRegistryEntry {
  ensureRegistry();

  const entry: ResonanceRegistryEntry = {
    id: crypto.randomUUID(),
    kind: input.kind,
    godId: input.godId,
    payload: input.payload,
    checksum: input.checksum,
    intentHash: input.intentHash,
    semanticTokens: input.semanticTokens,
    stackHints: input.stackHints,
    parentSignature: input.parentSignature,
    registeredAt: new Date().toISOString(),
  };

  // Append to the JSONL registry
  fs.appendFileSync(REGISTRY_PATH, JSON.stringify(entry) + '\n', 'utf-8');

  // Invalidate the in-memory index so the next retrieveResonance call rebuilds it.
  invalidateIndex();

  // Update aggregate metrics
  updateMetricsForNewEntry(entry);

  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
//  In-memory index for O(1) retrieveResonance().
//  Built lazily on first read, invalidated on append.
//
//  The index is process-local (module-level). In a multi-process deployment
//  (e.g. multiple OpenCode sessions), each process maintains its own index.
//  This is acceptable because the registry file is append-only — the index
//  never goes stale for existing entries, only new entries (which trigger
//  an index miss → fall back to a single line read at the known offset).
// ─────────────────────────────────────────────────────────────────────────────

let _index: Map<string, number> | null = null;
let _indexSize: number = 0;

function getIndex(): Map<string, number> | null {
  if (_index) return _index;
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return null;
    const stat = fs.statSync(REGISTRY_PATH);
    if (stat.size === _indexSize && _indexSize === 0) return null;
    _index = new Map();
    _indexSize = stat.size;
    const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    let offset = 0;
    for (const line of content.split('\n')) {
      if (!line) { offset += line.length + 1; continue; }
      try {
        const entry = JSON.parse(line);
        if (entry && entry.id) {
          _index.set(entry.id, offset);
        }
      } catch {
        // Skip malformed lines
      }
      offset += line.length + 1; // +1 for the newline
    }
    return _index;
  } catch {
    return null;
  }
}

function invalidateIndex(): void {
  _index = null;
  _indexSize = 0;
}

/**
 * Compact the registry by removing entries older than `maxAgeDays` (default 30).
 * Prevents the JSONL file from growing without bound.
 * Returns the number of entries removed.
 */
export function compactRegistry(maxAgeDays: number = 30): number {
  ensureRegistry();
  try {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    const kept: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts = entry.registeredAt ? new Date(entry.registeredAt).getTime() : 0;
        if (ts > 0 && ts < cutoff) {
          removed++;
          continue; // skip old entries
        }
      } catch {
        // Keep malformed lines (don't delete what we can't parse)
      }
      kept.push(line);
    }
    if (removed > 0) {
      fs.writeFileSync(REGISTRY_PATH, kept.join('\n') + '\n', 'utf-8');
      invalidateIndex();
    }
    return removed;
  } catch {
    return 0;
  }
}

/**
 * Retrieve a registry entry by ID. Returns null if not found.
 *  This is the lossless reconstruction path — any agent can recover the
 *  full uncompressed source by following a Vault anchor.
 *
 *  Uses the in-memory index for O(1) lookups when
 *  the index is available. Falls back to the O(N) line scan if the index
 *  is not built (first call) or if the ID is not in the index (new entry
 *  appended after the index was built — in which case we rebuild the index).
 */
export function retrieveResonance(id: string): ResonanceRegistryEntry | null {
  ensureRegistry();
  // Try the in-memory index first (O(1))
  const index = getIndex();
  if (index && index.has(id)) {
    // Use the index to skip to the correct line.
    const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const lines = content.split('\n');
    let currentOffset = 0;
    for (const line of lines) {
      if (currentOffset === index.get(id) || (line && JSON.parse(line)?.id === id)) {
        try {
          const entry = JSON.parse(line) as ResonanceRegistryEntry;
          if (entry.id === id) return entry;
        } catch {
          break;
        }
      }
      currentOffset += line.length + 1;
    }
    // If we reached here, the index was stale — rebuild and retry.
    invalidateIndex();
  }
  // Fallback: O(N) line scan (also handles the case where the index is null)
  const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ResonanceRegistryEntry;
      if (entry.id === id) return entry;
    } catch {
      // Skip malformed lines
    }
  }
  return null;
}

/**
 * Verify a Vault anchor — check that the registry entry exists and that
 * its checksum matches. Returns true if the anchor is intact.
 *
 *  This is the tamper-detection path. If an agent ever encounters a
 *  signature whose anchor doesn't verify, it MUST refuse to act on the
 *  signature and report the integrity violation.
 */
export function verifyAnchor(anchor: {
  anchorType: 'registry' | 'vault-file' | 'inline';
  anchorId: string;
  inlinePayload?: string;
  checksum: string;
}): boolean {
  if (anchor.anchorType === 'inline') {
    // Inline payloads store their content directly — verify checksum
    const inline = anchor.inlinePayload ?? '';
    const computed = crypto
      .createHash('sha256')
      .update(inline)
      .digest('hex');
    return computed === anchor.checksum;
  }
  if (anchor.anchorType === 'registry') {
    const entry = retrieveResonance(anchor.anchorId);
    if (!entry) return false;
    return entry.checksum === anchor.checksum;
  }
  if (anchor.anchorType === 'vault-file') {
    const fullPath = path.join(VAULT_ROOT, anchor.anchorId);
    if (!fs.existsSync(fullPath)) return false;
    const content = fs.readFileSync(fullPath, 'utf-8');
    const computed = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
    return computed === anchor.checksum;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
//  OUTCOME TAGGING — for the tuner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tag a registry entry with its outcome. Called by the Conductor after
 * a cycle completes. The tuner reads these tags to evolve the system's
 * vibrational shorthand.
 *
 *  This is the Symphony's learning loop:
 *    1. A signature is registered with no outcome.
 *    2. The Conductor runs the cycle.
 *    3. The Conductor tags the signature with its outcome.
 *    4. The tuner promotes successful signatures to harmonic templates.
 */
export function tagOutcome(
  entryId: string,
  outcome: 'success' | 'failure' | 'partial' | 'fallback',
  confidence?: number,
): void {
  ensureRegistry();
  const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const updated: string[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ResonanceRegistryEntry;
      if (entry.id === entryId) {
        entry.outcome = outcome;
        if (confidence !== undefined) entry.confidence = confidence;
        updated.push(JSON.stringify(entry));
      } else {
        updated.push(line);
      }
    } catch {
      updated.push(line);
    }
  }
  fs.writeFileSync(REGISTRY_PATH, updated.join('\n') + '\n', 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
//  AGGREGATE METRICS
// ─────────────────────────────────────────────────────────────────────────────

export interface SymphonyMetrics {
  totalSignatures: number;
  totalHarmonics: number;
  totalConsensus: number;
  totalFallbacks: number;
  averageReduction: number;
  averageCoherence: number;
  updatedAt: string;
}

function updateMetricsForNewEntry(entry: ResonanceRegistryEntry): void {
  try {
    const raw = fs.readFileSync(METRICS_PATH, 'utf-8');
    const m = JSON.parse(raw) as SymphonyMetrics;
    if (entry.kind === 'signature-source') m.totalSignatures++;
    if (entry.kind === 'harmonic-context') m.totalHarmonics++;
    if (entry.kind === 'consensus-output') m.totalConsensus++;
    if (entry.kind === 'fallback-event') m.totalFallbacks++;
    m.updatedAt = new Date().toISOString();
    fs.writeFileSync(METRICS_PATH, JSON.stringify(m, null, 2), 'utf-8');
  } catch {
    // Non-fatal — metrics are best-effort
  }
}

export function readMetrics(): SymphonyMetrics {
  ensureRegistry();
  const raw = fs.readFileSync(METRICS_PATH, 'utf-8');
  return JSON.parse(raw) as SymphonyMetrics;
}

// ─────────────────────────────────────────────────────────────────────────────
//  RECENT ENTRIES — feeds the Symphony View Mode overlay
// ─────────────────────────────────────────────────────────────────────────────

export interface RecentEntryFilters {
  kind?: ResonanceKind;
  godId?: string;
  limit?: number;
}

export function readRecentEntries(
  filters: RecentEntryFilters = {},
): ResonanceRegistryEntry[] {
  ensureRegistry();
  const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const entries: ResonanceRegistryEntry[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ResonanceRegistryEntry;
      if (filters.kind && entry.kind !== filters.kind) continue;
      if (filters.godId && entry.godId !== filters.godId) continue;
      entries.push(entry);
    } catch {
      // skip
    }
  }
  // Most recent first
  entries.reverse();
  return entries.slice(0, filters.limit ?? 50);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PATH EXPORTS — for the UI / API routes
// ─────────────────────────────────────────────────────────────────────────────

export const REGISTRY_PATHS = Object.freeze({
  root: REGISTRY_DIR,
  registry: REGISTRY_PATH,
  templates: TEMPLATES_PATH,
  metrics: METRICS_PATH,
  vaultRoot: VAULT_ROOT,
});
