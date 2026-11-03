#!/usr/bin/env node
/**
 * mobile-tunnel.ts — start/stop/status the remote companion lane.
 * Usage: npx tsx scripts/mobile-tunnel.ts start|stop|status
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { startTunnel, stopTunnel, tunnelStatus } from '../src/lib/mobile-tunnel';

const cmd = process.argv[2] || 'status';
(async () => {
  if (cmd === 'start') {
    const s = await startTunnel();
    console.log(JSON.stringify(s, null, 2));
  } else if (cmd === 'stop') {
    console.log(JSON.stringify(stopTunnel(), null, 2));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(tunnelStatus(), null, 2));
  } else {
    console.error('usage: mobile-tunnel.ts start|stop|status');
    process.exit(2);
  }
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
