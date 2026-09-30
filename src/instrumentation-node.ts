/**
 * Olympus Instrumentation — Node.js-only module.
 *
 * Starts a WebSocket bridge on 127.0.0.1:3738 that the browser interactive
 * terminal connects to. The first inbound WS message is the user's prompt
 * and is dispatched to Apollo via `opencode run --agent apollo`.
 * Subsequent messages are forwarded to the OpenCode child's stdin so the
 * user can answer Apollo's clarifying questions inline.
 *
 * `eval()` is used for `require(...)` calls so Turbopack cannot statically
 * trace the dynamic CLI path (which would cause "Module not found" build
 * errors during `next build`).
 */

export async function registerNode() {
  const http = eval('require("http")');
  const { WebSocketServer } = eval('require("ws")');
  const path = eval('require("path")');
  const fs = eval('require("fs")');
  const os = eval('require("os")');

  // v0.0.21 — Global crash protection.
  //   The ttyd/vscodium launchers create child processes with logStreams.
  //   If a logStream emits an 'error' event without a listener (e.g. disk
  //   full, file locked), Node.js throws an uncaughtException that CRASHES
  //   the dev server. The per-stream fixes (logStream.on('error', () => {}))
  //   handle the direct cause, but this global handler is a safety net for
  //   any OTHER unhandled errors that might slip through.
  process.on('uncaughtException', (err: any) => {
    console.error('[olympus] uncaughtException (suppressed):', err.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[olympus] unhandledRejection (suppressed):', reason);
  });

  const WS_BRIDGE_HOST = '127.0.0.1';
  const WS_BRIDGE_PORT = 3738;

  if ((globalThis as any).__olympusWsBridge?.ready) return;

  function getNetworkMode(): string {
    try {
      return fs.readFileSync(path.join(os.homedir(), '.olympus', 'network-mode'), 'utf-8').trim() || 'local';
    } catch { return 'local'; }
  }

  function getSessionToken(): string | null {
    try {
      return fs.readFileSync(path.join(os.homedir(), '.olympus', 'session-token'), 'utf-8').trim() || null;
    } catch { return null; }
  }

  function handleConnection(ws: any, req: any) {
    const url = new URL(req.url || '/ws', `http://${WS_BRIDGE_HOST}:${WS_BRIDGE_PORT}`);
    const token = url.searchParams.get('token') || req.headers['x-olympus-token'] || '';
    const mode = getNetworkMode();
    if (mode !== 'local') {
      const expected = getSessionToken();
      if (!expected || token !== expected) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Unauthorized', ts: new Date().toISOString() }));
        ws.close(4001, 'unauthorized');
        return;
      }
    }

    let child: any = null;
    let stdoutBuf = '';
    let stderrBuf = '';
    let closed = false;

    function sendToClient(obj: any) {
      if (closed || ws.readyState !== ws.OPEN) return;
      try { ws.send(JSON.stringify(obj)); } catch {}
    }

    function cleanup() {
      if (closed) return;
      closed = true;
      if (child && !child.killed) {
        try { child.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { if (child && !child.killed) child.kill('SIGKILL'); } catch {} }, 2000);
      }
    }

    ws.on('message', (data: any) => {
      const text = data.toString();
      if (!child) {
        try {
          const root = process.env.OLYMPUS_ROOT || process.cwd();
          // Session 3g/#25 — this spawn bypasses buildOpencodeEnv, so without the
          // flag the plugin gate would silence it (spend un-tracked). Marking it
          // OLYMPUS-managed keeps the run tracked if the WS bridge revives.
          const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', OLYMPUS_JSON: '1', OLYMPUS_MANAGED: '1' };
          const _spawn = eval('require("child_process").spawn');
          // Spawn the global `opencode` binary directly with shell:false so
          // the user's prompt text is passed VERBATIM as a single argv
          // element (no cmd.exe re-parse, no shell-metacharacter injection).
          child = _spawn('opencode', ['run', '--agent', 'apollo', text], {
            cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
          });

          child.stdout?.on('data', (chunk: any) => {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split('\n'); stdoutBuf = lines.pop() || '';
            for (const line of lines) {
              const t = line.trim(); if (!t) continue;
              if (t.startsWith('{')) { try { sendToClient(JSON.parse(t)); } catch { sendToClient({ type: 'log', msg: t, ts: new Date().toISOString() }); } }
              else sendToClient({ type: 'log', msg: t, ts: new Date().toISOString() });
            }
          });

          child.stderr?.on('data', (chunk: any) => {
            stderrBuf += chunk.toString();
            const lines = stderrBuf.split('\n'); stderrBuf = lines.pop() || '';
            for (const line of lines) {
              const t = line.trim(); if (!t) continue;
              sendToClient({ type: 'log', msg: t, level: 'stderr', ts: new Date().toISOString() });
            }
          });

          child.on('close', (code: any) => {
            if (stdoutBuf.trim()) {
              const t = stdoutBuf.trim();
              if (t.startsWith('{')) { try { sendToClient(JSON.parse(t)); } catch { sendToClient({ type: 'log', msg: t, ts: new Date().toISOString() }); } }
            }
            sendToClient({ type: 'action_done', action: 'prompt', code: code ?? 0, ts: new Date().toISOString() });
            cleanup();
            try { ws.close(1000); } catch {}
          });

          child.on('error', (err: any) => {
            sendToClient({ type: 'error', msg: `Failed to start opencode: ${err.message}`, ts: new Date().toISOString() });
            sendToClient({ type: 'action_done', action: 'prompt', code: -1, ts: new Date().toISOString() });
            cleanup();
            try { ws.close(1011); } catch {}
          });
        } catch (e: any) {
          sendToClient({ type: 'error', msg: `Spawn failure: ${e.message}`, ts: new Date().toISOString() });
          try { ws.close(1011); } catch {}
          return;
        }
        return;
      }
      const stdin = child.stdin;
      if (stdin && !child.killed) {
        try { stdin.write(text.replace(/\r?\n$/, '') + '\n'); } catch {}
      }
    });

    ws.on('close', () => { cleanup(); });
    ws.on('error', () => { cleanup(); });
    sendToClient({ type: 'ws_connected', ts: new Date().toISOString() });
  }

  try {
    const httpServer = http.createServer((_req: any, res: any) => {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('WebSocket connection required.');
    });
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    wss.on('connection', handleConnection);
    (globalThis as any).__olympusWsBridge = { server: wss, httpServer, ready: false, sessions: new Map(), host: WS_BRIDGE_HOST, port: WS_BRIDGE_PORT };
    httpServer.listen(WS_BRIDGE_PORT, WS_BRIDGE_HOST, () => {
      (globalThis as any).__olympusWsBridge.ready = true;
      console.log(`[olympus-ws] WebSocket bridge listening on ws://${WS_BRIDGE_HOST}:${WS_BRIDGE_PORT}/ws`);
    });
    httpServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        (globalThis as any).__olympusWsBridge.ready = true;
        console.log(`[olympus-ws] Port ${WS_BRIDGE_PORT} in use — another worker is serving.`);
      } else { console.error('[olympus-ws] error:', err.message); }
    });
  } catch (e: any) { console.error('[olympus-ws] Failed to start:', e.message); }
}
