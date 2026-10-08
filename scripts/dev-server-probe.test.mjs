#!/usr/bin/env node
/**
 * dev-server-probe.test.mjs — MADRUGA-PREVIEW-1 Batch A: the probe truth
 * (#102). Three groups, RED-first:
 *
 *   G1  the path-agreement invariant (the A1 pin): every fetch('/api/olympus/…')
 *       path in live-preview.tsx maps to an existing src/app/api/…/route.ts.
 *       FAILS today — '/api/olympus/live-preview/status' maps to nothing.
 *   G2  the dual-stack probe unit (the A2 pin): probeDevServer finds a real
 *       net.Server on ::1-only (bracketed url), 127.0.0.1-only, both (ipv4
 *       wins), none (running:false). If the box lacks ::1 the ::1 cases are
 *       the DOCUMENTED exception (printed, never a silent skip).
 *   G3  content pins: the component threads status.url into the iframe src +
 *       the "open ↗" href (the local computation is only the pre-first-probe
 *       fallback); the route uses probeDevServer (no private TCP probe).
 *
 * Run: npx tsx scripts/dev-server-probe.test.mjs (exit 0)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';

const ROOT = new URL('..', import.meta.url).pathname;
const COMPONENT = join(ROOT, 'src', 'components', 'olympus', 'live-preview.tsx');
const ROUTE = join(ROOT, 'src', 'app', 'api', 'olympus', 'live-preview', 'route.ts');
const PROBE_LIB = join(ROOT, 'src', 'lib', 'dev-server-probe.ts');

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 300)}`}`); if (!ok) fails++; };

// ─── G1: the path-agreement invariant (A1) ──────────────────────────────────
{
  const src = readFileSync(COMPONENT, 'utf-8');
  // fetch targets: '…' / "…" / `…${…}` — capture the literal up to ' / " / ${ / `
  const paths = new Set();
  for (const m of src.matchAll(/fetch\(\s*(?:'([^']+)'|"([^"]+)"|`([^`$]+))/g)) {
    const p = m[1] ?? m[2] ?? m[3];
    if (p && p.startsWith('/api/olympus/')) paths.add(p);
  }
  check('G1 the component declares at least one /api/olympus fetch to pin', paths.size >= 2,
    `found: ${[...paths].join(' ')}`);
  for (const p of paths) {
    // strip a trailing query if any crept into the literal
    const clean = p.split('?')[0];
    const routeFile = join(ROOT, 'src', 'app', ...clean.split('/').filter(Boolean), 'route.ts');
    check(`G1 route EXISTS for fetch path ${clean}`, existsSync(routeFile),
      `expected ${routeFile} — the fetch 404s: Next serves an HTML error page, r.json() throws, the catch sets offline forever (#102's A1)`);
  }
  check('G1 the dead /status suffix is gone from every fetch path', ![...paths].some(p => p.includes('/status')),
    [...paths].filter(p => p.includes('/status')).join(' ') || '');
}

// ─── G2: the dual-stack probe unit (A2) ─────────────────────────────────────
{
  let probeDevServer = null, importErr = null;
  try { ({ probeDevServer } = await import('../src/lib/dev-server-probe.ts')); }
  catch (e) { importErr = e; }
  if (!probeDevServer) {
    check('G2 src/lib/dev-server-probe.ts exports probeDevServer', false,
      `import failed: ${importErr?.message ?? 'export missing'} — the A2 cure not implemented`);
  } else {
    const listen = (port, host) => new Promise((res, rej) => {
      const s = net.createServer();
      s.once('error', rej);
      s.listen(port, host, () => res(s));
    });
    const close = (s) => new Promise((res) => s.close(() => res()));
    const freePort = async (host) => { const s = await listen(0, host); const p = s.address().port; await close(s); return p; };

    // ::1 capability probe — the documented-exception gate (never a silent skip)
    let hasV6 = true;
    try { const s = await listen(0, '::1'); await close(s); }
    catch (e) { hasV6 = false; console.log(`      NOTE: this box has no ::1 listener capability (${e.code ?? e.message}) — the ::1-dependent cases are the documented exception (#102's A2 spec)`); }

    // (1) ::1 ONLY → found, host ipv6, bracketed url
    if (hasV6) {
      const port = await freePort('::1');
      const s = await listen(port, '::1');
      const r = await probeDevServer(port, 2000);
      check('G2 ::1-only server → running:true, host ipv6', r.running === true && r.host === 'ipv6', JSON.stringify(r));
      check('G2 ::1-only server → url is http://[::1]:<port> (brackets mandatory)', r.url === `http://[::1]:${port}`, r.url);
      check('G2 ::1-only server → responseTimeMs is a non-negative number', typeof r.responseTimeMs === 'number' && r.responseTimeMs >= 0, String(r.responseTimeMs));
      await close(s);
    }

    // (2) 127.0.0.1 ONLY → found, host ipv4, plain url
    {
      const port = await freePort('127.0.0.1');
      const s = await listen(port, '127.0.0.1');
      const r = await probeDevServer(port, 2000);
      check('G2 127.0.0.1-only server → running:true, host ipv4', r.running === true && r.host === 'ipv4', JSON.stringify(r));
      check('G2 127.0.0.1-only server → url is http://127.0.0.1:<port>', r.url === `http://127.0.0.1:${port}`, r.url);
      await close(s);
    }

    // (3) BOTH → ipv4 wins
    if (hasV6) {
      const port = await freePort('::1');
      const s6 = await listen(port, '::1');
      const s4 = await listen(port, '127.0.0.1');
      const r = await probeDevServer(port, 2000);
      check('G2 both stacks up → host ipv4 wins (ipv4 preferred on simultaneous success)', r.running === true && r.host === 'ipv4' && r.url === `http://127.0.0.1:${port}`, JSON.stringify(r));
      await close(s6); await close(s4);
    }

    // (4) NONE → running:false, host null
    {
      const port = await freePort('127.0.0.1');
      const r = await probeDevServer(port, 2000);
      check('G2 no listener → running:false, host null', r.running === false && r.host === null, JSON.stringify(r));
    }
  }
}

// ─── G3: content pins (the component threads the server-verified url) ───────
{
  const src = readFileSync(COMPONENT, 'utf-8');
  check('G3 the component declares effectiveUrl = status?.url (server-verified) with previewUrl only as fallback',
    /const\s+effectiveUrl\s*=\s*status\?\.url\s*(?:\|\||\?\?)\s*previewUrl/.test(src),
    'the iframe/open href must use the REACHABLE url the server proved, not the hardcoded 127.0.0.1 guess');
  check('G3 the iframe src threads effectiveUrl (the server-verified url)', /<iframe[^>]*\ssrc=\{effectiveUrl\}/.test(src), '');
  check('G3 the "open ↗" href threads effectiveUrl', /href=\{effectiveUrl\}/.test(src), '');

  const route = readFileSync(ROUTE, 'utf-8');
  check('G3 the route uses probeDevServer (the shared dual-stack probe, not a private TCP probe)', /probeDevServer\(/.test(route) && !/function tcpProbe/.test(route), '');
  check('G3 the route response carries host (the reachable stack, surfaced)', /host:\s*probe\.host/.test(route) || /host:\s*probe\.host,/.test(route), '');
}

if (fails > 0) { console.error(`\n${fails}/${checked} dev-server-probe assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} dev-server-probe assertions passed`);
