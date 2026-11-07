'use client';

/**
 * MobilePairDialog — the desktop half of the companion (v0.0.58).
 *
 * Shows one QR that carries the LAN URL + the existing session token in the
 * fragment, the mode (local/lan/tunnel), a copy for the raw URL, token
 * rotation (revokes every paired phone) and the explicit LAN switch.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Copy, RefreshCw, X, Loader2, Wifi, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type Pair = {
  ok?: boolean;
  mode?: string;
  port?: number;
  addresses?: string[];
  token?: string;
  url?: string;
  widgetUrl?: string;
  widgetSecure?: boolean;
  urlSecure?: boolean;
  qr?: string | null;
  widgetQr?: string | null;
  themeName?: string;
  qrDark?: string;
  qrLight?: string;
  qrAccent?: string;
  lanReady?: boolean;
  note?: string;
  error?: string;
};

export default function MobilePairDialog({ onClose }: { onClose: () => void }) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [modeNote, setModeNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ running?: boolean; url?: string | null; pid?: number | null; binary?: string | null } | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);

  // v0.0.60 — in LAN mode the pair route requires the bearer token. The
  // renderer gets it from the main process over IPC (never over HTTP).
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const token = await (window as any).olympus?.sessionToken?.();
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
  }, []);

  const loadRemote = useCallback(async () => {
    try {
      const res = await fetch('/api/olympus/mobile/tunnel', { cache: 'no-store', headers: await authHeaders() });
      const d = await res.json();
      if (res.ok && d?.ok) setRemote(d);
    } catch { /* no tunnel state */ }
  }, [authHeaders]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/olympus/mobile/pair', { cache: 'no-store', headers: await authHeaders() });
      const d = await res.json();
      if (!res.ok || d?.ok === false) throw new Error(d?.error || `HTTP ${res.status}`);
      setPair(d);
    } catch (e: any) {
      setError(e?.message || 'could not build the pair payload');
    } finally {
      setBusy(false);
    }
    void loadRemote();
  }, [authHeaders, loadRemote]);

  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/olympus/mobile/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok || d?.ok === false) throw new Error(d?.error || `HTTP ${res.status}`);
      setPair(d);
      if (d?.restartRequired) setModeNote(d.note || 'Restart OLYMPUS to apply the new bind.');
    } catch (e: any) {
      setError(e?.message || 'pairing update failed');
    } finally {
      setBusy(false);
    }
  };

  const tunnelAction = async (action: 'start' | 'stop') => {
    setRemoteBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/olympus/mobile/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok || d?.ok === false) throw new Error(d?.error || `HTTP ${res.status}`);
      setRemote(d);
      // Rebuild the pair payload so the widget QR switches to HTTPS.
      void load();
    } catch (e: any) {
      setError(e?.message || 'tunnel failed');
    } finally { setRemoteBusy(false); }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard denied */ }
  };

  const token = pair?.token || '';
  const masked = token ? `${token.slice(0, 6)}…${token.slice(-4)}` : '—';

  return (
    <div className="fixed inset-0 z-[420] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label="Mobile companion pairing">
      <div className="w-full max-w-md rounded-2xl border border-olympus-gold/20 bg-olympus-panel shadow-2xl overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/10">
          <Smartphone size={14} className="text-olympus-gold" />
          <span className="text-[12px] font-mono font-semibold text-olympus-text">Mobile companion</span>
          <button onClick={onClose} aria-label="Close mobile pairing" className="ml-auto text-olympus-text-dim hover:text-olympus-red">
            <X size={14} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <p className="text-[10px] font-mono text-olympus-text-dim leading-relaxed">
            Um QR, um app: escaneie para abrir o OLYMPUS no celular — campanha, projetos,
            prompt por texto/voz, preview e o widget (pelo cabeçalho do app).
          </p>

          {error && (
            <div className="rounded-lg border border-olympus-red/40 bg-olympus-red/10 px-2.5 py-2 text-[10px] font-mono text-olympus-red">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-2 rounded-xl border border-olympus-gold/10 bg-olympus-bg/50 p-3">
            {busy && !pair ? (
              <div className="h-40 w-40 flex items-center justify-center">
                <Loader2 size={22} className="animate-spin text-olympus-gold" />
              </div>
            ) : pair?.qr ? (
              <div
                className="rounded-2xl p-2 shadow-lg"
                style={{ background: pair?.qrLight || '#F4EFE6', border: `1px solid ${pair?.qrAccent || '#D4A574'}66` }}
              >
                <img src={pair?.qr || ''} alt="OLYMPUS app QR" width={180} height={180} className="rounded-lg" />
                <div className="mt-1.5 text-center text-[8px] font-mono uppercase tracking-[0.24em]" style={{ color: pair?.qrDark || '#0A0E16' }}>
                  {pair?.themeName || 'OLYMPUS'} · app
                </div>
              </div>
            ) : (
              <div className="h-40 w-40 flex items-center justify-center text-center text-[10px] font-mono text-olympus-text-dim px-3">
                no QR — use the URL and token below
              </div>
            )}
            {pair && !pair.urlSecure && (
              <p className="text-center text-[8px] font-mono text-olympus-gold/80">
                para instalar como PWA e usar a voz, inicie o túnel HTTPS abaixo e o QR se atualiza
              </p>
            )}
            <div className="w-full flex items-center gap-1.5">
              <code className="flex-1 min-w-0 truncate text-[9px] font-mono text-olympus-text">{pair?.url || '—'}</code>
              <button
                onClick={() => { const u = pair?.url; if (u) void copy(u, 'url'); }}
                disabled={!pair?.url}
                className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold disabled:opacity-40"
              >
                <Copy size={9} /> {copied === 'url' ? 'copied' : 'copy'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[9px] font-mono">
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', pair?.lanReady ? 'bg-olympus-green/10 text-olympus-green' : 'bg-olympus-amber-soft/10 text-olympus-amber-soft')}>
              <Wifi size={9} /> {pair?.mode || 'local'}
            </span>
            <span className="text-olympus-text-dim">port {pair?.port || 3737}</span>
            <span className="ml-auto text-olympus-text-dim">{pair?.addresses?.length || 0} LAN address(es)</span>
          </div>

          <div className="rounded-xl border border-olympus-gold/15 bg-olympus-bg/50 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Wifi size={10} className={remote?.running ? 'text-olympus-green' : 'text-olympus-text-dim'} />
              <span className="text-[9px] font-mono uppercase tracking-wide text-olympus-text-dim">remote · internet</span>
              <span className={cn('ml-auto text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full', remote?.running ? 'bg-olympus-green/10 text-olympus-green' : 'bg-olympus-gold/10 text-olympus-text-dim')}>
                {remote?.running ? 'online' : 'off'}
              </span>
            </div>
            {remote?.running && remote.url ? (
              <>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 min-w-0 truncate text-[9px] font-mono text-olympus-text">{remote.url}</code>
                  <button
                    onClick={() => void copy(`${remote.url}/m#t=${encodeURIComponent(token)}`, 'remote')}
                    className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-green/10 text-olympus-green"
                  >
                    <Copy size={9} /> {copied === 'remote' ? 'copied' : 'link'}
                  </button>
                </div>
                <button onClick={() => void tunnelAction('stop')} disabled={remoteBusy} className="text-[9px] font-mono text-olympus-red/80 hover:text-olympus-red disabled:opacity-40">
                  stop the tunnel
                </button>
              </>
            ) : (
              <>
                <p className="text-[8px] font-mono text-olympus-text-dim leading-relaxed">
                  A Cloudflare quick tunnel gives the phone an HTTPS link that works outside the house. The token still gates the prompts.
                </p>
                <button
                  onClick={() => void tunnelAction('start')}
                  disabled={remoteBusy || !remote?.binary}
                  className="w-full rounded-lg border border-olympus-green/30 bg-olympus-green/10 text-olympus-green px-2 py-1.5 text-[9px] font-mono disabled:opacity-40"
                >
                  {remoteBusy ? 'starting…' : remote?.binary ? 'start remote tunnel' : 'cloudflared not installed'}
                </button>
              </>
            )}
          </div>

          <div className="rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 px-2.5 py-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={10} className="text-olympus-green" />
              <span className="text-[9px] font-mono uppercase tracking-wide text-olympus-text-dim">session token</span>
              <button onClick={() => setReveal((v) => !v)} className="ml-auto text-[9px] font-mono text-olympus-text-dim hover:text-olympus-text">
                {reveal ? 'hide' : 'reveal'}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 min-w-0 truncate text-[9px] font-mono text-olympus-text">{reveal ? token : masked}</code>
              <button
                onClick={() => token && void copy(token, 'token')}
                disabled={!token}
                className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold disabled:opacity-40"
              >
                <Copy size={9} /> {copied === 'token' ? 'copied' : 'copy'}
              </button>
              <button
                onClick={() => void post({ action: 'rotate' })}
                disabled={busy}
                aria-label="Rotate token (revokes paired phones)"
                className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-red/10 text-olympus-red disabled:opacity-40"
              >
                <RefreshCw size={9} className={busy ? 'animate-spin' : ''} /> rotate
              </button>
            </div>
            <p className="text-[8px] font-mono text-olympus-text-dim leading-relaxed">
              Rotating revokes every paired phone. The token is stored at ~/.olympus/session-token (0600).
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void post({ action: 'set-mode', mode: 'lan' })}
              disabled={busy || pair?.mode === 'lan'}
              className="flex-1 rounded-lg bg-olympus-gold/15 text-olympus-gold border border-olympus-gold/30 px-2 py-1.5 text-[9px] font-mono disabled:opacity-40"
            >
              enable LAN
            </button>
            <button
              onClick={() => void post({ action: 'set-mode', mode: 'local' })}
              disabled={busy || pair?.mode === 'local'}
              className="flex-1 rounded-lg bg-olympus-bg border border-olympus-gold/10 px-2 py-1.5 text-[9px] font-mono text-olympus-text-dim disabled:opacity-40"
            >
              loopback only
            </button>
          </div>

          {modeNote && (
            <p className="text-[9px] font-mono text-olympus-amber-soft leading-relaxed">{modeNote}</p>
          )}
          {pair?.note && !modeNote && (
            <p className="text-[9px] font-mono text-olympus-text-dim leading-relaxed">{pair.note}</p>
          )}
        </div>
      </div>
    </div>
  );
}
