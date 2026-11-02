/**
 * follow-agent.tsx — v0.0.42 (R42-02): the editor follows the agent.
 *
 * When enabled, a god's write/edit tool call on a file inside the active
 * project opens that file in the user's editor (Zed/VSCode/VSCodium/Cursor).
 * Off by default — an editor that steals focus uninvited is a bug. The
 * subscription pauses when the window is hidden, debounces bursts and refuses
 * the same file twice within 5s.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOlympus } from '@/lib/olympus-store';
import { useDocVisible } from '@/lib/use-doc-visible';

const LS_KEY = 'olympus:follow-agent';
const EVENT = 'olympus:follow-agent-changed';

export function useFollowAgentSetting(): [boolean, (on: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return window.localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    const onChange = () => {
      try { setEnabled(window.localStorage.getItem(LS_KEY) === '1'); } catch { /* private */ }
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  const set = useCallback((on: boolean) => {
    try { window.localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* private */ }
    setEnabled(on);
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);
  return [enabled, set];
}

/** The always-mounted subscriber: renders nothing, follows file writes. */
export default function FollowAgent() {
  const docVisible = useDocVisible();
  const [enabled] = useFollowAgentSetting();
  const activeProject = useOlympus((s) => s.activeProject);
  const last = useRef<{ file: string; at: number }>({ file: '', at: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const root = activeProject?.path;
    if (!enabled || !docVisible || !root) return;
    let es: EventSource | null = null;

    const openFile = async (file: string) => {
      const now = Date.now();
      if (file === last.current.file && now - last.current.at < 5_000) return;
      last.current = { file, at: now };
      try {
        await fetch('/api/olympus/editor/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath: root, file }),
        });
      } catch { /* the editor lane is best-effort */ }
    };

    try {
      es = new EventSource('/api/olympus/activity');
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev?.action !== 'tool_call' || ev?.error) return;
          const file = ev?.meta?.file;
          if (typeof file !== 'string' || !file) return;
          // Only files inside the ACTIVE project; absolute paths from the
          // activity feed are the norm.
          if (!file.startsWith(root.endsWith('/') ? root : `${root}/`)) return;
          pending.current = file;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const next = pending.current;
            pending.current = null;
            if (next) void openFile(next);
          }, 700);
        } catch { /* torn event */ }
      };
    } catch { /* no stream */ }

    return () => {
      es?.close();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
    };
  }, [enabled, docVisible, activeProject?.path]);

  return null;
}
