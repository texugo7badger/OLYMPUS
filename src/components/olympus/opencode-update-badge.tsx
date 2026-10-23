/**
 * opencode-update-badge — the honest OpenCode v2 update indicator (#212).
 *
 * The v2 CLI never auto-updates under OLYMPUS (OPENCODE_DISABLE_AUTOUPDATE=1
 * on every spawn); the boot check compares the installed binary with the
 * npm `latest` tag. This badge renders ONLY when an update is actually
 * available (or after an apply) — an unreachable registry renders nothing,
 * never a false "up to date" claim.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import OlympusTooltip from './olympus-tooltip';

interface UpdateStatus {
  ok: boolean;
  installed: string | null;
  latest: string | null;
  updateAvailable: boolean;
  error?: string;
}

export default function OpencodeUpdateBadge() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/olympus/opencode-update', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: UpdateStatus) => { if (live) setStatus(d); })
      .catch(() => { /* unknown is not "available" — render nothing */ });
    return () => { live = false; };
  }, []);

  const apply = useCallback(async () => {
    setApplying(true);
    setResult(null);
    try {
      const r = await fetch('/api/olympus/opencode-update', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        setResult({ ok: true, msg: `OpenCode ${d.installed ?? d.latest} installed — restart OLYMPUS to load it.` });
        setStatus((prev) => prev ? { ...prev, updateAvailable: false, installed: d.installed ?? prev.installed } : prev);
      } else {
        setResult({ ok: false, msg: d.error || 'update failed' });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || 'update failed' });
    } finally {
      setApplying(false);
    }
  }, []);

  if (result) {
    return (
      <span
        title={result.msg}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded ring-1 ${result.ok ? 'bg-olympus-green/10 ring-olympus-green/25 text-olympus-green' : 'bg-olympus-red/10 ring-olympus-red/25 text-olympus-red'}`}
      >
        {result.ok ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}
        <span className="text-[8px] font-mono">{result.ok ? 'restart' : 'failed'}</span>
      </span>
    );
  }

  if (!status?.updateAvailable) return null;

  return (
    <OlympusTooltip
      content={`OpenCode ${status.installed ?? '?'} → ${status.latest} available. Click to install (OLYMPUS controls the update lane; the warm server loads it on restart).`}
      side="bottom"
    >
      <button
        onClick={apply}
        disabled={applying}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-olympus-gold/15 ring-1 ring-olympus-gold/30 text-olympus-gold hover:bg-olympus-gold/25 transition-colors"
      >
        {applying ? <Loader2 size={9} className="animate-spin" /> : <ArrowUpCircle size={9} />}
        <span className="text-[8px] font-mono">v{status.latest}</span>
      </button>
    </OlympusTooltip>
  );
}
