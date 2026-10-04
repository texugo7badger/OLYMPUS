/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
// Uses spawnOpencode() for Windows shell:true + stdin:'ignore' + local binary resolution.
import { spawnOpencode } from '@/lib/opencode-spawn';
// Warm OpenCode session manager — one persistent `opencode serve` per app
// run. First message cold-starts the server; every subsequent message reuses
// the running server + session (no cold start, context retained).
import {
  ensureServer,
  cleanupServer,
  getOrCreateSession,
  runWarmMessage,
  buildStrategyContextBlock,
  respondToPermission,
  markSessionError,
  forgetConversation,
} from '@/lib/opencode-session';
// Dynamic input token routing via task classifier.
import { classifyTask, classifyTurnWithInheritance, serializeClassification, type TaskClassification } from '@/lib/task-classifier';
import { appendActivity } from '@/lib/activity-feed';
// Issue #41: persisting an "always" grant so the next ask for the same tool
// is settled by policy instead of by another card.
import { grantAlways, loadPermissions, revokeTool, SEED_TOOL_NAMES } from '@/lib/permissions';
// ChildProcess type for the streamChild() signature.
import type { ChildProcess } from 'node:child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Timeout: if opencode produces no output within STARTUP_TIMEOUT_MS,
// send an error event and kill the process.
// 120s — opencode cold start + first API call. Free-tier endpoints
// (OpenRouter/Groq shared pools) can take 30-90s to return the first
// token when rate-limited; a 45s timer was killing legitimately-slow
// free-tier runs ("no output within 45s" seen in the interactive
// terminal on 2026-07-31).
const STARTUP_TIMEOUT_MS = 120_000; // 120 seconds
// Total max runtime — if opencode runs longer than this, we kill it.
const MAX_RUNTIME_MS = 10 * 60_000; // 10 minutes

// Issue #51: unattended mode. When a caller declares body.unattended on a
// prompt, the run has no human on the other end — probes, batch harnesses,
// scheduled/automated jobs. The brainstorming skill (and siblings) enforce a
// HARD-GATE of "present design → wait for user approval", which stalls such
// runs forever (12a probes T5b/T6b stalled at the Q&A phase until the
// harness deadline). This directive is prepended IN-BAND to the spawned run
// so it overrides any skill-level gate the model loads mid-run; the
// OLYMPUS_UNATTENDED=1 env (same pattern as OLYMPUS_MANAGED) additionally
// lets the plugin emit an unattended_mode telemetry event (session.created
// hook) and lets future code-side gates key off the flag. Default behavior
// is UNCHANGED when the flag is absent.
const UNATTENDED_DIRECTIVE = [
  '[OLYMPUS UNATTENDED MODE]',
  'This run is unattended: no human will read or answer anything until it finishes.',
  '- Never ask questions and never wait for a reply — not for clarifications, approvals, design review, or spec sign-off.',
  '- This explicitly overrides any skill-level HARD-GATE or "wait for the user" instruction (e.g. the brainstorming skill\'s interview and approval gates): satisfy those gates yourself and say you did.',
  '- Decide and proceed with sensible defaults. State every assumption you made explicitly in your final output.',
  '',
].join('\n');

/**
 * Issue #63 (BATCH 13): conversationId → the last APPLIED classification.
 * Server-lifetime, bounded to 512 entries (oldest evicted); a server
 * restart = cold session = fresh classification, by design.
 */
const classificationMemory = new Map<string, TaskClassification>();
function rememberConversationClassification(conversationId: string, c: TaskClassification): void {
  classificationMemory.delete(conversationId);
  classificationMemory.set(conversationId, c);
  if (classificationMemory.size > 512) {
    const oldest = classificationMemory.keys().next();
    if (!oldest.done) classificationMemory.delete(oldest.value);
  }
}

