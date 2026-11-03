#!/usr/bin/env node
/**
 * talent-market.test.mjs — v0.0.53.
 *
 * The Talent Studio and the MCP market are creation surfaces, not decoration:
 * deterministic sigils, capped slots, forkable presets, export, and an add
 * lane that writes the real OpenCode MCP shape.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const { TALENT_PRESETS } = await import(OLYMPUS + '/src/lib/talent-presets.ts');
const { normalizeUserBuild } = await import(OLYMPUS + '/src/lib/design-builds.ts');
expect('T-0: params are clamped by the build normalizer', (() => { const b = normalizeUserBuild({ name: 'x', god: 'athena', params: { temperature: 9, speed: 'fast', budgetTokens: 999999, quality: 'max' } }); return b?.params?.temperature === 1 && b?.params?.budgetTokens === 131072; })(), 'params not normalized');
const { MCP_MARKET, searchMarket, marketSearchUrl } = await import(OLYMPUS + '/src/lib/mcp-market.ts');
expect('T-1: the community shelf has real presets', TALENT_PRESETS.length >= 6 && TALENT_PRESETS.every((p) => p.name && p.god && p.skills.length && p.mcps.length && p.demigods.length), `${TALENT_PRESETS.length}`);
expect('T-2: preset ids are unique', new Set(TALENT_PRESETS.map((p) => p.id)).size === TALENT_PRESETS.length, 'duplicate preset id');
expect('T-3: the sigil is deterministic, themed and animated (with stable mode)',
  /function hash/.test(fs.readFileSync(OLYMPUS + '/src/components/olympus/talent-sigil.tsx', 'utf-8'))
    && /theme\.motion === 'stable'/.test(fs.readFileSync(OLYMPUS + '/src/components/olympus/talent-sigil.tsx', 'utf-8'))
    && /@keyframes/.test(fs.readFileSync(OLYMPUS + '/src/components/olympus/talent-sigil.tsx', 'utf-8')),
  'the mark is random or static');
const page = fs.readFileSync(OLYMPUS + '/src/components/olympus/build-talent-page.tsx', 'utf-8');
expect('T-4: the studio saves, forks, exports and caps slots',
  /design-builds/.test(page) && /applyPreset/.test(page) && /exportTalent/.test(page) && /BUILD_LIMITS/.test(page),
  'the creation loop is missing');
expect('T-5: the old carousel is gone', !/snap-mandatory|scroller|goTo\(active/.test(page), 'the carousel still owns the page');
expect('T-5b: each god keeps its own animated symbol', /GOD_ICONS/.test(fs.readFileSync(OLYMPUS + '/src/components/olympus/talent-sigil.tsx', 'utf-8')) && /foreignObject/.test(fs.readFileSync(OLYMPUS + '/src/components/olympus/talent-sigil.tsx', 'utf-8')), 'generic sigil');
expect('T-5c: temperature/speed/budget/quality are editable and saved', /temperature/.test(page) && /budgetTokens/.test(page) && /params: \{ temperature, speed, budgetTokens, quality \}/.test(page), 'no execution profile');
expect('T-6: the MCP seed is free-first and complete', MCP_MARKET.length >= 8 && MCP_MARKET.slice(0, 5).every((m) => m.free) && MCP_MARKET.every((m) => m.id && m.description && m.docs), `${MCP_MARKET.length}`);
expect('T-7: market search is local and the full directory is linked',
  searchMarket('browser').length >= 1 && /mcpservers\.org\/search/.test(marketSearchUrl('browser')),
  'the market cannot search');
const add = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/mcp/add/route.ts', 'utf-8');
expect('T-8: add writes the OpenCode v2 shape and refuses overwrite',
  /type: 'local'/.test(add) && /command/.test(add) && /already exists/.test(add) && /renameSync/.test(add),
  'a bad config can be written');
const panel = fs.readFileSync(OLYMPUS + '/src/components/olympus/mcp-config-panel.tsx', 'utf-8');
expect('T-9: MCP Configuration mounts the market',
  /MCP market/.test(panel) && /mcp\/market/.test(panel) && /mcp\/add/.test(panel),
  'the market is invisible');

console.log(failures === 0 ? '\ntalent-market: all green.' : `\ntalent-market: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
