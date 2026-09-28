/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * TerminalTabs — multi-tab terminal panel (xterm.js + node-pty).
 *
 * The IDE's terminal surface. Replaces the singleton
 * NativeTerminal with a tabbed multi-PTY layout (like VS Code's terminal
 * panel).
 *
 * Fixes two critical bugs:
 *
 * BUG 1 (blank OpenCode TUI): The PTY's first frame (containing the
 * \x1b[?1049h alt-screen switch and the TUI's initial paint) was
 * emitted BEFORE the renderer registered the ptyId in ptyTabMap. The
 * onOutput callback dropped it ("unknown ptyId"), so xterm.js stayed
 * in the normal buffer showing nothing.
 *
 * FIX: ATTACH HANDSHAKE. The main process buffers PTY output until the
 * renderer calls `olympus.terminal.attach(ptyId)`. The renderer calls
 * attach AFTER (a) the ptyId is registered in ptyTabMap AND (b) the
 * xterm.js Terminal has been opened (term.open(container)). This
 * guarantees no output is ever dropped.
 *
 * BUG 2 (unresponsive shell): Same root cause — output was dropped.
 * Also, the old Windows spawn target used `powershell.exe -Command`,
 * which puts PowerShell in a non-interactive mode where PSReadLine's
 * line editor is bypassed and typed characters aren't echoed.
 *
 * FIX: ATTACH HANDSHAKE (same as Bug 1) + the spawn target fix in
 * electron/native-terminal.ts (use `powershell.exe -NoLogo -NoProfile`
 * for shell, `cmd.exe /k opencode` for the TUI).
 *
 * ALSO: xterm.js `windowsPty` option is now set on Windows so ConPTY's
 * scrollback reflow and resize workarounds are applied. Without this,
 * after the first resize the viewport can fill with blank rows.
 *
 * Tabs:
 * • "+" dropdown — create a new terminal with one of:
 * - Shell (interactive $SHELL)
 * - OpenCode TUI (the OpenCode CLI in TUI mode)
 * - Custom command (free-form shell command)
 * • Each tab owns its own ptyId (managed by electron/native-terminal.ts).
 * • Each tab has its own xterm.js Terminal instance.
 * • Close button kills the PTY.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
 Plus, X, Loader2, RefreshCw, AlertCircle, Terminal as TerminalIcon,
 ChevronDown, CornerDownLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOlympus } from '@/lib/olympus-store';
import OlympusTooltip from './olympus-tooltip';
import '@xterm/xterm/css/xterm.css';

// Removed the OpenCodeChatPane dynamic import. The
// Olympus Terminal now only renders the Apollo chat (interactive-terminal.tsx),
// and the IDE terminal only supports shell + command tabs. The opencode kind
// is kept in the type system for backward compat but is no longer creatable
// via the UI (the create menu only shows Shell + Custom Command).

interface TerminalTab {
 id: string; // tab id (uuid, generated client-side)
 ptyId: string | null; // pty id from the main process (null while spawning / on error)
 label: string;
 kind: 'shell' | 'opencode' | 'command';
 status: 'starting' | 'ready' | 'error' | 'exited';
 errorMsg?: string;
 	// Set to true if no PTY output has been received
 	// within 5 seconds of the PTY being created. The TerminalPane shows a
 	// "Terminal not responding — click to restart" banner when this is true.
 notResponding?: boolean;
}

interface TerminalTabsProps {
	 /** Height of the panel (controlled by the parent's resizable layout). */
	 className?: string;
	 /** The kind of terminal to auto-create on first mount.
 * Default: 'shell'. Set to 'opencode' for the Frames tab's OpenCode TUI
 * preset (so it auto-creates an OpenCode TUI tab instead of a Shell). */
 initialKind?: 'shell' | 'opencode' | 'command';
	 /** Restrict the create menu to only show certain kinds.
 * Default: all kinds. Set to ['opencode'] for the base terminal (only
 * allows adding OpenCode TUI instances). */
 allowedKinds?: Array<'shell' | 'opencode' | 'command'>;
	 /** When true, hide the tab bar (+ button, tab list).
 * Used by the Frames tab's OpenCode TUI preset, which renders its own
 * god-tab bar above the terminal. The single auto-created tab fills
 * the full height. */
 hideTabBar?: boolean;
	 /** When set, inject `opencode run --agent olympus-<god>`
 * into the active tab's PTY. Used by the Frames tab's god-tab bar. */
 activeGodTab?: string;
}

/* ------------------------------------------------------------------ */
/* Module-level state — shared between TerminalTabs (parent) and */
/* TerminalPane (child). Using module-level Maps instead of React */
/* refs because the pane's xterm.js onData callback needs the latest */
/* ptyId without re-subscribing on every state change. */
/* ------------------------------------------------------------------ */

let tabIdCounter = 0;
function newTabId(): string {
 tabIdCounter += 1;
 return `tab-${Date.now()}-${tabIdCounter}`;
}

/** tabId -> ptyId. Written by TerminalTabs on spawn, read by TerminalPane
 * on every keystroke (so restartTerminal's ptyId swap is picked up live). */
const tabPtyMap = new Map<string, string>();
/** ptyId -> tabId. Used by the global onOutput router. */
const ptyTabMap = new Map<string, string>();
/** tabId -> { term, fit, container, disposables }. Owned by TerminalPane. */
const termRegistry = new Map<string, {
 term: Terminal;
 fit: FitAddon;
 container: HTMLDivElement | null;
 disposables: Array<{ dispose?: () => void }>;
}>();

/**
 * Module-level instance tracking.
 *
 * Each TerminalTabs mount gets a unique instance ID. The `_autoCreatedInstances`
 * Set tracks which instances have already auto-created their initial tab.
 * This prevents duplicate Shell tabs from appearing when:
 * - React StrictMode double-mounts the component in dev
 * - The component remounts when switching tabs
 * - The main effect's cleanup runs and re-runs
 *
 * Module-level state persists across ALL renders and mount/unmount cycles,
 * unlike useRef (which is per-instance) or useState (which resets on remount).
 */
let _instanceCounter = 0;
const _autoCreatedInstances = new Set<number>();

/**
 * Set of tabIds whose xterm.js Terminal has been
 * opened (term.open(container) called). Used by the attach handshake:
 * we only call `olympus.terminal.attach(ptyId)` AFTER the term is opened,
 * so the main process's buffered output is flushed into a Terminal that's
 * actually ready to receive it.
 */
const tabTermReady = new Set<string>();