/**
 * POST /api/olympus/action
 *
 * Dispatches Olympus commands via the `opencode` CLI and streams JSON lines
 * back to the client as SSE. Three modes:
 *
 * 1. Prompt mode — free-form text dispatched to Apollo.
 *    Body: { action: 'prompt'|'answer'|'context', text: string, conversationId?: string }
 *    Runs on the WARM opencode session (persistent `opencode serve`): the
 *    first message per app run cold-starts the server, every following
 *    message reuses the same opencode session for the same conversationId,
 *    so context is retained with no cold start.
 *
 * 2. New-session mode — fresh opencode session (new conversationId) with
 *    the previous conversation's summary carried forward.
 *    Body: { action: 'new-session', text: string, conversationId: string }
 *
 * 3. Context-menu mode — instinct lifecycle actions on a brain-atlas node.
 *    Body: { action: 'evolve'|'archive'|'promote'|'contradiction'|'lineage'|'prune'|'stocktake',
 *            node?: { name, type, god } }
 *
 *    Mapping to real Olympus commands:
 *      - archive                       → /callimachus-heartbeat --deep (compact-brain)
 *      - evolve / promote / contradiction / prune → /callimachus-heartbeat (7-stage cleanup, includes PRUNE)
 *      - lineage / stocktake           → /instinct-status (read-only pool dump)
 *
 *    These stay on the one-shot `opencode run` path (rare button clicks,
 *    command-style invocations — not conversation messages).
 *
 * Auth is required in lan/tunnel mode; localhost origins pass in local mode.
 *
 * If the warm server cannot start, prompt/new-session modes transparently
 * fall back to one-shot `opencode run --format json [--session <id>]`
 * (context still retained via the session id when one exists).
 */
