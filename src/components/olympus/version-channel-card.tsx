/**
 * version-channel-card.tsx — v0.0.81: the stable plug in Settings.
 *
 * Shows the RUNNING version, the STABLE version and its test evidence, and
 * the channel. The stable manifest is written only by a green battery
 * (`scripts/mark-stable.mjs`). Development versions are selectable only when
 * stable is disabled; the binary swap belongs to the v0.1.0 installer.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Stable {
  version: string;
  tag: string;
  stable: boolean;
  tests: { pass: number; fail: number; skip: number; suites: number };
  releasedAt: string;
  commit?: string;
  note?: string;
}
interface VersionRow { version: string; tag: string; stable: boolean }
interface VersionData {
  current: string;
  stable: Stable | null;
  versions: VersionRow[];
  channel: { channel: 'stable' | 'development'; version: string | null };
}

export default function VersionChannelCard() {
  const [data, setData] = useState<VersionData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/version', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d as VersionData);
      setError(null);
    } catch (e: any) { setError(e?.message || 'version unavailable'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setChannel = useCallback(async (channel: 'stable' | 'development', version: string | null = null) => {
    setBusy(true);
    try {
      const r = await fetch('/api/olympus/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, version }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      await load();
    } catch (e: any) { setError(e?.message || 'could not set the channel'); }
    finally { setBusy(false); }
  }, [load]);

  if (!data && !error) return null;
  const dev = data?.channel.channel === 'development';
  const stable = data?.stable;

  return (
    <section className="rounded-lg border border-olympus-gold/15 bg-olympus-card/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <BadgeCheck size={12} className="text-olympus-green" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-olympus-text">version</span>
        <button onClick={() => void load()} aria-label="Refresh version" className="ml-auto text-olympus-text-dim hover:text-olympus-gold">
          <RefreshCw size={10} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono">
        <span className="text-olympus-text-dim">running <span className="text-olympus-gold">v{data?.current ?? '—'}</span></span>
        <span className="text-olympus-text-dim">stable <span className="text-olympus-green">{stable ? `v${stable.version}` : '—'}</span></span>
        {stable && (
          <span className={`${stable.tests.fail === 0 ? 'text-olympus-green' : 'text-olympus-red'}`}>
            {stable.tests.pass}/{stable.tests.suites} passed · {stable.tests.fail} fail · {stable.tests.skip} skip
          </span>
        )}
      </div>

      {stable ? (
        <p className="text-[8px] font-mono text-olympus-text-dim leading-relaxed">
          {stable.tag} · {new Date(stable.releasedAt).toLocaleString()}{stable.commit ? ` · ${stable.commit}` : ''}
        </p>
      ) : (
        <p className="text-[8px] font-mono text-olympus-text-dim leading-relaxed">
          No stable manifest yet. The release gate writes it only after a green battery (<code className="text-olympus-gold">scripts/mark-stable.mjs</code>).
        </p>
      )}

      <div className="flex items-center gap-2">
        <Switch
          checked={dev}
          onCheckedChange={(v) => void setChannel(v ? 'development' : 'stable', v ? (data?.channel.version ?? null) : null)}
          aria-label="Enable development versions"
        />
        <span className="text-[9px] font-mono text-olympus-text-dim">
          development versions {dev ? 'enabled' : 'disabled (stable only)'}
        </span>
      </div>

      {dev && (
        <div className="flex items-center gap-1.5">
          <GitBranch size={10} className="text-olympus-cyan" />
          <select
            value={data?.channel.version ?? stable?.version ?? ''}
            onChange={(e) => void setChannel('development', e.target.value || null)}
            disabled={busy}
            className="min-w-0 flex-1 rounded border border-olympus-gold/20 bg-olympus-bg px-1.5 py-1 text-[9px] font-mono text-olympus-text"
            aria-label="Development version"
          >
            <option value="">latest development</option>
            {(data?.versions ?? []).filter((v) => !v.stable).map((v) => (
              <option key={v.tag} value={v.version}>{v.tag}</option>
            ))}
          </select>
          {busy && <Loader2 size={10} className="animate-spin text-olympus-gold" />}
        </div>
      )}

      <p className="text-[7.5px] font-mono text-olympus-text-dim leading-relaxed">
        The channel is a declaration; the binary swap lands with the v0.1.0 installer/updater. Stable is never a hand-written label: it is the last green battery.
      </p>
      {error && <p className="text-[8px] font-mono text-olympus-red">{error}</p>}
    </section>
  );
}
