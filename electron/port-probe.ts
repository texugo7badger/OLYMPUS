/**
 * electron/port-probe.ts — v0.0.98-11: the boot watchdog's ownership proof.
 *
 * The health route can be slow under a walk while the TCP port is alive.
 * Before spawning a second Next on 3737, the watchdog asks the socket, not
 * the overloaded HTTP handler.
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
