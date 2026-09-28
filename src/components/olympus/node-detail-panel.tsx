/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useOlympus, GOD_ICONS } from '@/lib/olympus-store';
import { X, Brain, Wrench, Sparkles, Folder, Lightbulb, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Node Detail Panel.                                                  */
/*                                                                     */
/*                                                                     */
/*  - Uses GOD_ICONS instead of emoji glyphs (Issue 5).                */
/*  - Pastel palette throughout (Issue 11).                            */
/* ------------------------------------------------------------------ */
export default function NodeDetailPanel() {
  const node = useOlympus(s => s.selectedNode);
  const setSelectedNode = useOlympus(s => s.setSelectedNode);

  if (!node) return null;

  const Icon = node.type === 'god' ? Brain : node.type === 'skill' ? Wrench : node.type === 'instinct' ? Sparkles : node.type === 'project' ? Folder : Lightbulb;
  const accent =
    node.type === 'god' ? 'text-olympus-gold' :
    node.type === 'skill' ? 'text-olympus-blue' :
    node.type === 'instinct' ? (node.confidence >= 0.7 ? 'text-olympus-green' : 'text-olympus-amber-soft') :
    node.type === 'project' ? 'text-olympus-purple' : 'text-olympus-cyan';

  // Use god's lucide icon if the node has a god owner
  const GodIcon = node.god ? GOD_ICONS[node.god] : null;

  return (
    <div className="absolute inset-0 bg-olympus-card/95 backdrop-blur-sm flex flex-col z-40 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="flex items-center justify-between px-4 h-10 border-b border-olympus-gold/15 shrink-0">
        <div className="flex items-center gap-2">
          <Icon size={14} className={accent} />
          <span className={cn('text-sm font-semibold font-mono', accent)}>
            {node.type === 'god' && node.god
              ? (GodIcon ? <span className="inline-flex items-center gap-1.5"><GodIcon size={14} />{node.name}</span> : node.name)
              : node.name}
          </span>
          <span className="text-[10px] text-olympus-text-dim uppercase tracking-wide px-1.5 py-0.5 rounded bg-olympus-bg/50">{node.type}</span>
        </div>
        <button onClick={() => setSelectedNode(null)} className="text-olympus-text-dim hover:text-olympus-text">
          <X size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll p-4 text-[12px] text-olympus-text font-mono space-y-3">
        {node.description && (
          <div>
            <div className="text-[10px] text-olympus-text-dim uppercase mb-1">Description</div>
            <div className="text-olympus-text leading-relaxed">{node.description}</div>
          </div>
        )}
        {node.domain && <Field label="Domain" value={node.domain} />}
        {node.model && <Field label="Model" value={`opencode-go/${node.model}`} />}
        {node.caveman && <Field label="Caveman" value={node.caveman} />}
        {node.army_size != null && <Field label="Army size" value={`${node.army_size} demigods`} />}
        {node.confidence != null && (
          <div>
            <div className="text-[10px] text-olympus-text-dim uppercase mb-1">Confidence</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-olympus-bg rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', node.confidence >= 0.7 ? 'bg-olympus-green' : 'bg-olympus-amber-soft')}
                  style={{ width: `${node.confidence * 100}%` }}
                />
              </div>
              <span className={node.confidence >= 0.7 ? 'text-olympus-green' : 'text-olympus-amber-soft'}>{node.confidence.toFixed(2)}</span>
            </div>
          </div>
        )}
        {node.god && (
          <div>
            <div className="text-[10px] text-olympus-text-dim uppercase mb-1">Owner god</div>
            <div className="flex items-center gap-1.5">
              {GodIcon ? <GodIcon size={11} className="text-olympus-gold" /> : <Cpu size={11} className="text-olympus-gold" />}
              <span className="text-olympus-gold capitalize">{node.god}</span>
            </div>
          </div>
        )}
        {node.type === 'god' && (
          <div className="pt-2 border-t border-olympus-gold/10">
            <div className="text-[10px] text-olympus-text-dim uppercase mb-1.5">Actions</div>
            <div className="grid grid-cols-2 gap-1.5">
              <ActionBtn label="View army" />
              <ActionBtn label="Open router" />
              <ActionBtn label="Inject instincts" />
              <ActionBtn label="Run compaction" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-olympus-text-dim uppercase mb-0.5">{label}</div>
      <div className="text-olympus-text">{value}</div>
    </div>
  );
}

function ActionBtn({ label }: { label: string }) {
  return (
    <button className="text-[10px] font-mono px-2 py-1.5 rounded border border-olympus-gold/15 text-olympus-text-dim hover:bg-olympus-gold/10 hover:text-olympus-gold hover:border-olympus-gold/30 transition-all">
      {label}
    </button>
  );
}
