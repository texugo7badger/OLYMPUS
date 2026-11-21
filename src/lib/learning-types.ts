/**
 * learning-types.ts — v0.0.98: the client-safe learning ledger item.
 *
 * Shared by the notification center, the Pattern Studio and the detail box.
 * The server route (`/api/olympus/learning/recent`) owns the data; this type
 * is the contract.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface LearningItem {
  id: string;
  type: 'instinct' | 'knowledge' | 'skill' | 'mcp';
  name: string;
  god: string;
  ts: string;
  summary: string;
  confidence?: number;
  samples?: number;
  successes?: number;
  rate?: number;
  threshold: number;
  gap: number;
  lastUsed?: string | null;
  lastOutcome?: string | null;
  history?: Array<{ ts: string; outcome: string; hop: string | null; god: string | null }>;
  recommendation?: string;
  path?: string;
}

export const SHORT_CIRCUIT_THRESHOLD = 0.85;