/**
 * DEFENSIVE RENDERER BUFFER.
 *
 * Even with the main-process attach handshake, there's a tiny window
 * where output can arrive before termRegistry is set (e.g. during React
 * Strict Mode's double-mount in dev). This buffer catches any output
 * for a ptyId whose term isn't ready yet, and flushes it when the term
 * becomes ready.
 *
 * In production (no Strict Mode), this buffer is almost never used —
 * the main-process handshake handles everything. But it's a 5-line
 * safety net that prevents silent data loss.
 */
const pendingOutput = new Map<string, string[]>();

/**
 * Terminal health check.
 *
 * Tracks the timestamp of the last PTY output per ptyId. When a PTY is
 * created, a 5-second timer starts. If no output is received within 5s,
 * the corresponding tab is marked `notResponding: true` and the
 * TerminalPane shows a "Terminal not responding — click to restart"
 * banner with a restart button.
 *
 * The timer is cleared on the first output event (the terminal is alive).
 * It's also cleared when the PTY is killed or the tab is closed.
 */
const ptyLastOutputAt = new Map<string, number>();
const ptyHealthTimers = new Map<string, ReturnType<typeof setTimeout>>();

function markPtyOutput(ptyId: string): void {
 ptyLastOutputAt.set(ptyId, Date.now());
 // Clear the health-check timer — the terminal is alive.
 const timer = ptyHealthTimers.get(ptyId);
 if (timer) {
 clearTimeout(timer);
 ptyHealthTimers.delete(ptyId);
 }
}

function startHealthCheck(ptyId: string, onNotResponding: () => void): void {
 // Clear any existing timer for this ptyId.
 const existing = ptyHealthTimers.get(ptyId);
 if (existing) clearTimeout(existing);
 // If output already arrived, no need to start the timer.
 if (ptyLastOutputAt.has(ptyId)) return;
 const timer = setTimeout(() => {
 // If still no output after 5s, fire the callback.
 if (!ptyLastOutputAt.has(ptyId)) {
 onNotResponding();
 }
 ptyHealthTimers.delete(ptyId);
 }, 5000);
 ptyHealthTimers.set(ptyId, timer);
}

function clearHealthCheck(ptyId: string): void {
 const timer = ptyHealthTimers.get(ptyId);
 if (timer) {
 clearTimeout(timer);
 ptyHealthTimers.delete(ptyId);
 }
 ptyLastOutputAt.delete(ptyId);
}

/**
 * Try to write `data` for `ptyId` to the corresponding xterm.js Terminal.
 * If the ptyId isn't in ptyTabMap yet, OR the tabId isn't in termRegistry
 * yet, buffer the data in `pendingOutput` for later flushing.
 *
 * The chatPanePtyIds set is no longer needed because
 * the chat pane (opencode-chat-pane.tsx) no longer uses a PTY. It uses the
 * one-shot `window.olympus.opencode.run()` IPC channel instead, which is
 * completely separate from the PTY API. So all PTY output belongs to
 * shell/command tabs and is handled here.
 */
function routePtyOutput(ptyId: string, data: string): void {
	 // Mark this PTY as having produced output (clears
	 // the not-responding health-check timer).
 markPtyOutput(ptyId);
 const tabId = ptyTabMap.get(ptyId);
 if (!tabId) {
 // ptyId not yet registered — buffer and wait.
 let buf = pendingOutput.get(ptyId);
 if (!buf) { buf = []; pendingOutput.set(ptyId, buf); }
 buf.push(data);
 return;
 }
 const entry = termRegistry.get(tabId);
 if (!entry) {
 // Tab not yet mounted/registered — buffer and wait.
 let buf = pendingOutput.get(ptyId);
 if (!buf) { buf = []; pendingOutput.set(ptyId, buf); }
 buf.push(data);
 return;
 }
 try { entry.term.write(data); } catch {}
}

/**
 * Flush any buffered output for `ptyId` to its xterm.js Terminal.
 * Called after ptyTabMap.set AND after termRegistry.set.
 */
function flushPendingOutput(ptyId: string): void {
 const buf = pendingOutput.get(ptyId);
 if (!buf || buf.length === 0) return;
 pendingOutput.delete(ptyId);
 for (const data of buf) {
 routePtyOutput(ptyId, data);
 }
}

/**
 * Compute the xterm.js `windowsPty` option.
 *
 * On Windows, this MUST be set so xterm.js applies ConPTY-specific
 * workarounds (scrollback reflow on resize, wrapped-line detection).
 * Without it, after the first resize the viewport can fill with blank
 * rows — which looks identical to a "blank TUI".
 *
 * On non-Windows, returns `undefined` (no ConPTY workarounds needed).
 *
 * The OS info is fetched ONCE at module load via the preload's sync
 * `getOsInfo()` IPC call. This is fast (sync IPC, ~1ms) and the result
 * never changes during the app's lifetime.
 */
const OS_INFO: { platform: string; windowsBuildNumber: number } = (() => {
 try {
 const olympus = (window as any).olympus;
 if (olympus?.getOsInfo) {
 return olympus.getOsInfo();
 }
 // Fallback when not in Electron (e.g. Next.js dev in a browser).
 // Use the browser's userAgent to detect Windows.
 if (typeof navigator !== 'undefined' && /Win32|Win64|Windows/.test(navigator.userAgent)) {
 return { platform: 'win32', windowsBuildNumber: 0 };
 }
 return { platform: 'unknown', windowsBuildNumber: 0 };
 } catch {
 return { platform: 'unknown', windowsBuildNumber: 0 };
 }
})();

function getWindowsPtyOption(): { backend: 'conpty'; buildNumber: number } | undefined {
 	 // Previously required `windowsBuildNumber > 0`, which
 	 // disabled the ConPTY workaround whenever the build number was unknown
 // (preload IPC failure, browser fallback, etc.). Without this option,
 // xterm.js doesn't apply ConPTY-specific scrollback reflow + resize
 // workarounds — after the first resize, the viewport fills with blank
 // rows (the exact "blank TUI" symptom). Now we return the option for
 // ANY Windows platform, using 0 as the build number if unknown. xterm.js
 // still applies the ConPTY workarounds with buildNumber: 0.
 if (OS_INFO.platform === 'win32') {
 return { backend: 'conpty', buildNumber: OS_INFO.windowsBuildNumber };
 }
 return undefined;
}

