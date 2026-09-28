/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useOlympus, GOD_ICONS, GOD_IDS } from '@/lib/olympus-store';
import {
  Brain, Settings, BrainCog,
  DollarSign, History, SlidersHorizontal,
  Eye, Plug, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Activity Bar (far-left, 48px).                                      */
/*                                                                     */
/* Callimachus is included in the Gods quick-select row so the vault   */
/* curator is visible alongside the other 8 gods. Clicking it opens    */
/* the god-detail panel showing instinct counts and activity.          */
/*                                                                     */
/* Prior:                                                              */
/*   - Consolidated 12 buttons → 6 navigation buttons + Gods section.  */
/*   - Vault Editor → "Vault Summary" (read-only).                     */
/*   - Each menu icon is unique — no repeats.                          */
/*   - Labels are short nouns; no parenthetical subtitles.             */
/*                                                                     */
/* Tooltip policy:                                                     */
/*   - No hover tooltips on nav buttons — labels are self-explanatory. */
/*   - Gods row keeps a small label-on-hover so users can see the god  */
/*     name without clicking (the icon alone is ambiguous).            */
/* ------------------------------------------------------------------ */

// All 9 gods render in the quick-select row. Clicking Callimachus opens
// the god-detail panel showing vault-curation instincts and activity.
const DISPATCHABLE_GOD_IDS = GOD_IDS;

export default function ActivityBar() {
  const leftPane = useOlympus(s => s.leftPane);
  const setLeftPane = useOlympus(s => s.setLeftPane);
  const setSettingsOpen = useOlympus(s => s.setSettingsOpen);
  const activeGod = useOlympus(s => s.activeGod);
  const graphData = useOlympus(s => s.graphData);
  const setSelectedNode = useOlympus(s => s.setSelectedNode);

  return (
    <div className="w-12 shrink-0 bg-linear-to-b from-olympus-panel to-olympus-bg border-r border-olympus-gold/10 flex flex-col items-center py-2 gap-1 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-px bg-linear-to-r from-transparent via-olympus-gold/40 to-transparent" />

      <ActBtn icon={Brain} label="Brain graph" active={leftPane === 'brain' || leftPane === 'god-detail'} onClick={() => setLeftPane('brain')} accent />
      <ActBtn icon={Eye} label="Live preview" active={leftPane === 'live-preview'} onClick={() => setLeftPane('live-preview')} />
      <ActBtn icon={BrainCog} label="God intelligence" active={leftPane === 'god-intelligence'} onClick={() => setLeftPane('god-intelligence')} accent />
      <ActBtn icon={History} label="Recent activity" active={leftPane === 'timeline'} onClick={() => setLeftPane('timeline')} />
      <ActBtn icon={DollarSign} label="Cost" active={leftPane === 'cost'} onClick={() => setLeftPane('cost')} />
      <ActBtn icon={BarChart3} label="Benchmarks" active={leftPane === 'benchmarks'} onClick={() => setLeftPane('benchmarks')} />
      <ActBtn icon={SlidersHorizontal} label="LLM strategy" active={leftPane === 'provider-settings'} onClick={() => setLeftPane('provider-settings')} />

      <div className="my-1 w-6 h-px bg-linear-to-r from-transparent via-olympus-gold/25 to-transparent" />

      {/* Gods quick-select — all 10 gods render here (Apollo, Atlas, Artemis,
          Athena, Dionysus, Hephaestus, Hermes, Persephone, Prometheus, Callimachus).
          Atlas is right after Apollo — the orchestrator who executes the plan.
          Clicking any god opens the god-detail panel showing its activity. */}
      <div className="flex flex-col items-center gap-0.5">
        <div className="text-[8px] font-mono text-olympus-text-dim uppercase tracking-wider mb-0.5">gods</div>
        {DISPATCHABLE_GOD_IDS.map(id => {
          const Icon = GOD_ICONS[id];
          const isActive = activeGod === id;
          return (
            <button
              key={id}
              aria-label={id}
              onClick={() => {
                const node = graphData?.nodes.find(n => n.id === `god:${id}`);
                if (node) setSelectedNode(node);
                setLeftPane('god-detail');
              }}
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center transition-all group relative',
                isActive
                  ? 'bg-olympus-gold/15 ring-1 ring-olympus-gold/50'
                  : 'hover:bg-olympus-gold/10',
              )}
            >
              <Icon
                size={17}
                className={cn(
                  'transition-colors',
                  isActive ? 'text-olympus-gold' : 'text-olympus-text-dim group-hover:text-olympus-gold',
                )}
              />
              {isActive && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-olympus-gold animate-pulse" />
              )}
              {/* God name on hover — Olympus-styled, capitalized */}
              <span className="absolute left-11 top-1/2 -translate-y-1/2 text-[10px] bg-olympus-card border border-olympus-gold/20 text-olympus-gold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 font-mono shadow-md">
                {id.charAt(0).toUpperCase() + id.slice(1)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* MCP Configuration — above Settings. Opens the MCP config panel
          where users can enable/disable individual MCPs. MCPs requiring
          an API key appear locked if no key is registered. */}
      <ActBtn icon={Plug} label="MCP Configuration" active={leftPane === 'mcp-config'} onClick={() => setLeftPane('mcp-config')} />

      {/* Settings (gear) — opens SettingsDialog. No tooltip per user request. */}
      <ActBtn icon={Settings} label="Settings" onClick={() => setSettingsOpen(true)} noTooltip />
    </div>
  );
}

function ActBtn({
  icon: Icon, label, active, onClick, accent, noTooltip,
}: {
  icon: any; label: string; active?: boolean; onClick?: () => void; accent?: boolean; noTooltip?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center transition-all group relative',
        active
          ? 'bg-olympus-gold/10 ring-1 ring-olympus-gold/40'
          : 'hover:bg-olympus-gold/10',
      )}
    >
      <Icon
        size={18}
        className={cn(
          'transition-colors',
          active
            ? (accent ? 'text-olympus-gold' : 'text-olympus-gold')
            : 'text-olympus-text-dim group-hover:text-olympus-gold',
        )}
      />
      {/* Label on hover — Olympus-styled. Skip when noTooltip is set. */}
      {!noTooltip && (
        <span className="absolute left-11 top-1/2 -translate-y-1/2 text-[10px] bg-olympus-card border border-olympus-gold/20 text-olympus-gold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 font-mono shadow-md">
          {label}
        </span>
      )}
    </button>
  );
}
