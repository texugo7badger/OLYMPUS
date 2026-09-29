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
  getOrCreateSession,
  runWarmMessage,
  buildStrategyContextBlock,
  respondToPermission,
} from '@/lib/opencode-session';
// Dynamic input token routing via task classifier.
import { classifyTask, serializeClassification } from '@/lib/task-classifier';
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

  // ---- Permission reply ---------------------------------------------------
  // `permission` actions answer a pending OpenCode permission ask directly
  // via the warm server's /permission/{requestID}/reply endpoint — they are
  // NOT prompts (unlike `answer`, which is fed to the LLM as chat text).
  if (action === 'permission') {
    const requestID = typeof body.requestID === 'string' ? body.requestID : '';
    const reply = body.reply;
    if (!requestID || (reply !== 'once' && reply !== 'always' && reply !== 'reject')) {
      return NextResponse.json(
        { error: 'permission action requires requestID + reply (once|always|reject)' },
        { status: 400 },
      );
    }
    try {
      const ok = await respondToPermission(requestID, reply);
      return NextResponse.json({ ok, error: ok ? undefined : 'OpenCode rejected the reply (unknown requestID or server unavailable)' }, { status: ok ? 200 : 502 });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || 'permission reply failed' }, { status: 500 });
    }
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
    const promptText = action === 'answer'
      ? `[User answer to your question] ${text}`
      : action === 'context'
        ? `[Additional context from user] ${text}`
        : text;
    const classification = classifyTask(promptText);
    const classificationEnv = serializeClassification(classification);

    return streamWarm(req, {
      conversationId,
      text: promptText,
      agent: 'apollo',
      extraEnv: { OLYMPUS_TASK_CLASSIFICATION: classificationEnv },
      meta: { action, node: undefined, cli: `opencode run --format json --agent apollo <text>` },
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
    });
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

      const fail = (msg: string) => {
        if (closed) return;
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
        const handler = makeOpenCodeLineHandler(send);
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
