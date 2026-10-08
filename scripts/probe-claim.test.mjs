#!/usr/bin/env node
/**
 * probe-claim.test.mjs — MADRUGA-SERVE-1 Batch B: the probe-verified-claim
 * doctrine (#105). RED-first. The #105 specimen: Apollo narrated "the dev
 * server is running" from 31s of captured bash output (the banner + "Ready"
 * + "Compiled") while the process was already dead — a claim about live
 * state derived from corpse text. The doctrine: a live-state claim carries
 * PROBE EVIDENCE or it is not made.
 *
 *   G1  the claim unit (src/lib/dev-server-claim.ts, pure):
 *       (1) probe-verified green status → the claim carries host/port/latency
 *       (2) probe-verified silent status → the honest down sentence — never "running"
 *       (3) NO probe + captured text (the phantom specimen) → running null,
 *           verified false, the claim is EXACTLY the refusal — the captured
 *           text is never a source and never quoted as evidence
 *       (4) captured text + green probe → the probe wins; the captured text is
 *           at most noted as what-was-said, never as truth
 *   G2  the manager-status route (the app-flow probe surface):
 *       exists at src/app/api/olympus/dev-server/status/route.ts, builds the
 *       claim from the manager's status (probe), returns claim + status
 *   G3  the failure card (#98's card, interactive-terminal.tsx):
 *       the dev-server signal path fetches the probe route + renders the
 *       probe evidence when green; the no-probe path renders the explicit
 *       refusal "unverified — no probe evidence"; captured text never renders
 *       as a running claim
 *   G4  the prompt/docs layer (the rule, verbatim in spirit):
 *       AGENTS.md carries the standing rule; the narrator god's prompt
 *       (apollo.txt) carries it; both name #105
 *
 * Run: npx tsx scripts/probe-claim.test.mjs (exit 0)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CLAIM_LIB = join(ROOT, 'src', 'lib', 'dev-server-claim.ts');
const ROUTE = join(ROOT, 'src', 'app', 'api', 'olympus', 'dev-server', 'status', 'route.ts');
const TERMINAL = join(ROOT, 'src', 'components', 'olympus', 'interactive-terminal.tsx');
const AGENTS = join(ROOT, 'AGENTS.md');
const APOLLO = join(ROOT, '.opencode', 'prompts', 'agents', 'gods', 'apollo.txt');

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 320)}`}`); if (!ok) fails++; };

// ─── G1: the claim unit (pure — no child gate needed) ───────────────────────
{
  let lib = null, importErr = null;
  try { lib = await import('../src/lib/dev-server-claim.ts'); }
  catch (e) { importErr = e; }

  if (!lib) {
    check('G1 src/lib/dev-server-claim.ts exports buildDevServerClaim', false,
      `import failed: ${importErr?.message ?? 'export missing'} — the doctrine helper not implemented`);
    check('G1 the refusal constant is exported (one sentence, one source)', false, '');
  } else {
    const { buildDevServerClaim, UNVERIFIED_CLAIM_REFUSAL } = lib;

    // (1) probe-verified green — the claim carries host/port/latency
    const green = buildDevServerClaim({
      status: {
        slug: 'exemplo-landingpage', state: 'running', running: true, pid: 4242, pidAlive: true,
        port: 3015, host: 'ipv4', url: 'http://127.0.0.1:3015', responseTimeMs: 3,
        projectPath: '/lane/exemplo', startedAt: '2026-10-08T07:00:00.000Z', logFile: '/x.log',
        staleCleared: false, note: 'running (probe-verified on ipv4, 3ms)',
      },
    });
    check('G1 green probe → running true + verified true (the probe is the source)',
      green.running === true && green.verified === true, JSON.stringify(green));
    check('G1 green probe → the claim names port + host (probe evidence, not vibes)',
      String(green.claim).includes('3015') && String(green.claim).includes('ipv4'), green.claim);
    check('G1 green probe → the evidence carries host/port/latency',
      /3015/.test(green.evidence) && /ipv4/.test(green.evidence) && /3ms|latency/.test(green.evidence), green.evidence);

    // (2) probe-verified silent — the honest down sentence, never "running"
    const silent = buildDevServerClaim({
      status: {
        slug: 'exemplo-landingpage', state: 'down-stale', running: false, pid: 4242, pidAlive: false,
        port: 3015, host: null, url: 'http://127.0.0.1:3015', responseTimeMs: 2,
        projectPath: '/lane/exemplo', startedAt: '2026-10-08T07:00:00.000Z', logFile: '/x.log',
        staleCleared: true, note: 'down (stale state, pid dead)',
      },
    });
    check('G1 silent probe → running false + verified true (the honest down)',
      silent.running === false && silent.verified === true, JSON.stringify(silent));
    check('G1 silent probe → the claim never says "running"',
      !/\brunning\b/i.test(silent.claim) && /down/i.test(silent.claim), silent.claim);

    // (3) the phantom specimen: NO probe, captured text only → the refusal
    const phantom = buildDevServerClaim({
      capturedText: '▲ Next.js 14.2.35\n- Local: http://localhost:3015\n✓ Ready in 2.8s\n✓ Compiled in 1200ms',
    });
    check('G1 the phantom specimen (captured text, no probe) → running null + verified false',
      phantom.running === null && phantom.verified === false, JSON.stringify(phantom));
    check('G1 the phantom specimen → the claim is EXACTLY the refusal sentence',
      phantom.claim === UNVERIFIED_CLAIM_REFUSAL && phantom.claim.includes('no probe evidence'), JSON.stringify(phantom.claim));
    check('G1 the phantom specimen → the captured text is never quoted as evidence',
      !String(phantom.claim).includes('Ready') && !String(phantom.evidence).includes('Ready')
      && !String(phantom.evidence).includes('localhost:3015'), JSON.stringify({ claim: phantom.claim, evidence: phantom.evidence }));

    // (4) captured text + green probe → the probe wins
    const both = buildDevServerClaim({
      status: {
        slug: 'exemplo-landingpage', state: 'running', running: true, pid: 4242, pidAlive: true,
        port: 3015, host: 'ipv4', url: 'http://127.0.0.1:3015', responseTimeMs: 3,
        projectPath: '/lane/exemplo', startedAt: '2026-10-08T07:00:00.000Z', logFile: '/x.log',
        staleCleared: false, note: 'running (probe-verified on ipv4, 3ms)',
      },
      capturedText: '✓ Ready in 2.8s',
    });
    check('G1 captured text + green probe → the probe is the source of the claim',
      both.running === true && both.verified === true && String(both.claim).includes('3015'), JSON.stringify(both));
    check('G1 captured text + green probe → the captured text is noted, never the truth',
      !String(both.claim).includes('Ready') && (!both.capturedNote || String(both.capturedNote).includes('Ready') === true), JSON.stringify(both.capturedNote));

    // the refusal constant — the exact sentence the doctrine requires
    check('G1 the refusal constant is the doctrine sentence (one source of truth)',
      UNVERIFIED_CLAIM_REFUSAL === 'unverified — no probe evidence', JSON.stringify(UNVERIFIED_CLAIM_REFUSAL));
  }
}

// ─── G2: the manager-status route (the app-flow probe surface) ──────────────
{
  const exists = existsSync(ROUTE);
  const route = exists ? readFileSync(ROUTE, 'utf-8') : '';
  check('G2 the route exists at src/app/api/olympus/dev-server/status/route.ts', exists,
    'the app flow needs a probe surface the failure card can call — additive, the live-preview route stays frozen (#100 owns the panel integration)');
  if (exists) {
    check('G2 the route builds the claim from the MANAGER status (probe truth, never captured text)',
      /dev-server-manager/.test(route) && /buildDevServerClaim/.test(route) && /status\s*\(/i.test(route), '');
    check('G2 the route answers without a project param too (the active project fallback)',
      /getActiveProjectSlug|getActiveProject/.test(route), 'the failure card has no slug in hand — the active project is the honest default');
    check('G2 the route returns claim + status (the card renders the server-built sentence)',
      /claim/.test(route) && /status/.test(route), '');
  }
}

// ─── G3: the failure card (#98's card gains the probe evidence) ────────────
{
  const term = readFileSync(TERMINAL, 'utf-8');
  check('G3 the card has a dev-server signal gate (the class-aware trigger)',
    /DEV_SERVER_SIGNAL_RE|EADDRINUSE/.test(term), 'the card must know when a failure smells like the dev-server class');
  check('G3 the card fetches the PROBE route for its dev-server evidence',
    /\/api\/olympus\/dev-server\/status/.test(term), 'the claim must come from the manager/status probe — never captured output');
  check('G3 the card renders the probe evidence when verified',
    /Dev-server probe/.test(term), '');
  check('G3 the card renders the explicit refusal when there is no probe',
    /Dev-server claim refused/.test(term) && /no probe evidence/.test(term),
    'the no-probe path must be the honest "unverified — no probe evidence", never a captured-text claim');
}

// ─── G4: the prompt/docs layer (the rule, verbatim in spirit) ───────────────
{
  const agents = readFileSync(AGENTS, 'utf-8');
  check('G4 AGENTS.md carries the probe-verified-claim standing rule',
    /captured\s+(?:bash\s+)?output\s+alone/i.test(agents) && /probe/i.test(agents) && /#105/.test(agents),
    'the law: never narrate a dev server as running from captured output alone; probe first, quote the probe, or say you could not verify');
  check('G4 AGENTS.md names the refusal sentence (the doctrine\'s exact honest form)',
    /unverified — no probe evidence/.test(agents), '');
  const apollo = readFileSync(APOLLO, 'utf-8');
  check('G4 the narrator god\'s prompt (apollo.txt) carries the rule',
    /captured (?:bash )?output alone/i.test(apollo) && /probe/i.test(apollo) && /#105/.test(apollo),
    'Apollo is the god who talks to the user — the #105 specimen was Apollo\'s narration');
  check('G4 the narrator god\'s prompt points at the manager as the single source of truth',
    /dev-server manager|manager's status|manager status/i.test(apollo), '');
}

if (fails > 0) { console.error(`\n${fails}/${checked} probe-claim assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} probe-claim assertions passed`);
