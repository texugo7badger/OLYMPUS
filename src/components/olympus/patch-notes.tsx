'use client';

/**
 * patch-notes.tsx — v0.0.95: the patch notes / updates surface.
 *
 * The user's specimen: a slow boot (or a hibernate return) showed only the
 * spinner, and the OpenCode v2 alignment lived in a terminal badge at best.
 * This surface answers three questions in one place:
 *   - what changed in OLYMPUS (the release timeline);
 *   - which OLYMPUS build is running and whether a newer stable exists;
 *   - which OpenCode v2 is installed, which version OLYMPUS tested, and
 *     whether npm has a newer one.
 *
 * The tested version comes from public/patch-notes.json (never from a
 * hardcoded UI string); the installed/latest pair comes live from
 * /api/olympus/opencode-update. The update button still obeys the gate:
 * an ungated CLI is refused, with the exact conformance command shown.
 *
 * The same body renders as an overlay (status-bar button, boot teaser) and
 * as the standalone /patch-notes page.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { compareVersions, isNewerVersion, releaseUrl } from '@/lib/app-update';

const OPEN_EVENT = 'olympus:open-patch-notes';
const OPEN_KEY = 'olympus:open-patch-notes';

interface PatchRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

interface PatchNotesData {
  updatedAt: string;
  current: string;
  opencode: {
    package: string;
    tested: string;
    min: string;
    gate: string;
    gateDate?: string;
    gateCommand: string;
    note?: string;
  };
  releases: PatchRelease[];
}

interface VersionInfo {
  ok?: boolean;
  current?: string;
  stable?: { version?: string; tag?: string } | null;
}

interface OpencodeGate {
  approved: boolean;
  version: string | null;
  checkedAt?: string;
  reportPath?: string;
}

interface OpencodeInfo {
  ok: boolean;
  installed: string | null;
  latest: string | null;
  updateAvailable: boolean;
  source: string;
  error?: string;
  gate?: OpencodeGate | null;
}

interface LoadState {
  notes: PatchNotesData | null;
  version: VersionInfo | null;
  opencode: OpencodeInfo | null;
  loading: boolean;
  error: string | null;
}

function usePatchNotesData() {
  const [state, setState] = useState<LoadState>({ notes: null, version: null, opencode: null, loading: true, error: null });

  const load = useCallback(async (force = false) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const [notes, version, opencode] = await Promise.allSettled([
      fetch('/patch-notes.json', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`patch notes HTTP ${r.status}`);
        return r.json() as Promise<PatchNotesData>;
      }),
      fetch('/api/olympus/version', { cache: 'no-store' }).then((r) => (r.ok ? r.json() as Promise<VersionInfo> : null)),
      fetch(`/api/olympus/opencode-update${force ? '?force=1' : ''}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() as Promise<OpencodeInfo> : null)),
    ]);
    setState({
      notes: notes.status === 'fulfilled' ? notes.value : null,
      version: version.status === 'fulfilled' ? version.value : null,
      opencode: opencode.status === 'fulfilled' ? opencode.value : null,
      loading: false,
      error: notes.status === 'rejected' ? String((notes.reason as Error)?.message || notes.reason) : null,
    });
  }, []);

  useEffect(() => { void load(false); }, [load]);

  return { ...state, load };
}

function alignment(installed: string | null, tested: string | null): { label: string; detail: string; tone: 'green' | 'gold' | 'amber' | 'dim' } {
  if (!installed || !tested) return { label: 'unknown', detail: 'installed version not readable', tone: 'dim' };
  const cmp = compareVersions(installed, tested);
  if (cmp === 0) return { label: 'aligned', detail: `${installed} is the tested v2 release`, tone: 'green' };
  if (cmp < 0) return { label: 'update available', detail: `${installed} installed · ${tested} tested`, tone: 'gold' };
  return { label: 'newer than tested', detail: `${installed} installed · ${tested} tested`, tone: 'amber' };
}

const TONE: Record<'green' | 'gold' | 'amber' | 'dim', string> = {
  green: 'border-olympus-green/30 bg-olympus-green/10 text-olympus-green',
  gold: 'border-olympus-gold/30 bg-olympus-gold/10 text-olympus-gold',
  amber: 'border-olympus-amber-soft/30 bg-olympus-amber-soft/10 text-olympus-amber-soft',
  dim: 'border-olympus-text-dim/20 bg-olympus-text-dim/5 text-olympus-text-dim',
};

function StatusCard({ icon, heading, children }: { icon: React.ReactNode; heading: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-olympus-gold/15 bg-olympus-bg/45 p-3">
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.16em] text-olympus-text-dim">
        {icon}
        {heading}
      </div>
      <div className="mt-1.5 space-y-1 text-[10px] font-mono">{children}</div>
    </div>
  );
}

function PatchNotesBody({ onClose, asPage = false }: { onClose?: () => void; asPage?: boolean }) {
  const { notes, version, opencode, loading, error, load } = usePatchNotesData();
  const [updateBusy, setUpdateBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const current = String(version?.current || notes?.current || '').trim() || '—';
  const stable = version?.stable?.version ? String(version.stable.version) : null;
  const stableNewer = isNewerVersion(stable, current);
  const tested = notes?.opencode?.tested ?? null;
  const installed = opencode?.installed ?? null;
  const latest = opencode?.latest ?? null;
  const gate = opencode?.gate ?? null;
  const align = alignment(installed, tested);
  // The shipped version is declared tested by patch-notes.json; a local gate
  // report is required only to APPLY a newer candidate. Do not show a false
  // "not approved" on a fresh install that already runs the tested release.
  const shippedApproved = Boolean(installed && tested && compareVersions(installed, tested) === 0 && notes?.opencode?.gate === 'approved');
  const gateOk = Boolean(gate?.approved || shippedApproved);
  const canUpdate = Boolean(opencode?.updateAvailable && gate?.approved && !updateBusy);
  const gateVersion = gate?.version ?? latest ?? tested ?? 'latest';
  const gateCommand = String(notes?.opencode?.gateCommand || 'npm run opencode:gate -- --version <version> --install')
    .replace('<version>', gateVersion);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const applyUpdate = async () => {
    if (!opencode?.updateAvailable || updateBusy) return;
    setUpdateBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/olympus/opencode-update', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setMessage({ tone: 'error', text: String(data?.error || `HTTP ${response.status}`) });
      } else {
        setMessage({
          tone: 'ok',
          text: data?.restartRequired
            ? `OpenCode ${data.installed ?? data.latest ?? gateVersion} installed — restart OLYMPUS to load it.`
            : 'OpenCode is already on the latest tested version.',
        });
        void load(true);
      }
    } catch (e: any) {
      setMessage({ tone: 'error', text: e?.message || String(e) });
    } finally {
      setUpdateBusy(false);
    }
  };

  const copyGate = async () => {
    try {
      await navigator.clipboard.writeText(gateCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const openWindow = () => {
    try { window.open('/patch-notes', '_blank', 'noopener,noreferrer'); } catch { /* popup blocked */ }
  };

  const header = (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-olympus-gold/25 bg-olympus-gold/10 text-olympus-gold">
        <Newspaper size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-sm font-mono font-semibold tracking-wide text-olympus-text">Patch notes &amp; updates</h1>
        <p className="mt-0.5 text-[10px] font-mono leading-relaxed text-olympus-text-dim">
          OLYMPUS v{current} · OpenCode v2 alignment · the tested version is declared, the installed and latest versions are read live.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          data-tip="Re-read the OLYMPUS manifest and the npm latest tag"
          className="flex items-center gap-1 rounded-md border border-olympus-text-dim/20 px-2 py-1 text-[9px] font-mono text-olympus-text-dim transition-colors hover:border-olympus-gold/30 hover:text-olympus-gold disabled:opacity-40"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> check
        </button>
        {!asPage && (
          <button
            type="button"
            onClick={openWindow}
            data-tip="Open the standalone patch-notes page"
            className="rounded-md border border-olympus-text-dim/20 p-1.5 text-olympus-text-dim transition-colors hover:border-olympus-gold/30 hover:text-olympus-gold"
            aria-label="Open patch notes in a new window"
          >
            <ExternalLink size={11} />
          </button>
        )}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-olympus-text-dim/20 p-1.5 text-olympus-text-dim transition-colors hover:border-olympus-red/30 hover:text-olympus-red"
            aria-label="Close patch notes"
          >
            <X size={12} />
          </button>
        ) : (
          <a
            href="/"
            className="rounded-md border border-olympus-gold/25 px-2 py-1 text-[9px] font-mono text-olympus-gold transition-colors hover:bg-olympus-gold/10"
          >
            Back to OLYMPUS
          </a>
        )}
      </div>
    </div>
  );

  const body = (
    <div className="space-y-4">
      {header}

      <div className="grid gap-2 sm:grid-cols-3">
        <StatusCard icon={<Cpu size={10} />} heading="OLYMPUS">
          <div className="text-[15px] font-semibold text-olympus-text">v{current}</div>
          <div className="text-[9px] text-olympus-text-dim">stable {stable ? `v${stable}` : '—'}</div>
          {stableNewer && stable && (
            <a
              href={releaseUrl(stable)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[9px] text-olympus-gold hover:underline"
            >
              <ArrowUpCircle size={10} /> v{stable} available
            </a>
          )}
          {!stableNewer && <div className="text-[9px] text-olympus-green">up to date with stable</div>}
        </StatusCard>

        <StatusCard icon={<Cpu size={10} />} heading="OpenCode v2">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-olympus-text">{installed ?? '—'}</span>
            <span className="text-[9px] text-olympus-text-dim">installed</span>
          </div>
          <div className="text-[9px] text-olympus-text-dim">tested {tested ?? '—'} · latest {latest ?? '—'}</div>
          <span className={cn('mt-1 inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide', TONE[align.tone])}>
            {align.tone === 'green' ? <CheckCircle2 size={9} /> : <AlertTriangle size={9} />}
            {align.label}
          </span>
          {opencode && !opencode.ok && (
            <div className="text-[8px] leading-relaxed text-olympus-amber-soft">registry unreachable — {opencode.error?.slice(0, 120)}</div>
          )}
        </StatusCard>

        <StatusCard icon={<ShieldCheck size={10} />} heading="Conformance gate">
          <div className="text-[12px] font-semibold text-olympus-text">
            {gateOk ? (gate?.approved ? 'approved' : 'approved (shipped)') : gate ? 'not approved' : 'unknown'}
          </div>
          <div className="text-[9px] text-olympus-text-dim">candidate {gateVersion}</div>
          <button
            type="button"
            onClick={() => void copyGate()}
            className="mt-1 inline-flex items-center gap-1 text-[8px] font-mono text-olympus-gold hover:underline"
          >
            <Copy size={9} /> {copied ? 'copied' : 'copy gate command'}
          </button>
        </StatusCard>
      </div>

      {message && (
        <div className={cn('rounded-lg border px-3 py-2 text-[10px] font-mono', message.tone === 'ok' ? 'border-olympus-green/30 bg-olympus-green/10 text-olympus-green' : 'border-olympus-red/30 bg-olympus-red/10 text-olympus-red')}>
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {opencode?.updateAvailable ? (
          <button
            type="button"
            onClick={() => void applyUpdate()}
            disabled={!canUpdate}
            data-tip={gate?.approved ? `Install OpenCode ${latest} and restart OLYMPUS` : 'The candidate has not passed the conformance gate — copy the gate command first.'}
            className="flex items-center gap-1.5 rounded-lg bg-olympus-gold/15 px-3 py-1.5 text-[10px] font-mono text-olympus-gold ring-1 ring-olympus-gold/30 transition-colors hover:bg-olympus-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {updateBusy ? <Loader2 size={11} className="animate-spin" /> : <ArrowUpCircle size={11} />}
            {updateBusy ? 'installing…' : `update OpenCode to ${latest}`}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 rounded-lg border border-olympus-green/20 bg-olympus-green/5 px-3 py-1.5 text-[9px] font-mono text-olympus-green">
            <CheckCircle2 size={10} /> {opencode ? 'OpenCode is aligned with npm latest' : 'OpenCode status unavailable'}
          </span>
        )}
        {stable && (
          <a
            href={releaseUrl(stable)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-olympus-text-dim/20 px-3 py-1.5 text-[9px] font-mono text-olympus-text-dim transition-colors hover:border-olympus-gold/30 hover:text-olympus-gold"
          >
            <ExternalLink size={10} /> OLYMPUS releases
          </a>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-olympus-red/30 bg-olympus-red/10 px-3 py-2 text-[10px] font-mono text-olympus-red">
          The patch-notes manifest could not be read: {error}. The OpenCode status above is still live.
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.16em] text-olympus-text-dim">
          <Sparkles size={10} className="text-olympus-gold" /> What changed
        </div>
        <div className="space-y-2">
          {(notes?.releases ?? []).map((release) => (
            <section key={release.version} className="rounded-xl border border-olympus-gold/15 bg-olympus-bg/40 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-mono font-semibold text-olympus-gold">v{release.version}</span>
                <span className="text-[9px] font-mono text-olympus-text-dim">{release.date}</span>
                {release.version === current && (
                  <span className="rounded border border-olympus-green/25 bg-olympus-green/10 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide text-olympus-green">running</span>
                )}
              </div>
              <h2 className="mt-0.5 text-[11px] font-semibold text-olympus-text">{release.title}</h2>
              <ul className="mt-1.5 space-y-1">
                {release.highlights.map((highlight, index) => (
                  <li key={index} className="flex gap-1.5 text-[9px] leading-relaxed text-olympus-text-dim">
                    <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-olympus-gold/70" aria-hidden="true" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!notes && !error && (
            <div className="flex items-center gap-2 rounded-xl border border-olympus-text-dim/15 px-3 py-6 text-[10px] font-mono text-olympus-text-dim">
              <Loader2 size={12} className="animate-spin" /> reading the release timeline…
            </div>
          )}
        </div>
      </div>

      <p className="text-[9px] leading-relaxed text-olympus-text-dim/80">
        {notes?.opencode?.note || 'OpenCode v2 never auto-updates under OLYMPUS. An update is applied only after the isolated conformance gate approves the exact version.'}
      </p>
    </div>
  );

  if (asPage) {
    return <div className="min-h-screen w-full bg-olympus-bg text-olympus-text"><div className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6">{body}</div></div>;
  }

  return (
    <div
      className="fixed inset-0 z-[340] flex items-center justify-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="OLYMPUS patch notes and updates"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-olympus-gold/30 bg-olympus-panel shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="overflow-y-auto p-4 sm:p-5">{body}</div>
      </div>
    </div>
  );
}

/** The global overlay: the status-bar button and the boot teaser open it. */
export function PatchNotesOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      try { sessionStorage.removeItem(OPEN_KEY); } catch { /* private mode */ }
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    try {
      if (sessionStorage.getItem(OPEN_KEY) === '1') {
        sessionStorage.removeItem(OPEN_KEY);
        setOpen(true);
      }
    } catch { /* private mode */ }
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  if (!open) return null;
  return <PatchNotesBody onClose={() => setOpen(false)} />;
}

/** The standalone page body. */
export function PatchNotesPage() {
  return <PatchNotesBody asPage />;
}

/**
 * The boot / hibernate-return teaser. It appears after 1.2s so a fast boot
 * stays clean; the full screen is one click away. The fetch never blocks the
 * boot cap.
 */
export function PatchNotesTeaser() {
  const [visible, setVisible] = useState(false);
  const [notes, setNotes] = useState<PatchNotesData | null>(null);

  useEffect(() => {
    // Fetch on mount, reveal after 1.2s: a fast boot stays clean, and a slow
    // boot has the real release title by the time the card appears.
    void fetch('/patch-notes.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() as Promise<PatchNotesData> : null))
      .then((data) => { if (data) setNotes(data); })
      .catch(() => { /* the button still opens the overlay */ });
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const release = notes?.releases?.find((item) => item.version === notes.current) ?? notes?.releases?.[0] ?? null;
  const tested = notes?.opencode?.tested ?? null;

  const open = () => {
    try { sessionStorage.setItem(OPEN_KEY, '1'); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-[210] w-[min(92vw,680px)] -translate-x-1/2">
      <div className="rounded-xl border border-olympus-gold/25 bg-olympus-panel/95 px-3.5 py-3 shadow-2xl">
        <div className="flex items-center gap-2">
          <Sparkles size={11} className="text-olympus-gold" />
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-olympus-gold">
            What&apos;s new{release ? ` · v${release.version}` : ''}
          </span>
          <span className="ml-auto text-[8px] font-mono text-olympus-text-dim">
            {tested ? `OpenCode v2 ${tested} tested` : 'OpenCode v2 alignment'}
          </span>
        </div>
        {release && <p className="mt-1 text-[11px] font-mono text-olympus-text">{release.title}</p>}
        {release?.highlights?.length ? (
          <ul className="mt-1 space-y-0.5">
            {release.highlights.slice(0, 2).map((highlight, index) => (
              <li key={index} className="flex gap-1.5 text-[9px] leading-relaxed text-olympus-text-dim">
                <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-olympus-gold/70" aria-hidden="true" />
                <span className="line-clamp-1">{highlight}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[9px] font-mono text-olympus-text-dim">OLYMPUS updates, OpenCode v2 alignment and the tested conformance gate.</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={open}
            className="flex items-center gap-1.5 rounded-md bg-olympus-gold/15 px-2.5 py-1 text-[9px] font-mono text-olympus-gold ring-1 ring-olympus-gold/30 transition-colors hover:bg-olympus-gold/25"
          >
            <Newspaper size={10} /> patch notes
          </button>
          <span className="text-[8px] font-mono text-olympus-text-dim/80">updates, tested OpenCode version and the gate</span>
        </div>
      </div>
    </div>
  );
}
