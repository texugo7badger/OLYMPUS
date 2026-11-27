#!/usr/bin/env node
/**
 * resonance-index.mjs — v0.1.4: build the Symphony Resonance Index.
 *
 * Reads the append-only arsenal-resonance log and writes the pre-aggregated
 * signatures to ~/.olympus/resonance.db. Deterministic, safe to repeat.
 *
 * Usage: npm run resonance:index
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { backfillResonanceIndex, resonanceStats } = await import(ROOT + '/src/lib/symphony/resonance-index.ts');

const result = backfillResonanceIndex();
console.log(JSON.stringify({ ...result, ...resonanceStats() }, null, 2));
