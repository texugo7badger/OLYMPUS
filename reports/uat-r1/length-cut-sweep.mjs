#!/usr/bin/env node
// The #76 sweep — scans every opencode transcript in a lane dir for the
// length-cut signature (reason:'length' / finish_reason:'length') + the
// other finish reasons (classification evidence). Usage: node length-cut-sweep.mjs <dir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => join(dir, f));
let totalFinishes = 0, cuts = 0, unknowns = 0, toolCalls = 0;
const perFile = {};
for (const f of files) {
  const reasons = {};
  for (const line of readFileSync(f, 'utf-8').trim().split('\n').filter(Boolean)) {
    try {
      const e = JSON.parse(line);
      const p = e.part || {};
      if (p.type === 'step-finish') {
        totalFinishes++;
        const r = p.reason || 'none';
        reasons[r] = (reasons[r] || 0) + 1;
        if (r === 'length') cuts++;
        if (r === 'unknown') unknowns++;
      }
      if (p.type === 'tool') toolCalls++;
    } catch {}
  }
  perFile[f.split('/').pop()] = reasons;
}
console.log(JSON.stringify({ files: files.length, totalFinishes, cuts, unknowns, toolCalls, perFile }, null, 2));
