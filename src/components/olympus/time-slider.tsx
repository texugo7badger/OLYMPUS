/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useOlympus } from '@/lib/olympus-store';
import { Clock, Play, Pause, SkipBack, SkipForward, GitCommit } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GitCommit {
  hash: string;
  shortHash: string;
  ts: string;
  message: string;
  author: string;
  // Brain-state fields are optional — the /api/olympus/history route returns
  // only git metadata (hash, ts, author, message) in v0.0.1. Brain-state
  // snapshots (nodeCount, instinctCount, avgConfidence, etc.) are not computed
  // per commit yet (expensive: requires checkout + buildGraph per commit).
  // The UI shows '--' for these until per-commit brain state is implemented.
  nodeCount?: number;
  linkCount?: number;
  instinctCount?: number;
  skillCount?: number;
  agentCount?: number;
  avgConfidence?: number;
}

/**
 * Time Slider — scrubs through vault git history to visualize brain evolution
 * over time (spec §Ⅹ-B "time slider scrubs git history"). Sits at the bottom
 * of the brain view. Shows commit markers, a draggable handle, brain-state
 * stats at the selected commit, and play/pause for auto-scrubbing.
 */
export default function TimeSlider() {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selected, setSelected] = useState(0); // index into commits (0 = oldest)
  const [playing, setPlaying] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(true); // true = latest commit (live mode)
  const trackRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<any>(null);
  const pushEvent = useOlympus(s => s.pushEvent);
  const setGraphData = useOlympus(s => s.setGraphData);

  useEffect(() => {
    fetch('/api/olympus/history', { cache: 'no-store' }).then(r => r.json()).then(d => {
      const cs = d.commits || [];
      setCommits(cs);
      setSelected(cs.length - 1); // default to latest
    }).catch(() => {});
  }, []);

  // Fetch snapshot when selected changes (and not at latest = live mode)
  useEffect(() => {
    if (commits.length === 0) return;
    const isLatest = selected === commits.length - 1;
     
    setIsLive(isLatest);
    if (isLatest) {
      // Live mode: fetch the full current graph
      fetch('/api/olympus/graph', { cache: 'no-store' }).then(r => r.json()).then(d => setGraphData(d.graph)).catch(() => {});
    } else {
      // Historical mode: fetch snapshot at this commit
      fetch(`/api/olympus/snapshot?commit=${selected}`).then(r => r.json()).then(d => setGraphData(d.graph)).catch(() => {});
    }
  }, [selected, commits.length, setGraphData]);

  // Auto-play
  useEffect(() => {
    if (!playing || commits.length === 0) return;
    playRef.current = setInterval(() => {
      setSelected(s => {
        if (s >= commits.length - 1) { setPlaying(false); return s; }
        return s + 1;
      });
    }, 1500);
    return () => clearInterval(playRef.current);
  }, [playing, commits.length]);

  const current = commits[selected];

  const handleClick = useCallback((idx: number) => {
    setSelected(idx);
    setPlaying(false);
    if (commits[idx]) {
      pushEvent({ type: 'time_scrub', commit: commits[idx].shortHash, ts: new Date().toISOString(), msg: `Scrubbed to ${commits[idx].shortHash} (${commits[idx].ts.slice(0,16)})` });
    }
  }, [commits, pushEvent]);

  if (commits.length === 0) return null;
  const oldest = commits[0];
  const newest = commits[commits.length - 1];

  return (
    <div className="absolute bottom-14 left-3 right-3 z-30 bg-olympus-card/90 backdrop-blur-md border border-olympus-gold/25 rounded-lg shadow-2xl shadow-olympus-gold/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header: current commit info */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-olympus-gold/10">
        <div className="flex items-center gap-1.5 text-olympus-gold shrink-0">
          <Clock size={12} />
          <span className="text-[10px] font-mono uppercase tracking-wide">Time Slider</span>
        </div>
        {/* Live/Historical badge */}
        {isLive ? (
          <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-olympus-green/20 text-olympus-green ring-1 ring-olympus-green/40 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-olympus-green animate-pulse" /> LIVE
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/40 shrink-0">
            <Clock size={9} /> HISTORICAL
          </span>
        )}
        {current && (
          <div className="flex items-center gap-3 text-[10px] font-mono min-w-0 flex-1">
            <span className="flex items-center gap-1 text-olympus-gold shrink-0">
              <GitCommit size={10} />
              {current.shortHash}
            </span>
            <span className="text-olympus-text-dim truncate">{current.message}</span>
            <span className="text-[#5A5A5A] shrink-0">{new Date(current.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        {/* Stats badges */}
        {current && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Stat label="nodes" value={current.nodeCount ?? '--'} color="text-olympus-gold" />
            <Stat label="instincts" value={current.instinctCount ?? '--'} color="text-olympus-green" />
            <Stat
              label="conf"
              value={typeof current.avgConfidence === 'number' ? current.avgConfidence.toFixed(2) : '--'}
              color="text-olympus-cyan"
            />
          </div>
        )}
      </div>

      {/* Slider track */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Transport controls — tooltips removed; the icons are universal. */}
        <button
          onClick={() => handleClick(0)}
          disabled={selected === 0}
          aria-label="Oldest commit"
          className="text-olympus-text-dim hover:text-olympus-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <SkipBack size={13} />
        </button>
        <button
          onClick={() => setPlaying(p => !p)}
          disabled={selected >= commits.length - 1 && !playing}
          aria-label={playing ? "Pause" : "Play through history"}
          className="w-7 h-7 rounded-full bg-olympus-gold/20 hover:bg-olympus-gold/30 ring-1 ring-olympus-gold/40 flex items-center justify-center text-olympus-gold disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
        <button
          onClick={() => handleClick(commits.length - 1)}
          disabled={selected === commits.length - 1}
          aria-label="Latest commit"
          className="text-olympus-text-dim hover:text-olympus-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <SkipForward size={13} />
        </button>

        {/* Track with commit markers */}
        <div
          ref={trackRef}
          className="flex-1 relative h-6 flex items-center"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Track line */}
          <div className="absolute left-0 right-0 h-0.5 bg-olympus-bg rounded-full" />
          <div
            className="absolute left-0 h-0.5 bg-linear-to-r from-olympus-amber via-olympus-gold to-olympus-gold rounded-full transition-all duration-300"
            style={{ width: `${commits.length > 1 ? (selected / (commits.length - 1)) * 100 : 100}%` }}
          />
          {/* Commit markers */}
          {commits.map((c, i) => (
            <button
              key={c.hash}
              onClick={() => handleClick(i)}
              onMouseEnter={() => setHoverIdx(i)}
              className="absolute -translate-x-1/2 group"
              style={{ left: `${commits.length > 1 ? (i / (commits.length - 1)) * 100 : 50}%` }}
            >
              <div className={cn(
                'w-2.5 h-2.5 rounded-full border-2 transition-all',
                i === selected
                  ? 'bg-olympus-gold border-olympus-gold scale-125 shadow-[0_0_8px_rgba(212,165,116,0.6)]'
                  : i < selected
                    ? 'bg-olympus-amber/60 border-olympus-gold/40 hover:scale-110'
                    : 'bg-[#5A5A5A] border-[#5A5A5A] hover:scale-110 hover:bg-olympus-text-dim'
              )} />
              {/* Hover tooltip — Olympus-styled, no glow */}
              {hoverIdx === i && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-olympus-card border border-olympus-gold/20 rounded-md px-2 py-1 text-[9px] font-mono text-olympus-text whitespace-nowrap z-50 shadow-md pointer-events-none">
                  <div className="text-olympus-gold">{c.shortHash}</div>
                  <div className="text-olympus-text-dim">{new Date(c.ts).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</div>
                  <div className="text-[#5A5A5A] mt-0.5">{c.nodeCount} nodes · {c.instinctCount} instincts</div>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Range labels */}
        <div className="flex flex-col items-end text-[8px] font-mono text-[#5A5A5A] shrink-0">
          <span>{new Date(oldest.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          <span>→ {new Date(newest.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="flex items-center gap-1 text-[9px] font-mono">
      <span className="text-[#5A5A5A]">{label}</span>
      <span className={cn('font-bold', color)}>{value}</span>
    </div>
  );
}