/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * v0.0.34 — the Projects folder follows the theme and every row opens a
 * PROFILE. The old version hardcoded #D4A574/#B8B8B8/#8B8B8B, so the folder
 * stayed gold while the user's palette changed; it also hid the stacks in a
 * hover tooltip. Now the list carries description + stack chips + last
 * activity inline, and clicking a project opens ProjectProfileCard.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Folder, ChevronDown, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOlympus, type ProjectNote } from '@/lib/olympus-store';
import ProjectProfileCard from './project-profile-card';
import { useLanguage, t } from '@/lib/i18n';
import { StackShelf } from './stack-icon';

const STACK_LABELS: Record<string, string> = { react: 'React', next: 'Next.js', vue: 'Vue', svelte: 'Svelte', node: 'Node.js', bun: 'Bun', python: 'Python', rust: 'Rust', go: 'Go', typescript: 'TS', javascript: 'JS', tailwind: 'Tailwind', postgres: 'Postgres', mongodb: 'MongoDB', redis: 'Redis', docker: 'Docker', kubernetes: 'K8s', vercel: 'Vercel', aws: 'AWS', gcp: 'GCP', azure: 'Azure' };

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function ProjectSwitcher() {
  const language = useLanguage();
  const projects = useOlympus((s) => s.availableProjects);
  const activeProject = useOlympus((s) => s.activeProject);
  const refreshProjects = useOlympus((s) => s.refreshProjects);
  const setNewProjectDialogOpen = useOlympus((s) => s.setNewProjectDialogOpen);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);
  useEffect(() => {
    function h(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // v0.0.38 — the FOLDER is the name. A project called “AIME” in the note is
  // `aime` here, exactly like its directory; no mixed-case aliases.
  const displayName = (p: ProjectNote | null | undefined): string => {
    if (!p) return 'No Project';
    return String(p.slug || p.name || '').trim().toLowerCase();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-label="Switch project"
        aria-expanded={dropdownOpen}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-olympus-gold/10 transition-colors group"
      >
        <Folder size={11} className="text-olympus-gold" />
        <span className="text-olympus-gold font-semibold max-w-[120px] truncate">{displayName(activeProject)}</span>
        <ChevronDown size={10} className={cn('text-olympus-text-dim transition-transform', dropdownOpen && 'rotate-180')} />
      </button>

      {dropdownOpen && (
        <div className="absolute top-full left-0 mt-1 w-96 bg-olympus-panel border border-olympus-gold/20 rounded-lg shadow-md z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-olympus-gold/10 flex items-center justify-between">
            <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">
              {t('projects.title', language)} <span className="text-olympus-gold/70">· {projects.length}</span>
            </span>
            <button
              onClick={() => { setNewProjectDialogOpen(true); setDropdownOpen(false); }}
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25 transition-colors"
            >
              <FolderPlus size={10} /> {t('projects.new', language)}
            </button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto custom-scroll">
            {projects.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] font-mono text-olympus-text-dim">
                {t('projects.noProjects', language)}<br />{t('projects.noProjectsHint', language)}
              </div>
            ) : projects.map((p) => {
              const active = activeProject?.slug === p.slug;
              return (
                <button
                  key={p.slug}
                  onClick={() => { setProfileSlug(p.slug); setDropdownOpen(false); }}
                  className={cn(
                    'w-full text-left px-3 py-2 transition-colors border-b border-olympus-gold/5 last:border-0',
                    active ? 'bg-olympus-gold/10 hover:bg-olympus-gold/15' : 'hover:bg-olympus-gold/5',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Folder size={12} className={active ? 'text-olympus-gold' : 'text-olympus-text-dim'} />
                    <span className={cn('text-[11px] font-mono font-semibold flex-1 truncate', active ? 'text-olympus-gold' : 'text-olympus-text')}>
                      {displayName(p)}
                    </span>
                    {active && <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-green">{t('common.active', language)}</span>}
                    <span className="text-[8px] font-mono text-olympus-text-dim/70" data-tip={new Date(p.last_active).toLocaleString()}>{timeAgo(p.last_active)}</span>
                  </div>
                  <div className="text-[10px] font-mono text-olympus-text-dim truncate mt-0.5 ml-5">
                    {p.description || t('common.noDescription', language)}
                  </div>
                  {p.stacks.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 ml-5 flex-wrap">
                      <Layers size={8} className="text-olympus-gold/70 shrink-0" />
                      <StackShelf stacks={p.stacks} size={14} max={7} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-3 py-1.5 border-t border-olympus-gold/10 text-[9px] font-mono text-olympus-text-dim">
            {t('projects.hint', language)}
          </div>
        </div>
      )}

      {profileSlug && <ProjectProfileCard slug={profileSlug} onClose={() => setProfileSlug(null)} />}
    </div>
  );
}
