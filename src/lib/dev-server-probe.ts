/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * dev-server-probe — #102 (MADRUGA-PREVIEW-1 Batch A): the Live Preview
 * TCP probe, dual-stack.
 *
 * The old route probed 127.0.0.1 ONLY and the old component guessed
 * `http://127.0.0.1:<port>` for the iframe. Node >= 17 can bind a dev
 * server `::1`-only on some boxes, which the old probe would report as
 * offline forever. This probe checks BOTH loopback stacks in parallel and
 * returns the REACHABLE url — the iframe and the "open ↗" link use it, so
 * the panel loads whatever stack the dev server actually bound.
 */

import net from 'net';

export interface DevServerProbe {
  /** true when a TCP connect succeeded on either loopback stack. */
  running: boolean;
  /** Which loopback stack answered — ipv4 preferred on simultaneous success. */
  host: 'ipv4' | 'ipv6' | null;
  /** The REACHABLE url (bracketed for IPv6) — what the iframe should load. */
  url: string;
  /** Wall-clock ms until the probe settled. */
  responseTimeMs: number;
}

/** One TCP connect attempt. Resolves true/false — never rejects. */
function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    let done = false;
    const fin = (ok: boolean) => {
      if (done) return;
      done = true;
      try { s.destroy(); } catch {}
      resolve(ok);
    };
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));
    s.once('error', () => fin(false));
    try { s.connect(port, host); } catch { fin(false); }
  });
}

/**
 * Probe a dev-server port on both loopback stacks (127.0.0.1 AND ::1) in
 * parallel. First connect wins between success and failure; when BOTH
 * succeed (loopback connects are near-simultaneous), ipv4 wins — the
 * conventional url. Boxes without ::6 loopback degrade to ipv4-only
 * behavior (the ::1 connect fails instantly) — no special-casing needed.
 */
export async function probeDevServer(port: number, timeoutMs = 1500): Promise<DevServerProbe> {
  const start = Date.now();
  const result = await new Promise<'ipv4' | 'ipv6' | null>((resolve) => {
    let v4done = false, v6done = false, v4ok = false, v6ok = false;
    const settle = () => {
      if (v4ok) return resolve('ipv4');
      if (v6ok && v4done) return resolve('ipv6');
      if (v4done && v6done) return resolve(null);
    };
    tcpConnect('127.0.0.1', port, timeoutMs).then(ok => { v4done = true; v4ok = ok; settle(); });
    tcpConnect('::1', port, timeoutMs).then(ok => { v6done = true; v6ok = ok; settle(); });
  });
  const responseTimeMs = Date.now() - start;
  if (result === 'ipv4') return { running: true, host: 'ipv4', url: `http://127.0.0.1:${port}`, responseTimeMs };
  if (result === 'ipv6') return { running: true, host: 'ipv6', url: `http://[::1]:${port}`, responseTimeMs };
  return { running: false, host: null, url: `http://127.0.0.1:${port}`, responseTimeMs };
}