export default function TerminalTabs({ className, initialKind = 'shell', hideTabBar = false, activeGodTab, allowedKinds }: TerminalTabsProps) {
 const [tabs, setTabs] = useState<TerminalTab[]>([]);
 const [activeTabId, setActiveTabId] = useState<string | null>(null);
 const [showCreateMenu, setShowCreateMenu] = useState(false);

 // Assign a unique instance ID for this
 // TerminalTabs mount. Used by the module-level `_autoCreatedInstances` Set
 // to prevent duplicate auto-creation. The ID is assigned once per mount
 // via useRef (stable across re-renders, but new on each mount).
 const _instanceIdRef = useRef<number>(-1);
 if (_instanceIdRef.current === -1) {
 _instanceCounter += 1;
 _instanceIdRef.current = _instanceCounter;
 }
 const _instanceId = _instanceIdRef.current;

 // Ref that tracks the CURRENT set of tabIds owned by
 // this TerminalTabs instance. Used by the cleanup function to kill
 // only OUR PTYs on unmount (not PTYs from other TerminalTabs mounts,
 // though in practice there's only ever one TerminalTabs mounted).
 const ourTabIdsRef = useRef<Set<string>>(new Set());

 // ─── Output routing — one global callback per TerminalTabs mount ──────
 useEffect(() => {
 const olympus = (window as any).olympus;
 if (!olympus?.terminal) return;

 // Use routePtyOutput() which buffers output
 // for unknown ptyIds instead of dropping them. This is the DEFENSIVE
 // renderer buffer (the main-process attach handshake is the primary
 // fix, but this catches any edge cases).
 olympus.terminal.onOutput((ptyId: string, data: string) => {
 routePtyOutput(ptyId, data);
 });

 olympus.terminal.onExit((ptyId: string, info: { exitCode: number; signal?: number }) => {
 const tabId = ptyTabMap.get(ptyId);
 if (!tabId) return;
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, status: 'exited' } : t,
 ));
 const entry = termRegistry.get(tabId);
 if (entry) {
 try {
 entry.term.writeln('');
 entry.term.writeln(`\x1b[38;2;196;117;106m [process exited (code=${info.exitCode})]\x1b[0m`);
 } catch {}
 }
 });

 olympus.terminal.onSpawnFailed((info: { kind: string; label: string; error: string; message?: string; exitCode?: number }) => {
 	 // Surface the ACTUAL error message from the
 	 // main process (ABI mismatch, missing shell, spawn exception, etc.)
 // instead of the generic "Failed to spawn terminal." This makes the
 // terminal debuggable: the user sees exactly what went wrong + the fix.
 let errorMsg: string;
 if (info.error === 'opencode-not-found') {
 errorMsg = 'OpenCode not installed locally. Run: npm run install-opencode (or: npm install --include=dev)';
 } else if (info.error === 'conpty-unavailable') {
 errorMsg = 'ConPTY not available. Upgrade Windows to 10 1809+ (build 18309+).';
 } else if (info.error === 'node-pty-load-failed') {
 // node-pty native module failed to load — ABI mismatch.
 // Show the full diagnostic message from the main process.
 errorMsg = info.message || 'node-pty native module failed to load. Run: npx electron-rebuild -f -w node-pty';
 } else if (info.error === 'silent-failure') {
 errorMsg = `Terminal exited silently (code=${info.exitCode ?? '?'}). See ~/.olympus/native-terminal.log for details.`;
 } else if (info.error === 'spawn-exception') {
 // spawnPty threw — show the actual exception message + diagnostic.
 errorMsg = info.message || 'Terminal spawn threw an exception. See ~/.olympus/native-terminal.log for details.';
 } else {
 errorMsg = info.message || info.error || 'Failed to spawn terminal.';
 }
 setTabs((prev) => prev.map((t) =>
 t.kind === info.kind && t.status === 'starting'
 ? {
 ...t,
 status: 'error',
 errorMsg,
 }
 : t,
 ));
 });

	 // KILL ALL PTYs ON UNMOUNT.
 // When TerminalTabs unmounts (e.g. when the IDE tab is switched
 // away, or when the whole RightPane unmounts during a focus-mode
 // toggle), we kill all PTYs that belong to THIS TerminalTabs
 // instance. This prevents zombie PTYs from accumulating in the
 // Electron main process.
 //
 // The `ourTabIdsRef` tracks every tabId we created. On cleanup,
 // we kill each one's PTY and dispose its xterm.js instance.
 return () => {
 try { olympus.terminal.off(); } catch {}
 for (const tabId of ourTabIdsRef.current) {
 const ptyId = tabPtyMap.get(tabId);
 if (ptyId) {
 try { olympus.terminal.kill(ptyId); } catch {}
 tabPtyMap.delete(tabId);
 ptyTabMap.delete(ptyId);
	 // Clean up the defensive buffer too.
 pendingOutput.delete(ptyId);
	 // Clear the health-check timer.
 clearHealthCheck(ptyId);
 }
 const entry = termRegistry.get(tabId);
 if (entry) {
 entry.disposables.forEach((d) => { try { d.dispose?.(); } catch {} });
 try { entry.term.dispose(); } catch {}
 termRegistry.delete(tabId);
 }
	 // Clean up the term-ready set.
 tabTermReady.delete(tabId);
 }
 ourTabIdsRef.current.clear();
 // Do NOT reset the auto-create
 // guard here. The old code reset `autoCreateRef.current = false` in
 // this cleanup, which caused duplicate Shell tabs in production:
 // every time the component re-rendered or the cleanup ran, the guard
 // was reset, and the next effect run created ANOTHER tab. The new
 // module-level `_autoCreatedInstances` Set (keyed by instance ID)
 // handles this correctly — it persists across ALL renders and
 // mount/unmount cycles, so each instance only auto-creates once.
 };
 }, []);

 // ─── Create a new terminal ─────────────────────────────────────────────
 const createTerminal = useCallback(async (kind: 'shell' | 'opencode' | 'command', command?: string) => {
 const olympus = (window as any).olympus;
 if (!olympus?.terminal) {
 alert('Terminals are only available inside the Electron desktop app.');
 return;
 }

 // The store has `activeProject` (a ProjectNote with
 // a `path` field), NOT `projectPath`. The previous code read
 // `useOlympus.getState().projectPath` which was always undefined, so the
 // terminal always spawned in the user's home directory. Now we read
 // `activeProject?.path` which is the actual project directory.
 const activeProject = useOlympus.getState().activeProject;
 const cwd = activeProject?.path || null; // null = native-terminal.ts uses homedir()

 const tabId = newTabId();
 // Opencode label is now 'OpenCode Chat' (was 'OpenCode TUI').
 const label = kind === 'opencode' ? 'OpenCode Chat' : kind === 'shell' ? 'Shell' : (command || 'Command');
 const newTab: TerminalTab = {
 id: tabId,
 ptyId: null,
 label,
 kind,
 status: 'starting',
 };
 setTabs((prev) => [...prev, newTab]);
 setActiveTabId(tabId);
 // Track this tabId so the cleanup function can kill
 // its PTY on unmount.
 ourTabIdsRef.current.add(tabId);

 // For kind:'opencode', the OpenCodeChatPane component
 // manages its own PTY lifecycle (it calls olympus.terminal.create() with
 // kind:'opencode' internally, spawns `opencode run --format json --auto -`,
 // and parses the JSONL stream). We don't create a PTY here — we just add
 // the tab and let the chat pane handle the rest. The chat pane calls
 // onReady() when it's spawned the PTY, which sets the tab status to 'ready'.
 if (kind === 'opencode') {
 return;
 }

 try {
 const ptyId = await olympus.terminal.create({ kind, command, cols: 120, rows: 30, label, cwd });
 if (!ptyId) {
 setTabs((prev) => prev.map((t) =>
 t.id === tabId
 ? {
 ...t,
 status: 'error',
 errorMsg: 'Failed to spawn terminal. Check ~/.olympus/native-terminal.log for details.',
 }
 : t,
 ));
 return;
 }
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, ptyId, status: 'ready' } : t,
 ));
 tabPtyMap.set(tabId, ptyId);
 ptyTabMap.set(ptyId, tabId);
 // Flush any output that was buffered by the
 // defensive renderer buffer while the ptyId was unregistered.
 flushPendingOutput(ptyId);
 // Start the 5s health-check timer. If no PTY
 // output arrives within 5s, mark the tab as notResponding so the
 // TerminalPane shows a restart banner.
 startHealthCheck(ptyId, () => {
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, notResponding: true } : t,
 ));
 });
 // ATTACH HANDSHAKE.
 //
 // Tell the main process to flush its internal output buffer for this
 // PTY. We do this AFTER ptyTabMap.set so the onOutput callback can
 // route the flushed output to the right tab.
 //
 // BUT — we only call attach if the xterm.js Terminal is already open
 // (tabTermReady has the tabId). If the term isn't open yet, the
 // TerminalPane will call attach when it finishes opening (via
 // onTermReady). This handles the race where the term isn't mounted
 // yet when the ptyId arrives.
 if (tabTermReady.has(tabId)) {
 try { await olympus.terminal.attach(ptyId); } catch {}
 }
 } catch (e: any) {
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, status: 'error', errorMsg: e.message } : t,
 ));
 }
 }, []);

 // ─── Close a terminal ──────────────────────────────────────────────────
 const closeTerminal = useCallback(async (tabId: string) => {
 const olympus = (window as any).olympus;
 const ptyId = tabPtyMap.get(tabId);
 if (ptyId && olympus?.terminal) {
 try { await olympus.terminal.kill(ptyId); } catch {}
 // Clear the health-check timer + output tracking.
 clearHealthCheck(ptyId);
 }
 const entry = termRegistry.get(tabId);
 if (entry) {
 entry.disposables.forEach((d) => { try { d.dispose?.(); } catch {} });
 try { entry.term.dispose(); } catch {}
 termRegistry.delete(tabId);
 }
 tabPtyMap.delete(tabId);
 if (ptyId) ptyTabMap.delete(ptyId);
 // Clean up the term-ready set and the
 // defensive output buffer for this tab.
 tabTermReady.delete(tabId);
 if (ptyId) pendingOutput.delete(ptyId);
 // Remove from our tracking set so the cleanup
 // function doesn't try to kill an already-killed PTY.
 ourTabIdsRef.current.delete(tabId);

 setTabs((prev) => {
 const next = prev.filter((t) => t.id !== tabId);
 if (activeTabId === tabId) {
 setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
 }
 return next;
 });
 }, [activeTabId]);

 // ─── Restart a terminal ────────────────────────────────────────────────
 const restartTerminal = useCallback(async (tabId: string) => {
 const tab = tabs.find((t) => t.id === tabId);
 if (!tab) return;
	 // Opencode tabs are managed by OpenCodeChatPane, which
	 // has its own Restart button. The parent's restartTerminal is only called
	 // from the TerminalPane error UI (shell/command tabs). Skip opencode tabs
	 // here so we don't spawn a stray PTY.
 if (tab.kind === 'opencode') return;
 const olympus = (window as any).olympus;
 const oldPtyId = tabPtyMap.get(tabId);
 if (oldPtyId && olympus?.terminal) {
 try { await olympus.terminal.kill(oldPtyId); } catch {}
 ptyTabMap.delete(oldPtyId);
 // Clean up the defensive buffer for the
 // old PTY (any buffered output is stale now).
 pendingOutput.delete(oldPtyId);
 // Clear the old health-check timer.
 clearHealthCheck(oldPtyId);
 }
 tabPtyMap.delete(tabId);

 // Clear notResponding + reset to starting.
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, ptyId: null, status: 'starting', errorMsg: undefined, notResponding: false } : t,
 ));

 const entry = termRegistry.get(tabId);
 if (entry) { try { entry.term.clear?.(); } catch {} }

 try {
 // Use activeProject?.path (NOT the non-existent
 // projectPath field) so the restarted terminal opens in the project's
 // directory.
 const cwd = useOlympus.getState().activeProject?.path || null;
 const ptyId = await olympus.terminal.create({ kind: tab.kind, cols: 120, rows: 30, label: tab.label, cwd });
 if (!ptyId) {
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, status: 'error', errorMsg: 'Failed to spawn terminal.' } : t,
 ));
 return;
 }
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, ptyId, status: 'ready' } : t,
 ));
 tabPtyMap.set(tabId, ptyId);
 ptyTabMap.set(ptyId, tabId);
 // Flush any output buffered by the defensive
 // renderer buffer while the ptyId was unregistered.
 flushPendingOutput(ptyId);
 // Start the health-check timer for the restarted
 // terminal. Also clear the notResponding flag from the previous run.
 startHealthCheck(ptyId, () => {
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, notResponding: true } : t,
 ));
 });
 // ATTACH HANDSHAKE for restart.
 //
 // On restart, the xterm.js Terminal is ALREADY open (we just cleared
 // its content with term.clear()). So tabTermReady should already have
 // this tabId. We call attach immediately to flush the new PTY's
 // buffered output.
 //
 // If for some reason tabTermReady doesn't have the tabId (e.g. the
 // term was disposed), the TerminalPane's onTermReady will call attach
 // when it re-opens.
 if (tabTermReady.has(tabId)) {
 try { await olympus.terminal.attach(ptyId); } catch {}
 }
 } catch (e: any) {
 setTabs((prev) => prev.map((t) =>
 t.id === tabId ? { ...t, status: 'error', errorMsg: e.message } : t,
 ));
 }
 }, [tabs]);

 // HandleTermReady callback.
 //
 // Called by TerminalPane AFTER term.open(container) completes. This is
 // the other half of the attach handshake: if the ptyId is already
 // available (createTerminal finished first), we call attach now. If not,
 // createTerminal will call attach when it finishes (it checks
 // tabTermReady.has(tabId)).
 //
 // This handles BOTH race orders:
 // 1. ptyId arrives → term opens → attach called here.
 // 2. term opens → ptyId arrives → attach called in createTerminal.
 const handleTermReady = useCallback((tabId: string) => {
 tabTermReady.add(tabId);
 // Also flush any output that was buffered by the defensive renderer
 // buffer (the term is now ready to receive it).
 const ptyId = tabPtyMap.get(tabId);
 if (ptyId) {
 flushPendingOutput(ptyId);
 const olympus = (window as any).olympus;
 if (olympus?.terminal?.attach) {
 try { olympus.terminal.attach(ptyId); } catch {}
 }
 }
 }, []);

 // Auto-create one tab on first mount if no tabs exist. Uses initialKind
 // (default 'shell'). For the Frames tab's OpenCode TUI preset, the parent
 // passes initialKind='opencode' so the auto-created tab is an OpenCode TUI.
 //
 // Previously this used a `useRef` guard
 // that was reset to `false` in the main effect's cleanup. This was added
 // to fix the React StrictMode double-mount in DEV mode, but it caused a
 // WORSE bug in PRODUCTION: every time the component re-rendered or the
 // main effect's cleanup ran (e.g. when switching tabs), the guard was
 // reset, and the next effect run created ANOTHER Shell tab. The user saw
 // 2+ "Shell" tabs appearing.
 //
 // The fix: use a MODULE-LEVEL guard instead of a ref. Module-level state
 // persists across ALL renders and ALL StrictMode mount/unmount cycles.
 // Once a terminal has been auto-created for a given TerminalTabs instance,
 // it's never auto-created again — even if the component remounts. This
 // is correct behavior because:
 // 1. In production (no StrictMode), the effect runs once → one tab.
 // 2. In dev (StrictMode double-mount), the effect runs twice but the
 // guard prevents the second creation → one tab.
 // 3. When switching tabs and back, the component remounts but the guard
 // prevents re-creation → no duplicate tabs.
 //
 // The guard is keyed by the component instance (using a counter) so
 // multiple TerminalTabs instances (e.g. IDE + Frames) each get their own
 // auto-create slot.
 useEffect(() => {
 // Use a module-level Set to track which instances have auto-created.
 // This survives StrictMode remounts AND production re-renders.
 if (!_autoCreatedInstances.has(_instanceId)) {
 _autoCreatedInstances.add(_instanceId);
 if (tabs.length === 0) {
 createTerminal(initialKind);
 }
 }
 }, [_instanceId, createTerminal, initialKind, tabs.length]);

    // Custom command dialog state.
 const [showCommandDialog, setShowCommandDialog] = useState(false);
 const [commandInput, setCommandInput] = useState('');

 const createCommandTerminal = useCallback(() => {
 const cmd = commandInput.trim();
 if (!cmd) {
 setShowCommandDialog(false);
 setCommandInput('');
 return;
 }
 createTerminal('command', cmd);
 setShowCommandDialog(false);
 setCommandInput('');
 }, [commandInput, createTerminal]);

    // God-tab injection. When the parent passes
 // activeGodTab (and it's not 'all'), inject `opencode run --agent
 // olympus-<god>` into the active tab's PTY. This replaces the old
 // NativeTerminal's god-tab injection logic.
 useEffect(() => {
 if (!activeGodTab || activeGodTab === 'all') return;
 if (!activeTabId) return;
 const olympus = (window as any).olympus;
 if (!olympus?.terminal) return;
 const ptyId = tabPtyMap.get(activeTabId);
 if (!ptyId) return;
 // Find the tab to check it's ready.
 const tab = tabs.find((t) => t.id === activeTabId);
 if (!tab || tab.status !== 'ready') return;
 olympus.terminal.inject(ptyId, `opencode run --agent olympus-${activeGodTab}\n`);
 }, [activeGodTab, activeTabId, tabs]);

 return (
 <div className={cn('h-full flex flex-col bg-[#0A0E16]', className)}>
 {/* Tab bar -- hidden when hideTabBar=true (Frames tab uses its own
 god-tab bar above the terminal). */}
 {!hideTabBar && (
 <div className="h-7 shrink-0 flex items-center bg-olympus-panel border-b border-olympus-gold/10 px-1 gap-0.5">
 <div className="flex items-center gap-0.5 overflow-x-auto custom-scroll flex-1 min-w-0">
 {tabs.map((tab) => (
 <div
 key={tab.id}
 onClick={() => setActiveTabId(tab.id)}
 className={cn(
 'group flex items-center gap-1.5 px-2 h-6 rounded text-[10px] font-mono transition-colors shrink-0',
 activeTabId === tab.id
 ? 'bg-olympus-gold/10 text-olympus-gold'
 : 'text-olympus-text-dim hover:bg-olympus-gold/5 hover:text-olympus-text',
 )}
 >
 {tab.status === 'starting' && <Loader2 size={9} className="animate-spin text-olympus-gold" />}
 {tab.status === 'ready' && <span className="w-1.5 h-1.5 rounded-full bg-olympus-green" />}
 {tab.status === 'error' && <AlertCircle size={9} className="text-olympus-red" />}
 {tab.status === 'exited' && <span className="w-1.5 h-1.5 rounded-full bg-olympus-red/60" />}
 <span className="max-w-[120px] truncate">{tab.label}</span>
    {/* Per-tab restart button (shown on hover).
 Disposes the old PTY and spawns a new one in the same tab.
 Only shown for shell/command tabs (opencode tabs have their
 own restart in the chat pane). */}
 {tab.kind !== 'opencode' && (
 <button
 onClick={(e) => { e.stopPropagation(); restartTerminal(tab.id); }}
 className="w-3.5 h-3.5 rounded flex items-center justify-center text-olympus-text-dim hover:bg-olympus-gold/20 hover:text-olympus-gold transition-colors opacity-0 group-hover:opacity-100"
 aria-label="Restart terminal"
 >
 <RefreshCw size={9} />
 </button>
 )}
 <button
 onClick={(e) => { e.stopPropagation(); closeTerminal(tab.id); }}
 className="w-3.5 h-3.5 rounded flex items-center justify-center text-olympus-text-dim hover:bg-olympus-red/20 hover:text-olympus-red transition-colors"
 aria-label="Close terminal"
 >
 <X size={9} />
 </button>
 </div>
 ))}
 </div>

 {/* Create menu — no tooltip per user request */}
 <div className="relative shrink-0">
 <button
 onClick={() => setShowCreateMenu((s) => !s)}
 className="w-6 h-6 rounded flex items-center justify-center text-olympus-gold hover:bg-olympus-gold/10 transition-colors"
 >
 <Plus size={12} />
 </button>
 {showCreateMenu && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setShowCreateMenu(false)} />
 <div className="absolute right-0 top-7 z-50 bg-olympus-card border border-olympus-gold/20 rounded-md shadow-lg py-1 min-w-[180px]">
    {/* Filter create menu options by allowedKinds.
 The base terminal passes allowedKinds=['opencode'] so only
 OpenCode TUI instances can be added. The IDE passes no
 restriction (default = all kinds except opencode). */}
 {(!allowedKinds || allowedKinds.includes('shell')) && (
 <button
 onClick={() => { setShowCreateMenu(false); createTerminal('shell'); }}
 className="w-full text-left px-3 py-1.5 text-[10px] font-mono text-olympus-text hover:bg-olympus-gold/10 flex items-center gap-2"
 >
 <TerminalIcon size={11} /> Shell
 </button>
 )}
 {/* Removed the "OpenCode Chat" create-menu
 option. The Olympus Terminal now only renders the Apollo chat,
 and the IDE terminal only supports Shell + Custom Command.
 The opencode kind is kept in the type system for backward compat
 but is no longer creatable via the UI. */}
 {(!allowedKinds || allowedKinds.includes('command')) && (
 <button
 onClick={() => { setShowCreateMenu(false); setShowCommandDialog(true); }}
 className="w-full text-left px-3 py-1.5 text-[10px] font-mono text-olympus-text hover:bg-olympus-gold/10 flex items-center gap-2"
 >
 <ChevronDown size={11} /> Custom command...
 </button>
 )}
 </div>
 </>
 )}
 </div>
 </div>
 )}

 {/* Custom command dialog */}
 {showCommandDialog && (
 <div className="absolute inset-0 z-50 flex items-center justify-center bg-olympus-bg/80" onClick={() => setShowCommandDialog(false)}>
 <div className="bg-olympus-card border border-olympus-gold/20 rounded-lg p-4 w-96" onClick={(e) => e.stopPropagation()}>
 <h3 className="text-sm font-mono text-olympus-gold mb-1">Custom command</h3>
 <p className="text-[10px] font-mono text-olympus-text-dim mb-3">
 The command runs once, then drops into an interactive shell. Useful for <code className="text-olympus-gold">npm run dev</code>, <code className="text-olympus-gold">npm test</code>, watchers, etc.
 </p>
 <input
 autoFocus
 value={commandInput}
 onChange={(e) => setCommandInput(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter') createCommandTerminal();
 if (e.key === 'Escape') { setShowCommandDialog(false); setCommandInput(''); }
 }}
 placeholder="npm run dev"
 className="w-full bg-olympus-bg border border-olympus-gold/20 rounded px-2 py-1.5 text-[11px] font-mono text-olympus-text focus:outline-none focus:border-olympus-gold/50"
 />
 <div className="flex justify-end gap-2 mt-3">
 <button
 onClick={() => { setShowCommandDialog(false); setCommandInput(''); }}
 className="px-3 py-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-text"
 >
 Cancel
 </button>
 <button
 onClick={createCommandTerminal}
 className="px-3 py-1 text-[10px] font-mono text-olympus-gold bg-olympus-gold/10 hover:bg-olympus-gold/20 rounded"
 >
 Run
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Terminal panes — each tab has its own; only the active one is shown. */}
 <div className="flex-1 min-h-0 relative">
 {tabs.length === 0 && (
 <div className="absolute inset-0 flex items-center justify-center text-olympus-text-dim text-[11px] font-mono">
 No terminals. Click + to create one.
 </div>
 )}
 {tabs.map((tab) => (
    // The opencode chat pane rendering is removed.
 // The Olympus Terminal now only renders the Apollo chat (interactive-
 // terminal.tsx), and the IDE terminal only supports shell + command
 // tabs. If an opencode tab somehow exists (legacy), it falls through
 // to TerminalPane which will render an xterm.js terminal with a
 // deprecation notice from the main process.
 <TerminalPane
 key={tab.id}
 tab={tab}
 active={tab.id === activeTabId}
 onRestart={() => restartTerminal(tab.id)}
 onTermReady={handleTermReady}
 />
 ))}
 </div>

    {/* Text input bar for the IDE terminal (shell + command).
 The base terminal no longer renders TerminalTabs at all (it renders
 the Apollo chat directly), so this bar only shows in the IDE. */}
 {activeTabId && (!allowedKinds || allowedKinds.includes('shell') || allowedKinds.includes('command')) && (
 <TerminalInputBar activeTabId={activeTabId} />
 )}
 </div>
 );
}