export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { action, node, text } = body;

  // conversationId — client-generated per chat conversation. When absent
  // (older clients / non-terminal callers) each request gets a fresh
  // opencode session, preserving the previous one-shot behavior.
  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.trim()
      ? body.conversationId.trim()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ─── #63 (BATCH 13): warm-session classification inheritance ────────────
  // conversationId → the last APPLIED TaskClassification. Server-lifetime
  // map (dev/prod process memory): a restart is a cold session → fresh
  // classification, which is exactly the intended cold-session behavior.
  // Bounded so a long-lived server can't grow it unbounded.
  const priorClassification = classificationMemory.get(conversationId) ?? null;

  // ---- Permission reply ---------------------------------------------------
  // `permission` actions answer a pending OpenCode permission ask directly
  // via the warm server's /permission/{requestID}/reply endpoint — they are
  // NOT prompts (unlike `answer`, which is fed to the LLM as chat text).
  //
  // Issue #41: `respond-permission` is the card's action. It carries a
  // `decision` (once|always|reject) and, for `always`, the tool + pattern it
  // applies to — the grant is written to ~/.olympus/permissions.json so the
  // next ask for the same tool is settled by policy instead of by a card.
  // The legacy `permission` + `reply` shape stays supported so an older
  // client cannot strand a parked run.
  if (action === 'permission' || action === 'respond-permission') {
    const requestID = typeof body.requestID === 'string' ? body.requestID : '';
    const decision = action === 'respond-permission' ? body.decision : body.reply;
    if (!requestID || (decision !== 'once' && decision !== 'always' && decision !== 'reject')) {
      return NextResponse.json(
        { error: 'permission action requires requestID + reply (once|always|reject)' },
        { status: 400 },
      );
    }
    try {
      const ok = await respondToPermission(requestID, decision);
      // Persist the grant only when OpenCode accepted it, so a failed reply
      // cannot leave a rule the user thinks they set but that never applied.
      let granted = false;
      if (ok && decision === 'always') {
        const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
        if (tool) {
          const pattern = Array.isArray(body.patterns) && typeof body.patterns[0] === 'string' ? body.patterns[0] : '';
          grantAlways(tool, pattern);
          granted = true;
        }
      }
      return NextResponse.json({ ok, granted, error: ok ? undefined : 'OpenCode rejected the reply (unknown requestID or server unavailable)' }, { status: ok ? 200 : 502 });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || 'permission reply failed' }, { status: 500 });
    }
  }

  // ---- Permission policy (issue #47) --------------------------------------
  // `permissions-list` / `permissions-revoke` back the /permissions panel.
  // Both live here, under the same local-origin/auth guard as every other
  // action, and both answer with the full refreshed list so the panel never
  // has to guess what the file now says.
  if (action === 'permissions-list') {
    const policy = loadPermissions();
    return NextResponse.json({
      tools: policy.tools,
      paths: policy.paths,
      seededTools: [...SEED_TOOL_NAMES],
    });
  }

  if (action === 'permissions-revoke') {
    const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
    if (!tool) return NextResponse.json({ error: 'permissions-revoke requires tool' }, { status: 400 });
    // The list MUST be read after the revoke: revokeTool() -> commit() ->
    // resetPermissionCache() swaps in a brand-new policy object, so a snapshot
    // taken before the call still carries the row we just removed and the
    // panel would re-render the very tool it just revoked.
    const revoked = revokeTool(tool);
    const policy = loadPermissions();
    return NextResponse.json({
      ok: true,
      revoked,
      tools: policy.tools,
      paths: policy.paths,
      seededTools: [...SEED_TOOL_NAMES],
    });
  }

  // ---- Prompt mode -------------------------------------------------------
  // `answer` and `context` actions (from InteractiveTerminal) are treated as
  // follow-up prompts to Apollo, prefixed with a context marker.
  if (action === 'prompt' || action === 'answer' || action === 'context') {
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'missing text' }, { status: 400 });
    }

    // Classify prompt before spawning opencode for dynamic-context routing.
    // Pure heuristic classifier — no LLM call, runs in microseconds.
    // #63: warm-session continuation turns inherit god/class/budget from
    // the conversation's prior classification; cold sessions, explicit
    // redirects (structured godId=/god: or free-text "com Athena") and
    // explicit new-task markers re-classify. PetLove F3 evidence: the
    // approval turn "Recomendação sua pode seguir - nome PetLove" was
    // misrouted devops·simple→prometheus by fresh classification.
    const promptText = action === 'answer'
      ? `[User answer to your question] ${text}`
      : action === 'context'
        ? `[Additional context from user] ${text}`
        : text;
    const classification = classifyTurnWithInheritance(action, text, priorClassification);
    rememberConversationClassification(conversationId, classification);
    const classificationEnv = serializeClassification(classification);
    // Issue #51: caller-declared unattended run (probes / batch harnesses /
    // scheduled jobs). The classifier still sees the RAW prompt so routing
    // semantics do not shift between attended and unattended runs of the
    // same task; the directive is prepended only to the spawned run text.
    const unattended = action === 'prompt' && body.unattended === true;
    // Issue #54: in-band classification marker. The classification event
    // (below) and the plugin-side dispatch writers share this id — the
    // agreement metric gets an exact join key instead of ts-proximity.
    // In-band because the warm opencode serve is a shared, already-running
    // process that per-request env (OLYMPUS_TASK_CLASSIFICATION) cannot
    // reach; the env payload still carries the id for one-shot spawns.
    const classificationMarker = action === 'prompt'
      ? `[OLYMPUS-CLASSIFICATION id=${classification.classificationId} routeTo=${classification.routeTo}] `
      : '';
    const runText = unattended
      ? UNATTENDED_DIRECTIVE + classificationMarker + promptText
      : classificationMarker + promptText;

    // R-C: appendActivity for prompt (not answer/context) — durable run-start audit.
    if (action === 'prompt') {
      appendActivity({
        god: 'system',
        action: 'classification',
        msg: classification.reason,
        meta: {
          classificationId: classification.classificationId,
          domain: classification.domain,
          complexity: classification.complexity,
          routeTo: classification.routeTo,
          estimatedTokens: classification.estimatedTokens,
          needsPlanning: classification.needsPlanning,
        },
      });
    }

    return streamWarm(req, {
      conversationId,
      text: runText,
      agent: 'apollo',
      extraEnv: unattended
        ? { OLYMPUS_TASK_CLASSIFICATION: classificationEnv, OLYMPUS_UNATTENDED: '1' }
        : { OLYMPUS_TASK_CLASSIFICATION: classificationEnv },
      meta: { action, node: undefined, cli: `opencode run --format json --agent apollo <text>` },
      classification,
    });
  }

  // ---- New-session mode -------------------------------------------------
  // When the client sends a conversation summary via "New Session",
  // wrap it in a handoff prompt and continue on a FRESH opencode session
  // (the client rotates conversationId) with a clean context window but
  // carrying forward the previous session's context.
  if (action === 'new-session') {
    const summary = (typeof text === 'string' ? text : '').trim();
    if (!summary) {
      return NextResponse.json(
        { error: 'missing conversation summary (text)' },
        { status: 400 },
      );
    }

    // The handoff prompt is deliberately terse — Apollo is a smart agent
    // and doesn't need a verbose preamble. We tell it:
    //   1. This is a fresh session (new context window).
    //   2. Here's what we were just working on.
    //   3. Pick up where we left off — don't re-introduce, don't restart.
    //   4. Summary boundaries are explicit (---) so Apollo can't confuse
    //      them with its own output.
    const handoffPrompt = [
      'Starting a new session. The previous session\'s context window was filling up,',
      'so I\'m continuing the conversation here with a summary of where we left off.',
      '',
      '--- BEGIN SUMMARY OF PREVIOUS CONVERSATION ---',
      summary,
      '--- END SUMMARY OF PREVIOUS CONVERSATION ---',
      '',
      'Continue from where we left off. Pick up the thread naturally — do NOT restart',
      'the conversation, do NOT re-introduce yourself, and do NOT re-ask questions',
      'that were already answered in the summary. Treat the summary as your context',
      'and proceed with the next concrete step toward the user\'s goal.',
    ].join('\n');

    // Classify the handoff so the dynamic-context plugin routes the right
    // instincts in. We pass the summary through the classifier — if the
    // previous task was, say, a refactor, the new session keeps the same
    // instinct filtering.
    const classification = classifyTask(handoffPrompt);
    const classificationEnv = serializeClassification(classification);

    // R-C: appendActivity for new-session — durable run-start audit.
    appendActivity({
      god: 'system',
      action: 'classification',
      msg: classification.reason,
      meta: {
        domain: classification.domain,
        complexity: classification.complexity,
        routeTo: classification.routeTo,
        estimatedTokens: classification.estimatedTokens,
        needsPlanning: classification.needsPlanning,
      },
    });

    return streamWarm(req, {
      conversationId,
      text: handoffPrompt,
      agent: 'apollo',
      extraEnv: {
        OLYMPUS_TASK_CLASSIFICATION: classificationEnv,
        // Hint to the OLYMPUS overlay that this is a handoff — the
        // experimental.session.compacting hook can use this to tweak the
        // compaction prompt if it wants.
        OLYMPUS_NEW_SESSION: '1',
      },
      meta: { action, node: undefined, cli: `opencode run --format json --agent apollo <handoff>` },
      classification,
    });
  }

  // ---- True-reset mode ---------------------------------------------------
  // "New session" must genuinely RESET the context window. The 'new-session'
  // branch above cannot do that: it reuses the live warm serve (ensureServer
  // is a no-op while one is alive) and injects a transcript summary as the
  // first message, so the "fresh" session starts out holding the entire
  // previous conversation. Measured: 53% → 82% after one click.
  //
  // A real reset means tearing the serve down. opencode keeps session state
  // in the serve process (RAM + its SQLite store), so only a new process
  // gives a genuinely empty window. cleanupServer() kills the child, drops
  // the PID file and nulls the cached serverPromise; the following
  // ensureServer() therefore cold-starts a brand-new serve on the next free
  // port and logs "OpenCode server ready on port N (pid M)".
  //
  // Project registration lives in ~/.olympus (not in the serve), so it
  // survives untouched — as do the vault, permissions and instincts.
  if (action === 'reset-session') {
    try {
      cleanupServer();
      const server = await ensureServer();
      // Issue #21: drop the pre-reset conversation's session mapping. Its
      // `opencode serve` was just killed by cleanupServer(), so the entry is a
      // dangling reference — leaving it behind means a later context lookup on
      // that conversationId still reports the pre-reset percentage of a
      // session that no longer exists. The client sends the OLD id, captured
      // before it rotated to a fresh one.
      const forgotten = forgetConversation(body.conversationId || '');
      console.log(
        `[olympus-action] reset-session: fresh OpenCode server on port ${server.port} (warm=${server.warm}, pruned_stale_mapping=${forgotten})`,
      );
      return NextResponse.json({
        ok: true,
        port: server.port,
        warm: server.warm,
        authed: server.authed,
        prunedStaleMapping: forgotten,
      });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message || 'reset-session failed' },
        { status: 500 },
      );
    }
  }

  // ---- Context-menu action mode -----------------------------------------
  const valid = ['evolve', 'archive', 'promote', 'contradiction', 'lineage', 'prune', 'stocktake'];
  if (!valid.includes(action)) {
    return NextResponse.json({ error: `invalid action: ${action}` }, { status: 400 });
  }

  // Map the 7 UI actions to real Olympus commands.
  // Lifecycle actions go to Callimachus; status actions go to instinct-status.
  const cliArgs: Record<string, string[]> = {
    archive:                       ['/callimachus-heartbeat', '--deep'],
    evolve:                        ['/callimachus-heartbeat'],
    promote:                       ['/callimachus-heartbeat'],
    contradiction:                 ['/callimachus-heartbeat'],
    prune:                         ['/callimachus-heartbeat'],
    lineage:                       ['/instinct-status'],
    stocktake:                     ['/instinct-status'],
  };
  const args = cliArgs[action] || ['/instinct-status'];

  const child = spawnOpencode(
    ['run', '--format', 'json', ...args, '--agent', 'callimachus'],
    { extraEnv: { OLYMPUS_ACTION_NODE: node?.name || '' } },
  );

  return streamChild(child, { action, node: node?.name, cli: `opencode run ${args.join(' ')}` }, req);
}

