/**
 * useDispatchDna — the live dispatch DNA for the brain atlas glow (#205).
 *
 * Polls /api/olympus/dispatches (open dispatches + the 24h recent tail) and
 * derives the node ids a live dispatch touches:
 *   god:<god>        — the dispatching neuron (gold, the god's own hue)
 *   skill:<skill>    — the equipped skill satellite (blue)
 *   mcp:<mcp>        — the equipped MCP satellite (teal)
 *   instinct:<id>    — the fired instinct satellite (green)
 *
 * The atlas feeds these ids to the renderer's working-god glow, so the
 * node network visibly carries the dispatch DNA. Throttled (15s poll) and
 * reduced-motion aware (no glow under the OS preference).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 15_000;
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;

export interface DispatchDna {
  ids: string[];
  colors: Record<string, string>;
}

const EMPTY: DispatchDna = { ids: [], colors: {} };

const GOD_COLORS: Record<string, string> = {
  apollo: '#D4A574', atlas: '#7FB3C8', hephaestus: '#C4756A',
  athena: '#7BAE8E', hermes: '#8FA8C8', artemis: '#9EC4A0',
  dionysus: '#A88BC8', persephone: '#C89FB8', prometheus: '#D8946A',
  callimachus: '#9AA8B8',
};

interface DnaRow {
  god?: string;
  skill?: string | null;
  mcp?: string | null;
  instinct?: string | null;
  ageMs?: number;
  status?: string;
}

export function useDispatchDna(): DispatchDna {
  const [dna, setDna] = useState<DispatchDna>(EMPTY);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduced?.matches) return; // calm atlas — no pulse under the OS preference
    let cancelled = false;

    const derive = async () => {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch('/api/olympus/dispatches?limit=40', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(to);
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const ids = new Set<string>();
        const colors: Record<string, string> = {};
        const rows: DnaRow[] = [...(d?.open || []), ...(d?.recent || [])];
        for (const row of rows) {
          const active = row.status === 'open' || (typeof row.ageMs === 'number' && row.ageMs <= ACTIVE_WINDOW_MS);
          if (!active) continue;
          if (row.god) {
            ids.add(`god:${row.god}`);
            colors[row.god] = GOD_COLORS[row.god] ?? '#D4A574';
          }
          if (row.skill) ids.add(`skill:${row.skill}`);
          if (row.mcp) ids.add(`mcp:${row.mcp}`);
          if (row.instinct) ids.add(`instinct:${row.instinct}`);
        }
        const arr = [...ids];
        setDna(prev =>
          prev.ids.length === arr.length && prev.ids.every((id, i) => id === arr[i]) ? prev : { ids: arr, colors },
        );
      } catch { /* decorative — a dead API means no glow, never an error */ }
    };

    derive();
    const iv = setInterval(derive, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return dna;
}
