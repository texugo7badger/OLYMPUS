/**
 * learn-from-hops.ts — v0.1.0: backfill empirical instincts from completed
 * hop telemetry. Deterministic (no model, no tokens). It uses the same
 * recordHopLearning() the walker now calls at hop completion, so history and
 * future hops share one contract.
 *
 * Usage: npx tsx scripts/learn-from-hops.ts [lane-root]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordHopLearning } from '../src/lib/hop-runtime/learning';

const lane = process.argv[2] || path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', 'aime');
const telemetry = path.join(lane, '.olympus-hop-telemetry.jsonl');
if (!fs.existsSync(telemetry)) {
  console.error(`learn-from-hops: no telemetry at ${telemetry}`);
  process.exit(1);
}
const slug = path.basename(lane);
const rows = fs.readFileSync(telemetry, 'utf-8').trim().split('\n').map((line) => {
  try { return JSON.parse(line); } catch { return null; }
}).filter(Boolean);
let created = 0;
let updated = 0;
let skipped = 0;
const seen = new Set<string>();
for (const row of rows) {
  if (row?.status !== 'completed' || !Array.isArray(row?.artifacts) || row.artifacts.length === 0) { skipped++; continue; }
  const key = `${row.god}:${row.hop}`;
  if (seen.has(key)) { skipped++; continue; }
  seen.add(key);
  const result = recordHopLearning({
    slug,
    hop: String(row.hop || 'hop'),
    god: String(row.god || 'apollo'),
    artifacts: row.artifacts,
    checks: row.checks,
    promptExcerpt: row.promptExcerpt,
    status: row.status,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    lane: row.lane,
    ts: row.ts,
  });
  if (!result.ok) { skipped++; continue; }
  if (result.created) created++; else updated++;
}
console.log(`learn-from-hops: ${created} created, ${updated} updated, ${skipped} skipped — lane ${lane}`);