// ---------------------------------------------------------------------------
// Shared opencode JSONL parsing
// ---------------------------------------------------------------------------

interface LineHandler {
  onLine: (line: string) => void;
  onStderr: (text: string) => void;
  getStderr: () => string;
  receivedOutput: boolean;
}

/**
 * Parse `opencode run --format json` output into UI events, mirroring the
 * opencode 1.18 event vocabulary (step_start / text / step_finish /
 * tool.call / tool.response / error). Shared by the one-shot streamChild
 * path and the warm-path fallback.
 */
function makeOpenCodeLineHandler(send: (ev: any) => void): LineHandler {
  const stderrBuf: string[] = [];
  let receivedOutput = false;

  const onLine = (line: string) => {
    const t = line.trim();
    if (!t) return;
    receivedOutput = true;
    // Try to parse as JSON (opencode --format json emits JSON lines).
    if (t.startsWith('{')) {
      try {
        const parsed = JSON.parse(t);
        // Surface opencode errors with a clear message.
        // opencode emits { type: 'error', error: { message, ... } }
        // or { error: { message, ... } } on API failures.
        if (parsed.type === 'error' || (parsed.error && !parsed.type)) {
          const errMsg = typeof parsed.error === 'string'
            ? parsed.error
            : parsed.error?.message || parsed.error?.name || JSON.stringify(parsed.error);
          send({ type: 'error', msg: `OpenCode error: ${errMsg}`, raw: parsed, ts: new Date().toISOString() });
          return;
        }
        // Forward other JSON events as-is.
        send(parsed);
        return;
      } catch {
        // Not valid JSON — fall through to log.
      }
    }
    send({ type: 'log', msg: t });
  };

  const onStderr = (text: string) => {
    receivedOutput = true;
    stderrBuf.push(text);
    const trimmed = text.trim();
    if (trimmed) send({ type: 'log', msg: trimmed, level: 'stderr' });
  };

  return {
    onLine,
    onStderr,
    getStderr: () => stderrBuf.join(''),
    get receivedOutput() { return receivedOutput; },
  };
}

