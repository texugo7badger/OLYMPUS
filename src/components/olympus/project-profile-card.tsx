/**
 * project-profile-card.tsx — v0.0.34: clicking a project opens its PROFILE.
 *
 * The Projects folder used to be a one-line switcher. This card is the
 * project's living identity: description, stack chips, a bounded filesystem
 * scan (files, size, recent files), the package manifest and its scripts,
 * the git branch/commit/dirty count, detected manifests and a README excerpt.
 *
 * Reads `/api/olympus/projects/profile?slug=`. Activating a project writes
 * the same store the rest of the app uses; "open in editor" goes through the
 * Editor Bridge route. Everything follows the active theme (no hardcoded
 * gold/gray) and animates only transform/opacity.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, BookOpen, Brain, Check, ChevronDown, Clock, Code2, Copy, ExternalLink, FileCode,
  Files, Folder, GitBranch, HardDrive, Layers, ListTree, Loader2, X, Download, Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useOlympus, type ProjectNote } from '@/lib/olympus-store';
import OlympusLoader from './olympus-loader';
import StackIcon, { stackLabel } from './stack-icon';
import { useLanguage, t } from '@/lib/i18n';

interface RecentFile {
  path: string;
  size: number;
  mtime: string;
}

interface Brief {
  status: 'running' | 'parked' | 'done' | 'idle';
  campaignId: string | null;
  completed: number;
  total: number;
  parked: number;
  next: Array<{ id: string; god: string; status: string }>;
  parkedHop: { hopId: string; reason: string; error?: string | null } | null;
  docs: Array<{ name: string; title: string }>;
  memory: string[];
  scope: { instincts: number; knowledge: number; skills: number };
  updatedAt: string | null;
}

interface Profile {
  ok: boolean;
  active: boolean;
  project: ProjectNote;
  path: string;
  pathSource: string;
  exists: boolean;
  isDir: boolean;
  stacks: string[];
  description: string;
  brief?: Brief;
  stats: {
    files: number;
    directories: number;
    bytes: number;
    recent: RecentFile[];
    truncated: boolean;
  };
  manifest: {
    name: string;
    version: string;
    description: string;
    scripts: string[];
    dependencies: number;
    devDependencies: number;
  } | null;
  manifests: string[];
  git: { branch: string; commit: string; subject: string; relative: string; dirty: number } | null;
  readme: { file: string; excerpt: string } | null;
}

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fileIcon(rel: string) {
  const ext = rel.split('.').pop()?.toLowerCase() || '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return <Code2 size={12} className="text-olympus-blue" />;
  if (['md', 'mdx', 'txt', 'json', 'yml', 'yaml', 'toml'].includes(ext)) return <FileCode size={12} className="text-olympus-gold" />;
  return <Files size={12} className="text-olympus-text-dim" />;
}

export default function ProjectProfileCard({ slug, onClose }: { slug: string; onClose: () => void }) {
  const language = useLanguage();
  // v0.0.48 — the passport: share/export the project's identity.
  const [sharing, setSharing] = useState(false);
  const [github, setGithub] = useState<any>(null);
  const [repoName, setRepoName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [githubBusy, setGithubBusy] = useState(false);
  const loadGithub = useCallback(async () => {
    try {
      const r = await fetch(`/api/olympus/projects/github?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) { setGithub(d); setRepoName((prev) => prev || d.repo?.split('/').pop() || slug); }
    } catch { /* offline */ }
  }, [slug]);
  useEffect(() => { void loadGithub(); }, [loadGithub]);
  const githubAction = async (action: 'create' | 'connect' | 'push', payload: Record<string, unknown> = {}) => {
    setGithubBusy(true);
    try {
      const r = await fetch('/api/olympus/projects/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, action, ...payload }) });
      const d = await r.json();
      if (d?.ok) { toast.success(`GitHub: ${action} ok`); await loadGithub(); }
      else toast.error(d?.error || 'GitHub action failed');
    } catch { toast.error('GitHub action failed'); }
    finally { setGithubBusy(false); }
  };
  const sharePassport = async () => {
    setSharing(true);
    try {
      const r = await fetch(`/api/olympus/projects/export?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('export failed');
      const text = await r.text();
      await navigator.clipboard.writeText(text);
      toast.success('project passport copied');
    } catch { toast.error('could not copy the passport'); }
    finally { setSharing(false); }
  };
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [readmeOpen, setReadmeOpen] = useState(false);
  const activeProject = useOlympus((s) => s.activeProject);
  const setActiveProject = useOlympus((s) => s.setActiveProject);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/olympus/projects/profile?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d?.ok) throw new Error(d?.error || 'could not load the project');
        setProfile(d as Profile);
      })
      .catch((e) => { if (alive) setError(e?.message || 'could not load the project'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1400);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  const activate = () => {
    if (!profile) return;
    setActiveProject(profile.project);
    setProfile({ ...profile, active: true });
    toast.success(`${profile.project.name || profile.project.slug} is the active project`);
  };

  const openEditor = async () => {
    if (!profile) return;
    setBusy('editor');
    try {
      const r = await fetch('/api/olympus/editor/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: profile.path, projectSlug: profile.project.slug }),
      });
      const d = await r.json();
      if (d?.ok) toast.success(`${d.editorName || 'Editor'} opened`);
      else toast.error(d?.error || 'No external editor detected');
    } catch {
      toast.error('Could not launch the editor');
    } finally {
      setBusy(null);
    }
  };

  if (!mounted) return null;

  const isActive = profile?.active ?? activeProject?.slug === slug;
  // v0.0.38 — the folder name, lowercase, is the identity.
  const name = String(slug || profile?.project.name || '').toLowerCase();
  const truncated = profile?.stats.truncated;
  // v0.0.41 — the brief's status in the selected language (no raw English).
  const briefStatus = profile?.brief?.status ?? 'idle';
  const briefStatusLabel = briefStatus === 'running'
    ? t('projects.statusRunning', language)
    : briefStatus === 'parked'
      ? t('projects.statusParked', language)
      : briefStatus === 'done'
        ? t('projects.statusDone', language)
        : t('projects.statusIdle', language);
  const briefStatusTone = briefStatus === 'running'
    ? 'text-olympus-gold bg-olympus-gold/10 ring-olympus-gold/30'
    : briefStatus === 'parked'
      ? 'text-olympus-red bg-olympus-red/10 ring-olympus-red/30'
      : briefStatus === 'done'
        ? 'text-olympus-green bg-olympus-green/10 ring-olympus-green/30'
        : 'text-olympus-text-dim bg-olympus-bg/60 ring-olympus-gold/10';

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--olympus-bg) 78%, transparent)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} project profile`}
        className="w-[min(780px,94vw)] max-h-[88vh] overflow-y-auto custom-scroll rounded-xl border border-olympus-gold/25 bg-olympus-panel shadow-2xl"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <OlympusLoader size={96} label="opening the project" />
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-xs font-mono text-olympus-red">{error}</p>
            <button onClick={onClose} className="mt-3 text-[10px] font-mono px-3 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30">{t('common.close', language)}</button>
          </div>
        ) : profile ? (
          <>
            {/* Header */}
            <div className="relative px-5 pt-5 pb-4 border-b border-olympus-gold/10 overflow-hidden">
              <div className="absolute inset-0 opacity-[0.09] pointer-events-none" style={{ background: 'radial-gradient(circle at 18% 0%, var(--olympus-gold), transparent 52%)' }} />
              <div className="relative flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center ring-1 ring-olympus-gold/35 bg-olympus-gold/10 shrink-0">
                  <Folder size={22} className="text-olympus-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-olympus-text truncate">{name}</h2>
                    {isActive && (
                      <span className="text-[8px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-olympus-green/15 text-olympus-green ring-1 ring-olympus-green/30">{t('common.active', language)}</span>
                    )}
                    {!profile.exists && (
                      <span className="text-[8px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-olympus-red/15 text-olympus-red ring-1 ring-olympus-red/30">{t('projects.pathMissing', language)}</span>
                    )}
                  </div>
                  <p className="text-[9px] font-mono text-olympus-text-dim mt-0.5 truncate">
                    {profile.project.slug} · created {new Date(profile.project.created).toLocaleDateString()} · active {timeAgo(profile.project.last_active)}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[9px] font-mono text-olympus-text-dim truncate" data-tip={profile.path}>{profile.path || '(no path)'}</span>
                    {profile.path && (
                      <button onClick={() => copy(profile.path, 'path')} aria-label="Copy project path" className="shrink-0 text-olympus-text-dim hover:text-olympus-gold p-0.5">
                        {copied === 'path' ? <Check size={10} className="text-olympus-green" /> : <Copy size={10} />}
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={onClose} aria-label="Close project profile" className="shrink-0 text-olympus-text-dim hover:text-olympus-gold p-1 rounded hover:bg-olympus-gold/10">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Description */}
              {profile.description && (
                <p className="text-[11px] font-mono text-olympus-text leading-relaxed">{profile.description}</p>
              )}

              {/* Stack shelf — official marks, one tile each */}
              {profile.stacks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim mb-1.5"><Layers size={10} className="text-olympus-gold" /> {t('projects.stack', language)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.stacks.map((s) => (
                      <span key={s} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-card text-olympus-text-dim ring-1 ring-olympus-gold/15">
                        <StackIcon stack={s} size={12} tile /> {stackLabel(s)}
                      </span>
                    ))}
                    {profile.manifest?.version && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/20">{profile.manifest.name || 'pkg'} {profile.manifest.version}</span>
                    )}
                  </div>
                </div>
              )}

              {/* v0.0.41 — the living brief: what the project is DOING. */}
              {profile.brief && (
                <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card/40 p-2.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Activity size={10} className="text-olympus-gold" />
                    <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">{t('projects.brief', language)}</span>
                    <span className={cn('ml-auto text-[8px] font-mono uppercase px-1.5 py-0.5 rounded ring-1', briefStatusTone)}>{briefStatusLabel}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono text-olympus-text-dim">
                    <span className="text-olympus-text">{profile.brief.completed}/{profile.brief.total} {t('projects.hops', language)}</span>
                    {profile.brief.parked > 0 && <span className="text-olympus-red">· {profile.brief.parked} parked</span>}
                    {profile.brief.campaignId && <span className="truncate">· {profile.brief.campaignId}</span>}
                    {profile.brief.updatedAt && <span className="ml-auto shrink-0">{timeAgo(profile.brief.updatedAt)}</span>}
                  </div>
                  <div className="h-1 rounded-full bg-olympus-bg overflow-hidden ring-1 ring-olympus-gold/10">
                    <div
                      className={cn('h-full rounded-full', profile.brief.status === 'parked' ? 'bg-olympus-red' : profile.brief.status === 'done' ? 'bg-olympus-green' : 'bg-olympus-gold')}
                      style={{ width: `${profile.brief.total > 0 ? Math.round((profile.brief.completed / profile.brief.total) * 100) : 0}%` }}
                    />
                  </div>
                  {profile.brief.parkedHop && (
                    <p className="text-[8.5px] font-mono text-olympus-red/90 truncate" data-tip={profile.brief.parkedHop.error || ''}>
                      {t('projects.parkedAt', language)} {profile.brief.parkedHop.hopId} · {profile.brief.parkedHop.reason}
                    </p>
                  )}
                  {profile.brief.next.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <ListTree size={9} className="text-olympus-gold/70" />
                      {profile.brief.next.map((h) => (
                        <span key={h.id} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-bg/60 ring-1 ring-olympus-gold/10 text-olympus-text-dim">
                          {h.id} · {h.god}
                        </span>
                      ))}
                    </div>
                  )}
                  {profile.brief.docs.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <BookOpen size={9} className="text-olympus-gold/70" />
                      {profile.brief.docs.slice(0, 4).map((d) => (
                        <span key={d.name} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-bg/60 ring-1 ring-olympus-gold/10 text-olympus-text-dim truncate max-w-[160px]" data-tip={d.title}>
                          {d.name}
                        </span>
                      ))}
                      {profile.brief.memory.length > 0 && <span className="text-[8px] font-mono text-olympus-green">· memory {profile.brief.memory.length}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[8px] font-mono text-olympus-text-dim">
                    <Brain size={9} className="text-olympus-purple" />
                    <span>{t('projects.scope', language)}: {profile.brief.scope.instincts} {t('projects.instincts', language)} · {profile.brief.scope.knowledge} {t('projects.knowledge', language)} · {profile.brief.scope.skills} {t('projects.skills', language)}</span>
                  </div>
                </div>
              )}

              {/* v0.0.54 — one repository per project, through the user's gh. */}
              <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card/40 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <GitBranch size={10} className="text-olympus-gold" />
                  <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">github repository</span>
                  {github?.ghReady === false && <span className="ml-auto text-[8px] font-mono text-olympus-amber-soft">gh auth login required</span>}
                  {github?.repo && <a href={github.githubUrl} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[8px] font-mono text-olympus-cyan hover:underline">{github.repo} ↗</a>}
                </div>
                {github?.repo ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-mono text-olympus-text-dim truncate flex-1">{github.branch || 'branch ?'} · {github.commits?.length ?? 0} recent commits</span>
                    <button onClick={() => void githubAction('push')} disabled={githubBusy} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/25 disabled:opacity-40">push</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder={slug} className="flex-1 min-w-[120px] bg-olympus-bg border border-olympus-gold/20 rounded px-1.5 py-1 text-[8px] font-mono text-olympus-text outline-none" />
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'private' | 'public')} className="bg-olympus-bg border border-olympus-gold/20 rounded px-1 py-1 text-[8px] font-mono text-olympus-text outline-none">
                      <option value="private">private</option>
                      <option value="public">public</option>
                    </select>
                    <button onClick={() => void githubAction('create', { repo: repoName, visibility })} disabled={githubBusy || !repoName.trim() || github?.ghReady === false} className="text-[8px] font-mono px-1.5 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 disabled:opacity-40">create + push</button>
                  </div>
                )}
                {github?.repo && github.commits?.length > 0 && (
                  <div className="space-y-0.5">
                    {github.commits.slice(0, 3).map((c: any) => (
                      <div key={c.hash} className="flex items-center gap-1.5 text-[8px] font-mono text-olympus-text-dim">
                        <span className="text-olympus-gold">{c.hash}</span>
                        <span className="truncate">{c.subject}</span>
                        <span className="ml-auto shrink-0">{c.relative}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <div className="rounded-lg bg-olympus-card ring-1 ring-olympus-gold/10 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[8px] font-mono uppercase text-olympus-text-dim"><Files size={9} /> {t('common.files', language)}</div>
                  <div className="text-sm font-mono text-olympus-text mt-0.5">{profile.stats.files.toLocaleString()}{truncated ? '+' : ''}</div>
                </div>
                <div className="rounded-lg bg-olympus-card ring-1 ring-olympus-gold/10 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[8px] font-mono uppercase text-olympus-text-dim"><HardDrive size={9} /> {t('common.size', language)}</div>
                  <div className="text-sm font-mono text-olympus-text mt-0.5">{fmtBytes(profile.stats.bytes)}</div>
                </div>
                <div className="rounded-lg bg-olympus-card ring-1 ring-olympus-gold/10 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[8px] font-mono uppercase text-olympus-text-dim"><GitBranch size={9} /> {t('common.branch', language)}</div>
                  <div className="text-sm font-mono text-olympus-text mt-0.5 truncate" data-tip={profile.git?.branch || 'no git'}>{profile.git?.branch || '—'}</div>
                </div>
                <div className="rounded-lg bg-olympus-card ring-1 ring-olympus-gold/10 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[8px] font-mono uppercase text-olympus-text-dim"><Clock size={9} /> {t('common.changes', language)}</div>
                  <div className="text-sm font-mono mt-0.5" style={{ color: profile.git && profile.git.dirty > 0 ? 'var(--olympus-amber)' : 'var(--olympus-green)' }}>
                    {profile.git ? (profile.git.dirty > 0 ? `${profile.git.dirty} ${t('projects.dirty', language)}` : t('projects.clean', language)) : '—'}
                  </div>
                </div>
              </div>

              {/* Manifest + git commit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim mb-1.5">{t('common.manifests', language)}</div>
                  <div className="flex flex-wrap gap-1">
                    {profile.manifests.length === 0 ? (
                      <span className="text-[9px] font-mono text-olympus-text-dim">{t('common.noneDetected', language)}</span>
                    ) : profile.manifests.map((m) => (
                      <span key={m} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-panel text-olympus-text-dim ring-1 ring-olympus-gold/15">{m}</span>
                    ))}
                  </div>
                  {profile.manifest && (
                    <p className="text-[9px] font-mono text-olympus-text-dim mt-2">{profile.manifest.dependencies} deps · {profile.manifest.devDependencies} dev</p>
                  )}
                </div>
                <div>
                  <div className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim mb-1.5">{t('common.latestCommit', language)}</div>
                  {profile.git ? (
                    <div className="text-[9px] font-mono text-olympus-text-dim leading-relaxed">
                      <span className="text-olympus-gold">{profile.git.commit}</span> {profile.git.subject}
                      <div className="text-[8px] mt-0.5">{profile.git.relative}</div>
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono text-olympus-text-dim">{t('common.notGit', language)}</span>
                  )}
                </div>
              </div>

              {/* Recent files + scripts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim mb-1.5">{t('common.recentFiles', language)}</div>
                  <div className="space-y-0.5">
                    {profile.stats.recent.length === 0 ? (
                      <span className="text-[9px] font-mono text-olympus-text-dim">{t('common.nothingRecent', language)}</span>
                    ) : profile.stats.recent.slice(0, 7).map((f) => (
                      <div key={f.path} className="flex items-center gap-1.5 text-[9px] font-mono py-0.5 group">
                        {fileIcon(f.path)}
                        <span className="flex-1 min-w-0 truncate text-olympus-text-dim group-hover:text-olympus-text" data-tip={f.path}>{f.path}</span>
                        <span className="text-[8px] text-olympus-text-dim/70 shrink-0">{fmtBytes(f.size)}</span>
                        <button onClick={() => copy(f.path, 'file path')} aria-label={`Copy ${f.path}`} className="opacity-0 group-hover:opacity-100 text-olympus-text-dim hover:text-olympus-gold shrink-0">
                          {copied === 'file path' ? <Check size={9} /> : <Copy size={9} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim mb-1.5">{t('common.scripts', language)}</div>
                  {profile.manifest && profile.manifest.scripts.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {profile.manifest.scripts.slice(0, 10).map((s) => (
                        <button
                          key={s}
                          onClick={() => copy(`npm run ${s}`, 'script')}
                          className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/20 hover:bg-olympus-cyan/20"
                          data-tip={`Copy: npm run ${s}`}
                        >{s}</button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono text-olympus-text-dim">{t('common.noScripts', language)}</span>
                  )}
                </div>
              </div>

              {/* README */}
              {profile.readme && (
                <div className="rounded-lg bg-olympus-card ring-1 ring-olympus-gold/10 overflow-hidden">
                  <button
                    onClick={() => setReadmeOpen((v) => !v)}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim hover:text-olympus-gold"
                    aria-expanded={readmeOpen}
                  >
                    <FileCode size={10} className="text-olympus-gold" /> {profile.readme.file}
                    <ChevronDown size={10} className={cn('ml-auto transition-transform', readmeOpen && 'rotate-180')} />
                  </button>
                  <p className={cn('px-2.5 pb-2 text-[10px] font-mono text-olympus-text-dim leading-relaxed whitespace-pre-wrap', !readmeOpen && 'line-clamp-3')}>
                    {profile.readme.excerpt}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 flex items-center gap-1.5 px-5 py-3 border-t border-olympus-gold/10 bg-olympus-panel/95">
              {!isActive && (
                <button onClick={activate} className="flex items-center gap-1 text-[10px] font-mono px-3 py-1.5 rounded bg-olympus-gold text-olympus-bg font-semibold ring-1 ring-olympus-gold/50 hover:brightness-110">
                  <Check size={11} /> {t('common.setActive', language)}
                </button>
              )}
              <button
                onClick={openEditor}
                disabled={!profile.path || busy === 'editor'}
                className="flex items-center gap-1 text-[10px] font-mono px-3 py-1.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20 disabled:opacity-40"
              >
                {busy === 'editor' ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />} open in editor
              </button>
              <button onClick={() => copy(profile.path, 'path')} className="flex items-center gap-1 text-[10px] font-mono px-3 py-1.5 rounded bg-olympus-panel text-olympus-text-dim ring-1 ring-olympus-gold/15 hover:text-olympus-gold">
                <Copy size={11} /> path
              </button>
              <button onClick={() => void sharePassport()} disabled={sharing} data-tip="Copy the project passport (identity, stacks, brief, design memory)" className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-olympus-gold/20 text-olympus-text-dim hover:text-olympus-gold disabled:opacity-50">
                {sharing ? <Loader2 size={10} className="animate-spin" /> : <Share2 size={10} />} share
              </button>
              <a href={`/api/olympus/projects/export?slug=${encodeURIComponent(slug)}`} download={`olympus-${slug}.passport.json`} className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-olympus-gold/20 text-olympus-text-dim hover:text-olympus-gold">
                <Download size={10} /> export
              </a>
              <button onClick={onClose} className="ml-auto text-[10px] font-mono px-3 py-1.5 rounded text-olympus-text-dim hover:text-olympus-text">{t('common.close', language)}</button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
