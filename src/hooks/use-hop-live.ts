/**
 * use-hop-live.ts — the live hop subscription (v0.0.24, #227).
 *
 * One EventSource on /api/olympus/hops/stream; derives the in-flight set and
 * the current campaign from campaign_start / hop_start / hop_done /
 * hop_parked / campaign_end events. Falls back to the snapshot route if SSE
 * cannot connect. Pauses while the window is hidden.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocVisible } from '@/lib/use-doc-visible';
import type { HopLiveEvent } from '@/lib/hop-runtime/hop-events';

export interface LiveHop {
  hopId: string;
  god: string;
  startedAt: string;
  artifacts: string[];
  lane?: string | null;
  skill?: string | null;
  mcp?: string | null;
  demigod?: string | null;
  transport?: 'warm' | 'spawn' | null;
  elapsedMs: number;
}

export interface LiveCampaign {
  campaignId: string | null;
  project: string | null;
  total: number;
  completed: number;
  status: 'starting' | 'running' | 'done' | 'parked';
  startedAt: string;
}

export function useHopLive() {
  const docVisible = useDocVisible();
  const [events, setEvents] = useState<HopLiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string>>(new Set());
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!docVisible) return;
    let cancelled = false;
    const append = (ev: HopLiveEvent) => {
      if (!ev || typeof ev !== 'object' || !ev.type) return;
      const key = `${ev.type}|${ev.ts}|${ev.hop ?? ''}|${ev.campaignId ?? ''}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      setEvents((prev) => [...prev.slice(-499), ev]);
    };

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/olympus/hops/stream');
      es.onopen = () => { connectedRef.current = true; if (!cancelled) setConnected(true); };
      es.onmessage = (msg) => {
        if (cancelled) return;
        try { append(JSON.parse(msg.data)); } catch { /* heartbeat/ready */ }
      };
      es.onerror = () => { connectedRef.current = false; if (!cancelled) setConnected(false); };
    } catch { /* fall back below */ }

    // Snapshot seed (also the fallback when EventSource is unavailable).
    const seed = () => fetch('/api/olympus/hops?limit=300', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.events)) d.events.forEach(append); })
      .catch(() => {});
    void seed();
    const fallback = setInterval(() => {
      if (!connectedRef.current) void seed();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(fallback);
      try { es?.close(); } catch { /* already closed */ }
    };
  }, [docVisible]);

  // The 1s elapsed tick (UI only; the stream stays event-driven).
  useEffect(() => {
    if (!docVisible) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [docVisible]);

  const { inFlight, campaign } = useMemo(() => {
    const byHop = new Map<string, LiveHop>();
    let current: LiveCampaign | null = null;
    for (const ev of events) {
      if (ev.type === 'campaign_start') {
        current = {
          campaignId: ev.campaignId,
          project: ev.project ?? null,
          total: ev.total ?? 0,
          completed: 0,
          status: 'running',
          startedAt: ev.ts,
        };
        continue;
      }
      if (ev.type === 'campaign_end' && current && (ev.campaignId == null || ev.campaignId === current.campaignId)) {
        current = {
          ...current,
          completed: ev.completed ?? current.completed,
          status: (ev.reason ? 'parked' : 'done'),
        };
        continue;
      }
      if (!ev.hop) continue;
      if (ev.type === 'hop_start') {
        byHop.set(ev.hop, {
          hopId: ev.hop,
          god: ev.god ?? 'atlas',
          startedAt: ev.ts,
          artifacts: Array.isArray(ev.artifacts) ? ev.artifacts : [],
          lane: ev.lane ?? null,
          skill: ev.skill ?? null,
          mcp: ev.mcp ?? null,
          demigod: ev.demigod ?? null,
          transport: ev.transport ?? null,
          elapsedMs: 0,
        });
        if (current) current = { ...current, completed: current.completed };
      } else if (ev.type === 'hop_done' || ev.type === 'hop_parked') {
        byHop.delete(ev.hop);
        if (current) current = { ...current, completed: current.completed + (ev.type === 'hop_done' ? 1 : 0) };
      } else if (ev.type === 'hop_heartbeat') {
        const cur = byHop.get(ev.hop);
        if (cur) byHop.set(ev.hop, { ...cur, elapsedMs: ev.elapsedMs ?? 0 });
      }
    }
    const list = [...byHop.values()].map((h) => ({
      ...h,
      elapsedMs: Math.max(h.elapsedMs, now - new Date(h.startedAt).getTime()),
    }));
    return { inFlight: list, campaign: current as LiveCampaign | null };
  }, [events, now]);

  return { inFlight, campaign, connected, events };
}
