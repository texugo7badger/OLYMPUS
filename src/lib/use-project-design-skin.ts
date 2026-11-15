'use client';

/**
 * use-project-design-skin — v0.0.92.
 *
 * Reads the active project's design contract once and derives the Athena
 * design skin. The module cache means opening the studio and the in-chat
 * choice card does not refetch on every render.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useEffect, useState } from 'react';
import { fallbackSkin, skinFromContract, type DesignSkin } from './design-skin';

const cache = new Map<string, DesignSkin>();

export function useProjectDesignSkin(slug: string | null | undefined): DesignSkin {
  const key = String(slug || '');
  const [skin, setSkin] = useState<DesignSkin>(() => (key && cache.get(key)) || fallbackSkin());

  useEffect(() => {
    if (!key) { setSkin(fallbackSkin()); return; }
    const hit = cache.get(key);
    if (hit) { setSkin(hit); return; }
    let cancelled = false;
    void fetch(`/api/olympus/design-contract?slug=${encodeURIComponent(key)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok) return;
        const next = skinFromContract(d.contract);
        cache.set(key, next);
        setSkin(next);
      })
      .catch(() => { /* keep the neutral fallback */ });
    return () => { cancelled = true; };
  }, [key]);

  return skin;
}

export function invalidateProjectDesignSkin(slug: string): void {
  cache.delete(String(slug || ''));
}