/**
 * TerminalInputBar
 * A text input bar below the terminal panes. The user types a command
 * and presses Enter — the command is injected into the active PTY.
 * This is especially useful on Windows where the xterm.js terminal
 * might not capture keyboard focus reliably.
 */
function TerminalInputBar({ activeTabId }: { activeTabId: string }) {
 const [input, setInput] = useState('');
 const [history, setHistory] = useState<string[]>([]);
 const [historyIdx, setHistoryIdx] = useState(-1);
 const inputRef = useRef<HTMLInputElement>(null);

 const sendCommand = useCallback(() => {
 const cmd = input;
 if (!cmd.trim()) {
 // Just send a newline (empty command)
 const olympus = (window as any).olympus;
 const ptyId = tabPtyMap.get(activeTabId);
 if (olympus?.terminal && ptyId) {
 olympus.terminal.inject(ptyId, '\n');
 }
 setInput('');
 return;
 }

 const olympus = (window as any).olympus;
 const ptyId = tabPtyMap.get(activeTabId);
 if (olympus?.terminal && ptyId) {
 // Inject the command + newline so the shell executes it.
 olympus.terminal.inject(ptyId, cmd + '\n');
 // Add to history (deduped, last 50)
 setHistory(prev => {
 const next = [...prev.filter(h => h !== cmd), cmd];
 return next.slice(-50);
 });
 setHistoryIdx(-1);
 setInput('');
 }
 }, [input, activeTabId]);

 const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 sendCommand();
 } else if (e.key === 'ArrowUp') {
 e.preventDefault();
 if (history.length === 0) return;
 const newIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
 setHistoryIdx(newIdx);
 setInput(history[newIdx]);
 } else if (e.key === 'ArrowDown') {
 e.preventDefault();
 if (historyIdx === -1) return;
 const newIdx = historyIdx + 1;
 if (newIdx >= history.length) {
 setHistoryIdx(-1);
 setInput('');
 } else {
 setHistoryIdx(newIdx);
 setInput(history[newIdx]);
 }
 } else if (e.key === 'Escape') {
 e.preventDefault();
 setInput('');
 setHistoryIdx(-1);
 }
 }, [sendCommand, history, historyIdx]);

 return (
 <div className="shrink-0 border-t border-olympus-gold/10 bg-olympus-panel px-2 py-1.5 flex items-center gap-2">
 <span className="text-olympus-gold font-mono text-[12px] shrink-0">$</span>
 <input
 ref={inputRef}
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder="Type a command and press Enter (↑/↓ for history)..."
 className="flex-1 bg-transparent border-0 outline-none text-[12px] font-mono text-olympus-text placeholder:text-olympus-text-dim/50"
 spellCheck={false}
 autoComplete="off"
 autoCorrect="off"
 autoCapitalize="off"
 />
 <button
 onClick={sendCommand}
 disabled={!input.trim()}
 className={cn(
 'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-all shrink-0',
 input.trim()
 ? 'bg-olympus-gold/15 ring-1 ring-olympus-gold/30 text-olympus-gold hover:bg-olympus-gold/25'
 : 'text-olympus-text-dim/50 cursor-not-allowed',
 )}
 >
 <CornerDownLeft size={10} /> send
 </button>
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* TerminalPane — a single xterm.js instance for one tab. */
/* */
/* Reads ptyId from the module-level tabPtyMap on EVERY keystroke so */
/* that restartTerminal's ptyId swap is picked up live without */
/* re-subscribing the onData callback. */
/* ------------------------------------------------------------------ */

interface TerminalPaneProps {
 tab: TerminalTab;
 active: boolean;
 onRestart: () => void;
	 /** Called AFTER term.open(container) completes.
 * Used by the parent to signal the attach handshake (flush the main
 * process's buffered PTY output).
 */
 onTermReady?: (tabId: string) => void;
}

function TerminalPane({ tab, active, onRestart, onTermReady }: TerminalPaneProps) {
 const containerRef = useRef<HTMLDivElement>(null);
 const initRef = useRef(false);

	 // Focus the terminal when the tab becomes active.
 // This ensures keyboard input goes to the right terminal when switching tabs.
 useEffect(() => {
 if (!active) return;
 const entry = termRegistry.get(tab.id);
 if (entry) {
 // Small delay to let the display:none → display:block transition complete.
 const timer = setTimeout(() => {
 try { entry.term.focus(); } catch {}
 }, 50);
 return () => clearTimeout(timer);
 }
 }, [active, tab.id]);

 useEffect(() => {
 if (initRef.current) return;
 initRef.current = true;

 const container = containerRef.current;
 if (!container) return;

 const term = new Terminal({
 cursorBlink: true,
 cursorStyle: 'bar',
 fontSize: 13,
 fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace',
 theme: {
 background: '#0A0E16',
 foreground: '#B8B8B8',
 cursor: '#D4A574',
 cursorAccent: '#0A0E16',
 selectionBackground: '#D4A57440',
 black: '#0A0E16', red: '#C4756A', green: '#7BAE8E', yellow: '#D4A574',
 blue: '#6BAEB5', magenta: '#9B7BAE', cyan: '#6B8FB5', white: '#B8B8B8',
 brightBlack: '#5A5A5A', brightRed: '#C4756A', brightGreen: '#7BAE8E',
 brightYellow: '#D4A574', brightBlue: '#6BAEB5', brightMagenta: '#9B7BAE',
 brightCyan: '#6B8FB5', brightWhite: '#D8D8D8',
 },
 allowProposedApi: true,
 cols: 120,
 rows: 30,
	 // CRITICAL on Windows.
 //
 // `windowsPty` tells xterm.js that the PTY backend is ConPTY (Windows
 // Pseudo Console). Without this, xterm.js doesn't apply ConPTY-specific
 // workarounds, and after the first resize the viewport can fill with
 // blank rows — which looks identical to a "blank TUI".
 //
 // The build number determines which workarounds are applied (e.g.
 // scrollback reflow is enabled only on build >= 21376).
 //
 // On macOS/Linux, `windowsPty` is `undefined` (no ConPTY workarounds).
 windowsPty: getWindowsPtyOption(),
 });

 const fit = new FitAddon();
 const webLinks = new WebLinksAddon();
 term.loadAddon(fit);
 term.loadAddon(webLinks);
 const disposables: Array<{ dispose?: () => void }> = [fit, webLinks];

 // Wire up input — read ptyId LIVE from the module map on every keystroke.
 const inputDisposable = term.onData((data) => {
 const olympus = (window as any).olympus;
 if (!olympus?.terminal) return;
 const ptyId = tabPtyMap.get(tab.id);
 if (!ptyId) return;
 olympus.terminal.sendInput(ptyId, data);
 });
 disposables.push(inputDisposable);

 // v8 FIX: DON'T register the term in termRegistry until AFTER term.open().
 //
 // The OLD code did `termRegistry.set(tab.id, ...)` HERE — before
 // term.open(container). This meant routePtyOutput() would find the entry
 // and call `entry.term.write(data)` on a term that wasn't opened yet.
 // xterm.js SILENTLY DROPS writes when term.open() hasn't been called.
 //
 // The fix: store the term in a LOCAL variable, and only register it in
 // termRegistry AFTER term.open() succeeds. This ensures routePtyOutput()
 // only writes to terms that are actually open and can display output.
 //
 // Output that arrives before term.open() is buffered in `pendingOutput`
 // by routePtyOutput() (because the ptyId won't be in ptyTabMap, or the
 // tabId won't be in termRegistry). It's flushed by flushPendingOutput()
 // when onTermReady fires (after term.open).

 // Wait for the container to be visible, then open.
 let pollInterval: ReturnType<typeof setInterval> | null = null;
 let opened = false;
 let pollCount = 0;

 function waitForVisibleThenOpen() {
 pollInterval = setInterval(() => {
 if (opened) return;
 pollCount++;
 // v9: With visibility:hidden (instead of display:none), the container
 // now has dimensions even when hidden. Check clientWidth/clientHeight.
 // Also add a pollCount fallback (after 30 polls = 3 seconds, open
 // anyway — the container might be in a layout that reports 0 dims).
 if (container && (
 (container.clientWidth > 0 && container.clientHeight > 0) ||
 pollCount > 30 // 3-second fallback — open anyway
 )) {
 opened = true;
 if (pollInterval) clearInterval(pollInterval);
 pollInterval = null;
 requestAnimationFrame(() => {
 requestAnimationFrame(() => {
 try {
 term.open(container);

 // v8 FIX: NOW register the term in termRegistry — AFTER
 // term.open() succeeded. This ensures routePtyOutput() only
 // writes to terms that are actually open.
 termRegistry.set(tab.id, { term, fit, container, disposables });

 // Signal the parent that the term
 // is now open and ready to receive data. This triggers the
 // attach handshake (flushes the main process's buffered
 // PTY output).
 //
 // We call onTermReady BEFORE fit() and writeln() so the
 // attach happens as early as possible — the buffered PTY
 // output (which may contain the TUI's initial paint) is
 // flushed into the term before we write our own
 // "Olympus Terminal" banner.
 try { onTermReady?.(tab.id); } catch {}
 requestAnimationFrame(() => {
 try { fit.fit(); } catch {}
 try {
 // Only write the "Olympus Terminal"
 // banner for SHELL terminals. For OpenCode TUI terminals,
 // writing the banner would corrupt the TUI's alternate
 // screen buffer (the TUI uses \x1b[?1049h to switch to
 // the alt buffer, and our banner would appear in the
 // NORMAL buffer, briefly visible before the TUI takes
 // over). Skipping the banner for opencode ensures the
 // TUI's first frame is clean.
 if (tab.kind !== 'opencode') {
 term.writeln('\x1b[38;2;212;165;116m Olympus Terminal\x1b[0m');
 }
 // Auto-focus the terminal so the user
 // can type immediately without clicking.
 try { term.focus(); } catch {}
 } catch {}
 });
 } catch (e) {
 console.error('[TerminalPane] term.open failed:', e);
 }
 });
 });
 }
 }, 100);
 }
 waitForVisibleThenOpen();

 const resizeObserver = new ResizeObserver(() => {
 try {
 if (container && container.clientWidth > 0 && container.clientHeight > 0) {
 fit.fit();
 const olympus = (window as any).olympus;
 const ptyId = tabPtyMap.get(tab.id);
 if (olympus?.terminal && ptyId) {
 try { olympus.terminal.resize(ptyId, term.cols, term.rows); } catch {}
 }
 }
 } catch {}
 });
 resizeObserver.observe(container);

 return () => {
 if (pollInterval) clearInterval(pollInterval);
 resizeObserver.disconnect();
 // Don't dispose the term here — closeTerminal is the canonical
 // cleanup path. We only registered it in termRegistry; that's where
 // closeTerminal finds it.
 };
 }, [tab.id]);

 return (
 <div
 className="absolute inset-0"
 // v9 FIX: Don't use display:none for inactive tabs — it prevents
 // xterm.js from opening (offsetParent is null, so the visibility
 // poll never fires, term.open() never runs, and the terminal stays
 // blank forever).
 //
 // Instead, use visibility:hidden + z-index:-1 for inactive tabs.
 // This keeps the container in the layout (has dimensions, offsetParent
 // is non-null), so term.open() runs immediately and output is rendered.
 // When the tab becomes active, we just toggle visibility + z-index.
 style={{
 visibility: active ? 'visible' : 'hidden',
 zIndex: active ? 1 : -1,
 pointerEvents: active ? 'auto' : 'none',
 }}
 onClick={() => {
 const entry = termRegistry.get(tab.id);
 if (entry) {
 try { entry.term.focus(); } catch {}
 }
 }}
 >
 <div ref={containerRef} className="w-full h-full overflow-hidden" style={{ padding: '4px 8px' }} />
 {/* "Terminal not responding" banner.
 Shown when the PTY was created but no output arrived within 5s.
 A restart button disposes the old PTY and spawns a new one. */}
 {tab.notResponding && tab.status === 'ready' && (
 <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-olympus-card/95 backdrop-blur border border-olympus-amber-soft/40 rounded-md px-3 py-2 shadow-lg">
 <AlertCircle size={13} className="text-olympus-amber-soft shrink-0" />
 <span className="text-[10px] font-mono text-olympus-text">Terminal not responding</span>
 <button
 onClick={(e) => { e.stopPropagation(); onRestart(); }}
 className="flex items-center gap-1 px-2 py-1 rounded bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 text-[10px] font-mono shrink-0"
 >
 <RefreshCw size={10} /> Restart
 </button>
 </div>
 )}
 {tab.status === 'error' && (
 <div className="absolute inset-0 bg-[#0A0E16]/90 flex flex-col items-center justify-center z-10 px-6 text-center overflow-y-auto custom-scroll">
 <AlertCircle size={22} className="text-olympus-red mb-3 shrink-0" />
 {/* Display the ACTUAL error message from
 the main process. errorMsg can be multi-line (diagnostic details).
 Use whitespace-pre-line so newlines render, and text-left so
 the diagnostic block is readable. */}
 <pre className="text-[10px] font-mono text-olympus-text-dim max-w-lg max-h-48 overflow-y-auto custom-scroll mb-4 text-left whitespace-pre-wrap break-words bg-olympus-bg/60 rounded-md p-3 border border-olympus-gold/15">
{tab.errorMsg || 'Terminal failed to start.'}
 </pre>
 <button
 onClick={onRestart}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 text-[11px] font-mono shrink-0"
 >
 <RefreshCw size={11} /> Restart
 </button>
 {/* v2 — hint to run the diagnostic script when the terminal fails */}
 <p className="text-[10px] font-mono text-olympus-text-dim/60 max-w-md mt-4 shrink-0">
 Still not working? Run{' '}
 <code className="text-olympus-gold bg-olympus-gold/10 px-1 rounded">node scripts/olympus-terminal-doctor.js</code>{' '}
 in a terminal and send us the report.
 </p>
 </div>
 )}
 </div>
 );
}
