/**
 * port-probe.ts — v0.0.98-11: the boot watchdog's two truths.
 *
 * The 2026-11-23 audit found 174 EADDRINUSE lines: the health route can be
 * slow during a walk while the TCP port is perfectly alive, so an HTTP-only
 * probe decided "dead" and spawned a second Next on 3737. A TCP connect is
 * the ownership proof; HTTP is the readiness proof.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import net from 'node:net';

export function isPortListening(host: string, port: number, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host || !Number.isInteger(port) || port <= 0) return resolve(false);
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* gone */ }
      resolve(value);
    };
    socket.setTimeout(Math.max(100, timeoutMs));
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export interface HttpProbe {
  ok: boolean;
  status: number | null;
  ms: number;
  error: string | null;
}

export async function probeHttp(url: string, timeoutMs = 1500): Promise<HttpProbe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(100, timeoutMs));
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    try { await res.arrayBuffer(); } catch { /* body is not the probe */ }
    return { ok: res.status < 500, status: res.status, ms: Date.now() - started, error: null };
  } catch (e: any) {
    return { ok: false, status: null, ms: Date.now() - started, error: String(e?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}