/**
 * Shared SSE-streaming helper for spawned CLI children (context-menu actions).
 *
 * Features:
 *   1. Startup timeout — kills if no output within STARTUP_TIMEOUT_MS.
 *   2. Max runtime — kills after MAX_RUNTIME_MS.
 *   3. stderr/error surfacing — detects opencode JSON errors.
 *   4. JSON event parsing — parses and forwards `--format json` output.
 */
function streamChild(
  child: ChildProcess,
  meta: { action: string; node?: string; cli: string },
  req: NextRequest,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let killed = false;

      const send = (obj: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
      };

      const killChild = (reason: string) => {
        if (killed) return;
        killed = true;
        try { child.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
        if (!closed) {
          send({ type: 'error', msg: reason, ts: new Date().toISOString() });
          send({ type: 'action_done', action: meta.action, node: meta.node, code: -1, ts: new Date().toISOString() });
          try { controller.close(); } catch {}
          closed = true;
        }
      };

      send({ type: 'action_start', action: meta.action, node: meta.node, cli: meta.cli, ts: new Date().toISOString() });
      send({ type: 'log', msg: 'Starting OpenCode (this may take 5-10 seconds for the cold start)...', ts: new Date().toISOString() });

      const handler = makeOpenCodeLineHandler(send);
      const lineBuf: string[] = [];

      // Startup timeout — if no output within STARTUP_TIMEOUT_MS, kill + error.
      const startupTimer = setTimeout(() => {
        if (!handler.receivedOutput) {
          killChild(
            `OpenCode produced no output within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
            `This usually means: (1) the OPENCODE_GO_API_KEY / provider key is invalid or expired, ` +
            `(2) a free-tier endpoint (OpenRouter/Groq) is rate-limited — free models share a pool and ` +
            `can 429 during peak hours, so wait a minute and retry, or (3) the network is down. ` +
            `Check your keys in OpenCode (olympus opencode → Settings → Providers) and re-run ` +
            `npm run install-opencode -- --update if needed.`
          );
        }
      }, STARTUP_TIMEOUT_MS);

      // Max runtime — kill after MAX_RUNTIME_MS regardless.
      const maxRuntimeTimer = setTimeout(() => {
        killChild(`OpenCode exceeded the maximum runtime of ${MAX_RUNTIME_MS / 60000} minutes.`);
      }, MAX_RUNTIME_MS);

      child.stdout?.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        lineBuf.push(...lines);
        while (lineBuf.length > 1) handler.onLine(lineBuf.shift()!);
      });

      child.stderr?.on('data', (chunk) => {
        handler.onStderr(chunk.toString());
      });

      child.on('close', (code) => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        if (lineBuf.length) handler.onLine(lineBuf.shift()!);
        if (code !== 0 && handler.getStderr().length > 0 && !handler.receivedOutput) {
          const stderrText = handler.getStderr().trim();
          if (stderrText) {
            send({ type: 'error', msg: `OpenCode failed: ${stderrText.slice(0, 500)}`, ts: new Date().toISOString() });
          }
        }
        send({ type: 'action_done', action: meta.action, node: meta.node, code, ts: new Date().toISOString() });
        try { controller.close(); } catch {}
        closed = true;
      });

      child.on('error', (err: any) => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        send({ type: 'error', msg: `spawn error: ${err.message}`, ts: new Date().toISOString() });
        send({ type: 'action_done', action: meta.action, node: meta.node, code: -1, ts: new Date().toISOString() });
        try { controller.close(); } catch {}
        closed = true;
      });

      req.signal.addEventListener('abort', () => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        closed = true;
        try { child.kill('SIGTERM'); } catch {}
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ---------------------------------------------------------------------------
// Warm-session SSE streaming (prompt / answer / context / new-session)
// ---------------------------------------------------------------------------

interface WarmStreamOptions {
  conversationId: string;
  text: string;
  agent: string;
  extraEnv?: Record<string, string>;
  meta: { action: string; node?: string; cli: string };
  classification?: TaskClassification;
}

/**
 * Stream a conversation message through the warm opencode session.
 *
 * Flow:
 *   1. Send action_start.
 *   2. ensureServer() — the only cold start; if it fails, fall back to a
 *      one-shot `opencode run` (no session id — the server never came up).
 *   3. getOrCreateSession(conversationId) — reuses the conversation's
 *      opencode session (context retained).
 *   4. runWarmMessage() — maps the server's live event feed to UI events.
 *      If the run failed BEFORE any event was delivered and the message was
 *      never posted, fall back to one-shot with `--session <id>` (context
 *      still retained).
 *   5. action_done.
 */
function streamWarm(req: NextRequest, opts: WarmStreamOptions) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let firstEventAt: number | null = null;

      const send = (obj: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
      };

      const finish = (code: number) => {
        if (closed) return;
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        send({ type: 'action_done', action: opts.meta.action, node: opts.meta.node, code, ts: new Date().toISOString() });
        try { controller.close(); } catch {}
        closed = true;
      };

      // Issue #35: sessionId lands here once known; fail() may fire before
      // that (startup timeout), so hold it in a pre-declared holder (no TDZ).
      let errSessionId: string | null = null;
      const fail = (msg: string) => {
        if (closed) return;
        if (errSessionId) {
          try { markSessionError(errSessionId); } catch {}
        }
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        send({ type: 'error', msg, ts: new Date().toISOString() });
        finish(-1);
      };

      // Startup timeout — if no output within STARTUP_TIMEOUT_MS, kill + error.
      const startupTimer = setTimeout(() => {
        if (firstEventAt === null) {
          fail(
            `OpenCode produced no output within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
            `This usually means: (1) a provider key is invalid or expired, ` +
            `(2) a free-tier endpoint (OpenRouter/Groq) is rate-limited — free models share a pool and ` +
            `can 429 during peak hours, so wait a minute and retry, or (3) the network is down. ` +
            `Check your keys in OpenCode (olympus opencode → Settings → Providers) and re-run ` +
            `npm run install-opencode -- --update if needed.`
          );
        }
      }, STARTUP_TIMEOUT_MS);

      const maxRuntimeTimer = setTimeout(() => {
        fail(`OpenCode exceeded the maximum runtime of ${MAX_RUNTIME_MS / 60000} minutes.`);
      }, MAX_RUNTIME_MS);

      // onEvent wrapper — tracks first-event for the startup timeout and
      // routes events into the SSE stream.
      const onEvent = (ev: any) => {
        if (firstEventAt === null) firstEventAt = Date.now();
        send(ev);
      };

      // One-shot fallback: spawn `opencode run --format json` and stream it.
      const fallbackOneShot = (sessionId?: string) => {
        // Prepend the authoritative strategy block (same as the warm path) so
        // the model never infers the strategy from model IDs.
        const text = `${buildStrategyContextBlock()}\n\n${opts.text}`;
        const args = [
          'run', '--format', 'json',
          ...(sessionId ? ['--session', sessionId] : []),
          '--agent', opts.agent,
          text,
        ];
        send({ type: 'log', msg: `Falling back to one-shot: opencode ${args.join(' ').slice(0, 120)}…`, ts: new Date().toISOString() });
        const child = spawnOpencode(args, { extraEnv: opts.extraEnv });
        // Issue #58: route one-shot output through the SAME onEvent wrapper
        // the warm path uses, so firstEventAt is set on the first streamed
        // line and the 120s startup timer becomes a true no-OUTPUT bound.
        // Previously this passed `send` directly — firstEventAt stayed null
        // and the timer killed one-shot runs mid-output (12b probes B1/B2
        // died at exactly 120s while the process was streaming).
        const handler = makeOpenCodeLineHandler(onEvent);
        const lineBuf: string[] = [];
        child.stdout?.on('data', (chunk) => {
          lineBuf.push(...chunk.toString().split('\n'));
          while (lineBuf.length > 1) handler.onLine(lineBuf.shift()!);
        });
        child.stderr?.on('data', (chunk) => { handler.onStderr(chunk.toString()); });
        child.on('close', (code) => {
          if (lineBuf.length) handler.onLine(lineBuf.shift()!);
          if (code !== 0 && handler.getStderr().length > 0 && !handler.receivedOutput) {
            const stderrText = handler.getStderr().trim();
            if (stderrText) send({ type: 'error', msg: `OpenCode failed: ${stderrText.slice(0, 500)}`, ts: new Date().toISOString() });
          }
          finish(code ?? -1);
        });
        child.on('error', (err: any) => {
          fail(`spawn error: ${err.message}`);
        });
        req.signal.addEventListener('abort', () => {
          closed = true;
          try { child.kill('SIGTERM'); } catch {}
        });
      };

      (async () => {
        send({ type: 'action_start', action: opts.meta.action, node: opts.meta.node, cli: opts.meta.cli, ts: new Date().toISOString() });

        // Emit classification immediately after action_start — first thing the
        // user sees in the 66s window (R-A).
        if (opts.classification) {
          const c = opts.classification;
          send({
            type: 'classification',
            classification: c,
            ts: new Date().toISOString(),
          });
        }

        // 1. Warm server (only cold start). Failure → one-shot without session.
        let server;
        try {
          server = await ensureServer();
        } catch (err: any) {
          if (closed) return;
          send({ type: 'log', msg: `OpenCode server unavailable (${err?.message || 'unknown error'}) — using one-shot run.`, ts: new Date().toISOString() });
          fallbackOneShot(undefined);
          return;
        }
        if (closed) return;

        send({
          type: 'log',
          msg: server.warm
            ? 'Connected to the warm OpenCode session — no cold start, continuing the conversation.'
            : 'Starting OpenCode (cold start — this may take 5-10 seconds)...',
          ts: new Date().toISOString(),
        });

        // 2. Conversation → opencode session.
        let sessionId: string;
        try {
          sessionId = await getOrCreateSession(opts.conversationId);
        } catch (err: any) {
          if (closed) return;
          send({ type: 'log', msg: `Session setup failed (${err?.message || 'unknown error'}) — using one-shot run.`, ts: new Date().toISOString() });
          fallbackOneShot(undefined);
          return;
        }
        if (closed) return;
        errSessionId = sessionId;

        // 3. Run the message on the warm session.
        const result = await runWarmMessage({
          sessionId,
          text: opts.text,
          agent: opts.agent,
          onEvent,
          signal: req.signal,
          maxRuntimeMs: MAX_RUNTIME_MS,
        });
        if (closed) return;

        if (result.code === 0) {
          finish(0);
          return;
        }

        // 4. Server-level failure before anything was delivered AND the
        //    message was never posted → safe one-shot fallback (context
        //    retained via --session). API/provider errors are surfaced as-is.
        if (!result.receivedEvents && !result.postStarted) {
          send({ type: 'log', msg: `Warm session interrupted (${result.error || 'error'}) — retrying once via one-shot run.`, ts: new Date().toISOString() });
          fallbackOneShot(sessionId);
          return;
        }
        if (result.error && result.error !== 'aborted') {
          fail(`OpenCode run failed: ${result.error}`);
          return;
        }
        finish(result.code);
      })().catch((err: any) => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        fail(`Unexpected error: ${err?.message || String(err)}`);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
