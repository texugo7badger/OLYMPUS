/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useOlympus, GOD_ICONS } from '@/lib/olympus-store';
import { ChevronDown, ChevronUp, Radio, ArrowRight, Cpu, Brain, Wrench, Sparkles, Folder, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* SSE Stream Panel (bottom).                                          */
/*                                                                     */
/*  - Empty state when no events (Issue 4 — no fake events on load).   */
/*  - Uses GOD_ICONS instead of emoji glyphs (Issue 5).                */
/*  - All glyph chars (→, ↳, ⚙, etc.) replaced with lucide icons.     */
/*  - Pastel palette throughout.                                       */
/* ------------------------------------------------------------------ */
export default function SSEStreamPanel() {
  const events = useOlympus(s => s.events);
  const open = useOlympus(s => s.bottomOpen);
  const toggle = useOlympus(s => s.toggleBottom);

  return (
    <div className={cn('shrink-0 bg-[#050810] border-t border-olympus-gold/10 flex flex-col transition-all', open ? 'h-44' : 'h-7')}>
      <div className="h-7 shrink-0 flex items-center justify-between px-3 border-b border-olympus-gold/10">
        <button onClick={toggle} className="flex items-center gap-2 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold">
          {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          <Radio size={11} className={events.length > 0 ? 'text-olympus-green animate-pulse' : 'text-olympus-text-dim'} />
          <span>SSE EVENT STREAM</span>
          <span className="text-[#5A5A5A]">·</span>
          <span className={events.length > 0 ? 'text-olympus-gold' : 'text-olympus-text-dim'}>{events.length}</span>
          <span className="text-[#5A5A5A]">events</span>
        </button>
        <div className="flex items-center gap-2 text-[9px] font-mono text-olympus-text-dim">
          {events.length > 0
            ? <><span className="text-olympus-green">●</span> live tail of ~/.olympus/metrics/activity.jsonl</>
            // Replaced "SSE offline — waiting for real dispatches"
            // (a) the word "offline" implies breakage, (b) the maintainer
            // asked for the empty-state copy to be educational. The new copy
            // tells the user what to do, not what's broken.
            : <><span className="text-olympus-amber-soft animate-pulse">○</span> Live stream idle — dispatch a task to Apollo to begin.</>
          }
        </div>
      </div>
      {open && (
        <div className="flex-1 overflow-y-auto custom-scroll px-3 py-1.5 font-mono text-[10px] space-y-0.5">
          {/* Polished empty state (replaces the old
              "SSE offline" / "Dispatch a task to Apollo to stream real events."
              copy). Tells the user what the panel shows + how to start. */}
          {events.length === 0 && (
            <div className="text-olympus-text-dim py-8 text-center">
              <div className="text-[11px] mb-1 text-olympus-gold">Live stream idle</div>
              <div className="text-[9px] text-[#5A5A5A] leading-relaxed">
                Dispatch a task to Apollo — events will stream here in real time as gods deliberate,
                <br />dispatch to demigods, write instincts, and call MCP tools.
              </div>
            </div>
          )}
          {[...events].reverse().map((e, i) => (
            <EventLine key={`${e.ts}-${i}`} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventLine({ e }: { e: any }) {
  const time = e.ts ? new Date(e.ts).toLocaleTimeString('en-US', { hour12: false }) : '';

  // Each event renders with an appropriate lucide icon + pastel color
  let Icon: any = Radio;
  let color = 'text-olympus-text-dim';
  let bg = '';
  let text = '';

  if (e.type === 'delegation') {
    Icon = ArrowRight; color = 'text-olympus-gold'; bg = 'bg-olympus-gold/5';
    text = `${cap(e.from)} → ${cap(e.to)}: ${e.task}`;
  } else if (e.type === 'dispatch') {
    Icon = Cpu; color = 'text-olympus-cyan'; bg = 'bg-olympus-cyan/5';
    text = `${cap(e.god)} → ${e.subagent}: ${e.task}`;
  } else if (e.type === 'tool_call') {
    Icon = Wrench; color = 'text-olympus-text-dim';
    text = `${cap(e.god)} · ${e.tool}`;
  } else if (e.type === 'instinct_write') {
    Icon = Sparkles; color = 'text-olympus-green'; bg = 'bg-olympus-green/5';
    text = `${cap(e.god)} wrote observation → ${e.file}`;
  } else if (e.type === 'learning_episode') {
    Icon = Brain; color = 'text-olympus-cyan'; bg = 'bg-olympus-cyan/5';
    text = `${cap(e.god)} session ended → episode persisted`;
  } else if (e.type === 'compact_start') {
    Icon = Brain; color = 'text-olympus-gold'; bg = 'bg-olympus-gold/10';
    text = e.msg;
  } else if (e.type === 'compact_phase') {
    Icon = Sparkles; color = 'text-olympus-green';
    text = `phase ${e.phase}: ${e.name} (+${e.fixed} fixed)`;
  } else if (e.type === 'compact_done') {
    Icon = Sparkles; color = 'text-olympus-green'; bg = 'bg-olympus-green/5';
    text = e.msg;
  } else if (e.type === 'heartbeat') {
    Icon = Radio; color = 'text-[#5A5A5A]';
    text = `heartbeat tick ${e.tick}`;
  } else if (e.type === 'prompt_received') {
    Icon = Brain; color = 'text-olympus-gold'; bg = 'bg-olympus-gold/10';
    text = e.msg;
  } else if (e.type === 'interview') {
    Icon = Brain; color = 'text-olympus-gold';
    text = e.msg;
  } else if (e.type === 'dispatch_complete') {
    Icon = Sparkles; color = 'text-olympus-green'; bg = 'bg-olympus-green/5';
    text = e.msg;
  } else if (e.type === 'time_scrub') {
    Icon = Folder; color = 'text-olympus-purple'; bg = 'bg-olympus-purple/5';
    text = e.msg;
  } else if (e.type === 'action_start') {
    Icon = Radio; color = 'text-olympus-cyan'; bg = 'bg-olympus-cyan/5';
    text = e.msg;
  } else if (e.type === 'action_done') {
    Icon = Sparkles; color = 'text-olympus-green'; bg = 'bg-olympus-green/5';
    text = e.msg;
  } else if (e.type === 'context_action') {
    Icon = Wrench; color = 'text-olympus-text'; bg = 'bg-olympus-text-dim/5';
    text = e.msg;
  } else if (e.type === 'evolved') {
    Icon = Sparkles; color = 'text-olympus-cyan'; bg = 'bg-olympus-cyan/5';
    text = `evolved: ${e.skill} from ${e.from_count} instincts (${e.god})`;
  } else if (e.type === 'pruned') {
    Icon = Lightbulb; color = 'text-olympus-amber-soft';
    text = `pruned: ${e.file} (${e.reason})`;
  } else if (e.type === 'log') {
    Icon = Radio; color = 'text-[#5A5A5A]';
    text = e.msg;
  } else {
    Icon = Radio; color = 'text-olympus-text-dim';
    text = e.msg || JSON.stringify(e).slice(0, 80);
  }

  // For delegation/dispatch events, render the god icons inline
  const FromIcon = e.from ? GOD_ICONS[e.from] : null;
  const ToIcon = e.to ? GOD_ICONS[e.to] : null;
  const GodIcon = e.god ? GOD_ICONS[e.god] : null;

  return (
    <div className={`flex items-start gap-2 hover:bg-olympus-gold/10 px-1.5 py-0.5 rounded transition-colors ${bg}`}>
      <span className="text-[#5A5A5A] shrink-0 tabular-nums">{time}</span>
      <Icon size={10} className={`shrink-0 mt-0.5 ${color}`} />
      <span className={`flex-1 ${color} truncate flex items-center gap-1`}>
        {(e.type === 'delegation') && FromIcon && ToIcon && (
          <>
            <FromIcon size={10} /> {e.from}
            <ArrowRight size={9} className="opacity-60" />
            <ToIcon size={10} /> {e.to}: {e.task}
          </>
        )}
        {(e.type === 'dispatch' || e.type === 'tool_call' || e.type === 'instinct_write' || e.type === 'learning_episode') && GodIcon && (
          <>
            <GodIcon size={10} /> {text}
          </>
        )}
        {!['delegation', 'dispatch', 'tool_call', 'instinct_write', 'learning_episode'].includes(e.type) && text}
      </span>
    </div>
  );
}

function cap(s?: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
