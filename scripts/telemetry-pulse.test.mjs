#!/usr/bin/env node
/**
 * telemetry-pulse.test.mjs — battery suite #21 (MADRUGA-GAP-1 S2R).
 * Run: npx tsx scripts/telemetry-pulse.test.mjs   (exit 0 = pass)
 *
 * THE PULSE PAIR, gated here forever:
 *   - #69: one-shot `opencode run` spawns never fire session.created
 *     (opencode 1.18.10), so `state.agentId` never populates and the hard
 *     `if (!state.agentId) return;` gate froze EVERY live.jsonl activity
 *     write for driver-spawned runs — while the cost line kept flowing
 *     (the D8 blindness, reproduced deterministically here as rowsTotal: 0).
 *     The fix: `activityAgent = state.agentId || eventAgent || null` —
 *     attribution falls back to the SAME trusted sources the cost path
 *     uses (#25): input.agent, else the bus-recorded agent for the callID,
 *     else "global" via godId. The tracker is NEVER mutated by the fallback.
 *   - #77: the #25 managed-process gate returned tools-only for EVERY
 *     unmanaged process — including the user's interactive ROOT session,
 *     whose Part-3 heartbeat wiring therefore never fired (the live
 *     evidence: a session with heavy tool activity and ZERO heartbeats on
 *     the bus). The fix: the opt-in root lane — `OLYMPUS_ROOT_SESSION=1`
 *     registers EXACTLY the Part-3 wiring (acting at tool.execute.before,
 *     idle at session.idle, on the bus + Atlas), driven by an in-memory
 *     session-local tracker. No cost writes, no active-agent.json, no
 *     VaultBrain/Callimachus, no dispatch registration. Foreign processes
 *     (neither flag) keep the bare tools-only return — the #25 cure VERBATIM.
 *
 * RED (captured verbatim against the pre-fix code, 2026-10-07): the one-shot
 * shape produces rowsTotal: 0 while cost rows flow (assertions 1-5 FAIL);
 * the root shape dies at `hooks.event is not a function` (assertions
 * 10-11 FAIL) — the filed live evidence's deterministic twin. The
 * interactive no-duplicate and foreign-silence invariants PASS before and
 * after (guards, not regressions).
 *
 * Hermetic (R11): every child points OLYMPUS_ROOT, OLYMPUS_VAULT,
 * OLYMPUS_HOME and HOME at throwaway temp dirs BEFORE its first import;
 * the real ~/.olympus, the real vault and the live opencode.json are never
 * touched. No network: the stub client absorbs client.* calls; the
 * brain-stats fetch path is never driven (session.created is never fired —
 * that is the point of the one-shot shape).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'telemetry-pulse.test.mjs');

let fails = 0, checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 300)}`}`);
  if (!ok) fails++;
}

// ─── Child: one shape per process, fresh temp state (R11) ───────────────────
if (process.argv[2] === 'child') {
  const lane = process.env.OLYMPUS_ROOT;
  const vault = process.env.OLYMPUS_VAULT;
  const home = process.env.OLYMPUS_HOME;
  mkdirSync(lane, { recursive: true });
  mkdirSync(join(vault, '06_Activity_Feed'), { recursive: true });
  mkdirSync(home, { recursive: true });

  // A minimal lane config (the plugin reads the worktree for the demigod map;
  // an absent registry degrades to an empty map — deterministic either way).
  const agent = {};
  for (const g of ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
    'hermes', 'persephone', 'prometheus', 'callimachus'])
    agent[g] = { mode: g === 'apollo' ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: '#' + g };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(lane, 'opencode.json'), JSON.stringify({ agent }));

  // Shim the plugin SDK's tool() helper (the only external runtime import;
  // `@opencode-ai/plugin` itself is a type-only import, erased at compile).
  // The schema builder is a catch-all chain: any method (.string() .object()
  // .min() .describe() …) returns the chain again — the tools' Zod-style
  // builders are never executed by the shim, only constructed.
  const Module = (await import('node:module')).default;
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === '@opencode-ai/plugin/tool') {
      const chain = new Proxy(function () { return chain; }, {
        get: (t, prop) => {
          if (typeof prop === 'symbol') return undefined;
          return (..._args) => chain;
        },
      });
      const toolFn = (def) => def;
      toolFn.schema = new Proxy({}, { get: () => (..._args) => chain });
      return { tool: toolFn };
    }
    return origLoad.apply(this, [request, ...rest]);
  };

  const { OlympusHooksPlugin } = await import('../.opencode/olympus/olympus-hooks.ts');
  const client = { app: { log: () => {} }, session: { messages: async () => ({ data: [] }) } };
  const hooks = await OlympusHooksPlugin({ client, $: null, directory: lane, worktree: lane });

  const feedPath = join(vault, '06_Activity_Feed', 'live.jsonl');
  const feed = () => existsSync(feedPath)
    ? readFileSync(feedPath, 'utf-8').trim().split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  const costPath = join(home, '.olympus', 'metrics', 'cost.jsonl');
  const costRows = () => existsSync(costPath)
    ? readFileSync(costPath, 'utf-8').trim().split('\n').filter(Boolean).length : 0;
  const busPath = join(home, 'symphony-bus.jsonl');
  const bus = () => existsSync(busPath)
    ? readFileSync(busPath, 'utf-8').trim().split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  const syncMapPath = join(home, 'sync-map.json');

  const shape = process.env.PULSE_SHAPE;
  const out = { shape, hookKeys: Object.keys(hooks).sort() };

  if (shape === 'oneshot') {
    // The one-shot shape: session.created NEVER fires (opencode 1.18.10) and
    // tool.execute.before is never driven with an agent — the tracker stays
    // empty, exactly like a driver-spawned `opencode run`.
    await hooks['event']({ event: { type: 'message.part.updated', info: { agent: 'hermes' }, part: { type: 'tool', callID: 'os-c1' } } });
    await hooks['tool.execute.after'](
      { tool: 'bash', args: { command: 'npm run test' }, callID: 'os-c1', sessionID: 'os-s1' },
      { exitCode: 0 },
    );
    await hooks['tool.execute.after'](
      { tool: 'write', args: { filePath: 'out.txt', content: 'x' }, callID: 'os-c2', sessionID: 'os-s1' },
      { timeMs: 1 },
    );
    await hooks['tool.execute.after'](
      { tool: 'olympus-dispatch', args: { godId: 'hermes', demigod: 'researcher', task: 'one-shot dispatch probe' }, callID: 'os-c3', sessionID: 'os-s1' },
      { output: JSON.stringify({ ok: true, dispatchId: 'os-disp-1' }) },
    );
    out.rowsTotal = feed().length;
    out.rows = feed().map((r) => ({ god: r.god, action: r.action, agent: r.meta?.agent ?? null }));
    out.costRows = costRows();
  } else if (shape === 'interactive') {
    // The interactive shape: the tracker populates via tool.execute.before
    // (input.agent) — the path that always worked and must keep working,
    // with ZERO duplicate rows (the invariant guard).
    await hooks['tool.execute.before']({ tool: 'bash', agent: 'hermes', callID: 'in-c1', sessionID: 'in-s1', args: { command: 'ls' } });
    await hooks['event']({ event: { type: 'message.part.updated', info: { agent: 'hermes' }, part: { type: 'tool', callID: 'in-c1' } } });
    await hooks['tool.execute.after'](
      { tool: 'bash', args: { command: 'npm test' }, callID: 'in-c1', sessionID: 'in-s1' },
      { exitCode: 0 },
    );
    await hooks['tool.execute.after'](
      { tool: 'bash', args: { command: 'npm run build' }, callID: 'in-c2', sessionID: 'in-s1', agent: 'hermes' },
      { exitCode: 0 },
    );
    const rows = feed().filter((r) => r.action === 'tool_call');
    out.toolCallRows = rows.length;
    out.gods = rows.map((r) => r.god);
  } else if (shape === 'root') {
    // The root-session shape: OLYMPUS_ROOT_SESSION=1, unmanaged. Pre-fix this
    // dies at `hooks.event is not a function` (the tools-only return — the
    // filed live evidence's deterministic twin); post-fix the Part-3 trio
    // registers and the heartbeats ride the bus + Atlas.
    if (typeof hooks['event'] === 'function') {
      await hooks['event']({ event: { type: 'message.part.updated', info: { agent: 'apollo' }, part: { type: 'tool', callID: 'rt-c1' } } });
      await hooks['tool.execute.before']({ tool: 'bash', callID: 'rt-c1', sessionID: 'rt-s1', args: { command: 'ls' } });
      await hooks['session.idle']();
      out.heartbeats = bus().filter((e) => e.type === 'heartbeat').map((e) => ({ god: e.god, state: e.state }));
      out.godStates = existsSync(syncMapPath) ? (JSON.parse(readFileSync(syncMapPath, 'utf-8')).godStates ?? null) : null;
    } else {
      out.eventHookError = 'hooks.event is not a function';
    }
    out.costRows = costRows();
    out.activeAgentFile = existsSync(join(home, '.olympus', 'active-agent.json'));
  } else if (shape === 'foreign') {
    // The foreign shape (neither flag): the #25 cure VERBATIM — tools only,
    // total silence in every state surface.
    out.costRows = costRows();
    out.activeAgentFile = existsSync(join(home, '.olympus', 'active-agent.json'));
    out.busFile = existsSync(busPath);
  }

  console.log('PULSE_RESULT ' + JSON.stringify(out));
  process.exit(0);
}

// ─── Parent: drive the shapes, assert the 12 ────────────────────────────────
const BASE = join(tmpdir(), 'olympus-pulse-' + Math.random().toString(36).slice(2, 9));

function runShape(shape, env = {}) {
  const dir = join(BASE, shape);
  const lane = join(dir, 'lane'), vault = join(dir, 'vault'), home = join(dir, 'home');
  mkdirSync(lane, { recursive: true }); mkdirSync(vault, { recursive: true }); mkdirSync(home, { recursive: true });
  const r = spawnSync('npx', ['tsx', SELF, 'child'], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PULSE_SHAPE: shape,
      OLYMPUS_ROOT: lane,
      OLYMPUS_VAULT: vault,
      OLYMPUS_HOME: home,
      HOME: home,
      ...env,
    },
  });
  const line = (r.stdout || '').trim().split('\n').filter((l) => l.startsWith('PULSE_RESULT ')).pop();
  if (r.status !== 0 || !line) {
    return { __crash: true, status: r.status, stderr: (r.stderr || '').slice(-400), stdout: (r.stdout || '').slice(-400) };
  }
  return JSON.parse(line.slice('PULSE_RESULT '.length));
}

try {
  // ── #69: the ONE-SHOT shape ─────────────────────────────────────────────
  const sinceIso = new Date().toISOString();
  const os = runShape('oneshot', { OLYMPUS_MANAGED: '1' });
  check('one-shot: the crash-free child ran', !os.__crash, JSON.stringify(os));
  if (os.__crash) throw new Error('one-shot child crashed');
  check('one-shot: activity rows reach live.jsonl (the D8 blindness dead)', os.rowsTotal > 0,
    `rowsTotal: ${os.rowsTotal}, costRows: ${os.costRows} (cost flowed, the feed stayed frozen — the pre-fix RED)`);
  const busKnown = (os.rows || []).find((r) => r.action === 'tool_call' && r.agent === 'hermes');
  check('one-shot: the bus-known-agent row attributed hermes', !!busKnown && busKnown.god === 'hermes',
    JSON.stringify(os.rows));
  const agentLess = (os.rows || []).find((r) => r.action === 'tool_call' && r.agent === null);
  check('one-shot: the agent-less row attributed global', !!agentLess && agentLess.god === 'global',
    JSON.stringify(os.rows));
  check('one-shot: the dispatch event reached live.jsonl', (os.rows || []).some((r) => r.action === 'dispatch'),
    JSON.stringify(os.rows));
  check('one-shot: cost rows kept flowing (the cost path untouched)', os.costRows >= 2,
    `costRows: ${os.costRows}`);

  // Acceptance integration (the issue's own bar): telemetry-slice returns the
  // rows for the window. Event mode: one record per matching event.
  const feedPath = join(BASE, 'oneshot', 'vault', '06_Activity_Feed', 'live.jsonl');
  const slice = spawnSync(process.execPath, [join(ROOT, 'scripts', 'telemetry-slice.mjs'),
    '--file', feedPath, '--since', sinceIso, '--action', 'tool_call', '--json'],
    { encoding: 'utf-8' });
  let sliceCount = -1;
  try { sliceCount = JSON.parse((slice.stdout || '').trim()).count; } catch { /* kept -1 */ }
  check('acceptance: telemetry-slice --action tool_call returns the rows (exit 0)', slice.status === 0 && sliceCount >= 2,
    `exit: ${slice.status}, count: ${sliceCount}, out: ${(slice.stdout || '').slice(0, 200)}`);

  // ── The INTERACTIVE shape (invariant guard: no duplicates, before AND after)
  const inter = runShape('interactive', { OLYMPUS_MANAGED: '1' });
  check('interactive: the crash-free child ran', !inter.__crash, JSON.stringify(inter));
  if (inter.__crash) throw new Error('interactive child crashed');
  check('interactive: exactly ONE row per call (2 calls -> 2 rows, zero duplicates)', inter.toolCallRows === 2,
    `toolCallRows: ${inter.toolCallRows}`);
  check('interactive: both rows attributed hermes', (inter.gods || []).length === 2 && inter.gods.every((g) => g === 'hermes'),
    JSON.stringify(inter.gods));

  // ── The FOREIGN shape (invariant guard: the #25 cure VERBATIM)
  const foreign = runShape('foreign');
  check('foreign: the crash-free child ran', !foreign.__crash, JSON.stringify(foreign));
  if (foreign.__crash) throw new Error('foreign child crashed');
  check('foreign: exactly the tools-only return', JSON.stringify(foreign.hookKeys) === JSON.stringify(['tool']),
    JSON.stringify(foreign.hookKeys));
  check('foreign: zero cost rows + no active-agent.json + no bus file', foreign.costRows === 0 && foreign.activeAgentFile === false && foreign.busFile === false,
    `costRows: ${foreign.costRows}, activeAgentFile: ${foreign.activeAgentFile}, busFile: ${foreign.busFile}`);

  // ── #77: the ROOT-session shape ─────────────────────────────────────────
  const root = runShape('root', { OLYMPUS_ROOT_SESSION: '1' });
  check('root: the crash-free child ran', !root.__crash, JSON.stringify(root));
  if (root.__crash) throw new Error('root child crashed');
  const trio = ['event', 'session.idle', 'tool.execute.before'];
  check('root: the Part-3 trio registered (pre-fix: hooks.event is not a function)',
    trio.every((k) => (root.hookKeys || []).includes(k)),
    `hookKeys: ${JSON.stringify(root.hookKeys)}${root.eventHookError ? ` -- ${root.eventHookError}` : ''}`);
  const hb = root.heartbeats || [];
  check('root: acting + idle heartbeats on the bus (god apollo) + Atlas records godStates.apollo',
    hb.some((e) => e.god === 'apollo' && e.state === 'acting')
      && hb.some((e) => e.god === 'apollo' && e.state === 'idle')
      && !!(root.godStates && root.godStates.apollo),
    JSON.stringify({ heartbeats: hb, godStates: root.godStates }));
  check('root: the #25 contract preserved — zero cost rows, active-agent.json ABSENT',
    root.costRows === 0 && root.activeAgentFile === false,
    `costRows: ${root.costRows}, activeAgentFile: ${root.activeAgentFile}`);
} finally {
  rmSync(BASE, { recursive: true, force: true });
}

if (fails > 0) {
  console.error(`\ntelemetry-pulse: ${fails} FAILURE(S), ${checked} checked`);
  process.exit(1);
}
console.log(`\nAll ${checked} telemetry-pulse (#69 one-shot feed + #77 root heartbeat lane) assertions passed`);
