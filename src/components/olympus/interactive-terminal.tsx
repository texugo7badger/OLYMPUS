/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Send, Loader2, CornerDownLeft, ChevronRight,
  Zap, CheckCircle2, AlertCircle, Users, Sun, Hammer, Bird,
  Compass, Target, Wine, Flower2, Flame, Square, RefreshCw, Paperclip, type LucideIcon,
  Landmark, Terminal as TerminalIcon, ImageIcon, Globe,
} from 'lucide-react';
import { marked } from 'marked';
import { useOlympus } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';
import OlympusTooltip from './olympus-tooltip';
// ContextIndicator polls /api/olympus/context-usage every 5s and shows
// a compact "ctx N%" bar. Shows a "new session" button at warning/critical levels.
import ContextIndicator from './context-indicator';
// DesignReviewCard renders inline when Athena surfaces design-system candidates
// for the user to review and select.
import DesignReviewCard from './design-review-card';
// Issue #42: the Parthenon panel. One card per god — status, current tool,
// step count — and a click focuses the message stream on that god.
import GodPanel, { type GodState } from './god-panel';
// Issue #43: the Plan panel. A todo list is a plan; this one stays pinned to
// the bottom of the Parthenon column instead of scrolling away with the log.
import PlanPanel, { normalizeTodoEvent, type PlanItem } from './plan-panel';
// Issue #47 — /permissions panel (list + revoke). Separate file so the
// terminal's own surface doesn't keep growing.
import PermissionsPanel from './permissions-panel';
// Issue #44: file-touching tool frames show the shape of the change (M/A
// badge, +/- counts, a truncated preview) instead of just naming a path.
import { ToolFrame } from './tool-frame';

// The OLYMPUS Terminal renders only the Interactive (Apollo) chat.
// OpenCode Chat is available in the IDE tab's terminal panel via
// TerminalTabs with allowedKinds=['shell','command'].
// The opencode one-shot run IPC channel is still registered.

const GOD_COLOR = '#D4A574';

/**
 * Issue #46 — an unanswered permission ask is a permanently parked run.
 *
 * OpenCode holds the run open until the ask is answered, and before this the
 * only way out was the card's buttons: step away for two minutes, come back,
 * and the run is still frozen with nothing indicating it will ever thaw. So
 * every ask gets its own timer and, unanswered after 2 minutes, is denied by
 * the client — which is the same decision the Deny button makes, once, for
 * that run. Deliberately NOT a persisted denial: a timeout is "nobody was
 * there", not "never do this again", so nothing is written to
 * permissions.json and the next ask cards again.
 */
const PERMISSION_TIMEOUT_MS = 120_000; // 2 minutes
// Callimachus uses Landmark icon (Library of Alexandria).
const GOD_ICONS: Record<string, LucideIcon> = {
  apollo: Sun, hephaestus: Hammer, athena: Bird, hermes: Compass,
  artemis: Target, dionysus: Wine, persephone: Flower2, prometheus: Flame,
  callimachus: Landmark, global: Globe,
};
const GOD_NAMES: Record<string, string> = {
  apollo: 'Apollo', hephaestus: 'Hephaestus', athena: 'Athena', hermes: 'Hermes',
  artemis: 'Artemis', dionysus: 'Dionysus', persephone: 'Persephone', prometheus: 'Prometheus',
  callimachus: 'Callimachus',
};

// -------------------------------------------------------------------
// Markdown rendering for the Interactive Terminal.
//
// Apollo's responses frequently contain markdown — plans (.md files),
// code blocks, bullet lists, **bold** emphasis, headings. We render
// these through `marked` (already in devDependencies) into HTML and
// mount them with dangerouslySetInnerHTML. The source content is
// always Apollo's own output (not arbitrary third-party HTML), and
// `marked` sanitizes by default (no raw HTML passthrough unless
// explicitly enabled), so this is safe.
//
// The .olympus-markdown CSS class (defined in globals.css) styles
// headings, code blocks, lists, tables, etc. in the OLYMPUS pastel
// gold/cyan palette.
//
// Configured for terminal context:
//   - gfm: true     — GitHub Flavored Markdown (tables, strikethrough, task lists)
//   - breaks: true  — single \n becomes <br> (chat-like line breaks)
//   - async: false  — marked.parse() returns a string, not a Promise
// -------------------------------------------------------------------
marked.setOptions({ gfm: true, breaks: false, async: false });

/** Synchronously render a markdown string to HTML. Falls back to the
 *  raw text if marked throws (shouldn't happen, but defensive). */
function renderMarkdown(text: string): string {
  if (!text) return '';
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return text;
  }
}

/**
 * Generate a conversation id for the persistent OpenCode session mapping.
 * The server keeps one warm opencode session per conversationId, so
 * follow-up messages reuse the same session (no cold start, context
 * retained). Rotated on "new session" and terminal reset.
 */
function makeConversationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type MessageType = 'system' | 'user' | 'response' | 'god' | 'question' | 'todo' | 'error' | 'delegation' | 'tool' | 'context_request' | 'permission' | 'thinking';

/**
 * Issue #32 (complaint 2: "tool lines render the call but NEVER the result").
 * One compact line per result — deliberately a PREVIEW, never a dump: a read
 * of a large file reports its size, not its contents.
 */
function summarizeToolResult(output: unknown, error: unknown): string {
  if (error) return `error: ${String(error).replace(/\s+/g, ' ').slice(0, 90)}`;
  let s: string;
  if (typeof output === 'string') s = output;
  else if (output == null) s = '';
  else {
    try { s = JSON.stringify(output); } catch { s = String(output); }
  }
  if (!s) return 'no output';
  const exit = /exit(?:\s+code|\s+status)[:\s]*(\d+)/i.exec(s);
  const lines = s.split('\n').filter((l) => l.trim().length > 0).length;
  const size = s.length >= 1024 ? `${(s.length / 1024).toFixed(1)} KB` : `${s.length} B`;
  return exit ? `exit ${exit[1]} · ${lines} lines · ${size}` : `${lines} lines · ${size}`;
}

/** The single most useful argument of a tool call, for the compact call line. */
function toolCallTarget(toolInput: any): string {
  const v = toolInput?.filePath ?? toolInput?.path ?? toolInput?.file ?? toolInput?.pattern ?? toolInput?.command;
  if (typeof v === 'string' && v) return v.length > 80 ? `…${v.slice(-78)}` : v;
  if (typeof toolInput === 'string' && toolInput) return toolInput.slice(0, 80);
  try {
    const s = JSON.stringify(toolInput || {});
    return s === '{}' ? 'no args' : (s.length > 80 ? `${s.slice(0, 77)}…` : s);
  } catch { return 'no args'; }
}

interface ChatMessage {
  id: string; type: MessageType; text: string; ts: string;
  god?: string; choices?: string[]; questionId?: string; awaitingAnswer?: boolean;
  /** OpenCode permission ask (freeze-class fix 2026-09-29). `permissionId`
   *  is the opencode request id used to POST the reply; `permissionAction`
   *  is the tool/permission name ("external_directory", "bash", …) and
   *  `permissionPatterns` are the paths the tool wants to touch. */
  permissionId?: string;
  permissionAction?: string;
  permissionPatterns?: string[];
  permissionState?: 'pending' | 'approved' | 'always' | 'denied';
  /** Issue #46: the 120s timer fired before anyone answered, so this card was
   *  denied by the client. `permission_replied` then flips the state to
   *  'denied' — this flag is what keeps the "(timeout)" label on it. */
  permissionTimedOut?: boolean;
  /** Issue #44: the tool frame needs the name and args, not just the rendered
   *  one-liner, to derive an M/A badge and a change preview. */
  toolName?: string;
  toolInput?: any;
  /** Accumulated reasoning tokens (4.1.2) — streamed into the open thinking
   *  message by the `reasoning` SSE event; rendered by ThinkingMessage's
   *  expandable block. Ephemeral: gone when the turn ends. */
  reasoning?: string;
  /** Inline image attached to a user message (Task 2 — image upload).
   *  `imagePath` is a local object URL (URL.createObjectURL) used as the
   *  <img src>. `imageSavedPath` is the absolute path on disk returned by
   *  /api/olympus/image-upload — Apollo uses this to find the file. */
  imagePath?: string;
  imageFilename?: string;
  imageSavedPath?: string;
}
// Issue #42: the wire-level phases a god reports. `thinking`, `working` and
// `delegating` all read as "busy" to a user, so they collapse into the
// `working` bucket on the card; `error` is the only thing that reads as blocked.
type GodPhase = 'idle' | 'thinking' | 'working' | 'delegating' | 'done' | 'error';
const PHASE_TO_STATUS: Record<GodPhase, GodState['status']> = {
  idle: 'idle',
  thinking: 'working',
  working: 'working',
  delegating: 'working',
  done: 'done',
  error: 'blocked',
};
// Issue #43: todos are plan items — `{ content, status }`, not a done flag.

export default function InteractiveTerminal() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'sys-1', type: 'system', text: 'Olympus Interactive Terminal - speak directly to Apollo.', ts: new Date().toISOString() },
    { id: 'sys-2', type: 'system', text: 'Apollo will interview you, classify your task, and delegate to the right gods.', ts: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const runHadText = useRef(false);
  const runHadError = useRef(false);
  // Fix A (silent-failure UX): per-run output census. opencode can finish a
  // turn with code 0 while producing nothing at all — the model stalls right
  // after its first tool call. That is a failure, not a success, so the
  // census decides which completion message the user sees. runLastTool names
  // the last tool that actually ran, so the failure message can point at it
  // instead of just saying "no output".
  const runToolCount = useRef(0);
  const runTextCount = useRef(0);
  const runLastTool = useRef('');
  // Issue #32: a code-0 exit is not proof that anything changed on disk. A
  // read-only turn (research, a status check, a grep) finishes 0 and was
  // reported as "Task completed.", which taught users that a green run means
  // edits landed. These tallies let the completion line state what actually
  // happened instead of inferring it from the exit code.
  const runWriteCount = useRef(0);
  const runEditCount = useRef(0);
  const runCommandCount = useRef(0);
  const runReadCount = useRef(0);
  // Issue #32 (task 3): addMessage appends unconditionally, so a redelivered
  // permission_ask renders a second identical card. Single slot, so only
  // CONSECUTIVE duplicates collapse — keyed on permissionId rather than the
  // rendered text, because two distinct asks can produce identical copy and
  // dropping the second would leave the parked run with nothing to answer.
  const lastPermissionId = useRef('');
  // Issue #41: requestID -> the tool/paths that were asked for, so an "always"
  // reply can be persisted as a policy grant instead of expiring with the run.
  const pendingPermissionsRef = useRef<Record<string, { tool: string; patterns: string[] }>>({});
  // Issue #46: requestID -> its timeout timer. A map, not a single timer,
  // because parallel dispatches park several asks at once and each one owes
  // the user an answer on its own card.
  const permissionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // The timer fires long after the event handler that armed it was built, and
  // handlePermissionReply is declared further down the component — so the
  // callback goes through a ref rather than a dependency.
  const permissionReplyRef = useRef<(requestID: string, reply: 'once' | 'always' | 'reject') => void>(() => {});

  const clearPermissionTimer = useCallback((requestID: string) => {
    const t = permissionTimersRef.current[requestID];
    if (t) { clearTimeout(t); delete permissionTimersRef.current[requestID]; }
  }, []);

  const clearAllPermissionTimers = useCallback(() => {
    for (const t of Object.values(permissionTimersRef.current)) clearTimeout(t);
    permissionTimersRef.current = {};
  }, []);
  const [awaitingContext, setAwaitingContext] = useState(false);
  // Issue #42: single source of truth for per-god state. Written only by
  // `updateGodActivity` at the existing event call sites — the Parthenon panel
  // reads this, it never re-derives god state from the message log.
  const [godStates, setGodStates] = useState<Map<string, GodState>>(() => new Map());
  const [focusedGod, setFocusedGod] = useState<string | null>(null);
  const [todos, setTodos] = useState<PlanItem[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  // Issue #47: the /permissions panel. Declared here (with the other
  // top-of-component state) because `submit` reads it — see the comment
  // above `submit` about the TDZ this file already fixed once.
  const [showPermissions, setShowPermissions] = useState(false);
  // Removed the terminalMode toggle. The Olympus
  // Terminal now renders ONLY the Interactive (Apollo) chat. The OpenCode
  // Chat pane and the TUI are gone from this surface. (The opencode one-shot
  // run IPC channel is still registered in the main process for any future
  // use, and the IDE tab's terminal panel still supports shell + custom
  // commands via TerminalTabs.)

  // P11.5 + TDZ FIX — track the file tree returned by the upload API so we
  // can surface it in the next prompt. Each entry is one uploaded file
  // (archive or single).
  //
  // These useState declarations MUST come BEFORE the `submit` useCallback
  // below, which references `uploadedFileDetails` in its dependency array.
  // Declaring them after `submit` causes a Temporal Dead Zone (TDZ)
  // ReferenceError: "can't access lexical declaration 'uploadedFileDetails'
  // before initialization" because `const` bindings are not hoisted.
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploadedFileDetails, setUploadedFileDetails] = useState<Array<{
    name: string;
    path: string;
    size: number;
    extracted?: boolean;
    extractError?: string;
    tree?: string;
    organized?: { category: string; organizedPath: string }[];
    indexNote?: string;
  }>>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<HTMLTextAreaElement>(null);

  // AbortController for the in-flight POST to /api/olympus/action. stop(),
  // resetTerminal() and handleNewSessionStart() abort it — the abort
  // propagates to req.signal on the server, which cancels the warm opencode
  // POST (runWarmMessage's postCtrl). Without this, "stop" only reset local
  // state while the server kept generating for up to 10 minutes.
  const actionAbortRef = useRef<AbortController | null>(null);

  const pushEvent = useOlympus(s => s.pushEvent);
  const pushPulse = useOlympus(s => s.pushPulse);
  const setActiveGod = useOlympus(s => s.setActiveGod);
  // OpenCode is the only CLI. Hardcode the badge text instead of
  // reading activeCli from the store (the activeCli state was removed).
  const activeCli = 'opencode';
  // Task 2 — image upload: the active project gives us the on-disk path
  // where reference-images/ lives. If no project is active, the image
  // icon is disabled with a tooltip explaining why.
  const activeProject = useOlympus(s => s.activeProject);

  // Persistent OpenCode session: one conversationId per chat conversation.
  // The server maps it to a warm opencode session (src/lib/opencode-session.ts)
  // so every message reuses the same session — cold start happens only on
  // the first message of the app run, not per message.
  const conversationIdRef = useRef<string>(makeConversationId());

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'ts'>) => {
    setMessages(prev => [...prev, { ...msg, id: `msg-${Date.now()}-${Math.random()}`, ts: new Date().toISOString() }]);
  }, []);

  // Thinking counter (Phase 4.0) — ONE self-updating "thinking… (Ns)" line
  // sits at the bottom of the transcript while Apollo works. It is opened
  // after activity-producing events and removed/replaced by the next real
  // one, so during tool runs, permission waits, and provider stalls the
  // user sees a live counter instead of silence. Purely client-side: zero
  // SSE noise, zero server changes.
  // Fix B (GOD ACTIVITY honesty): the events that can mark a god 'done'
  // while the run is still in flight must know whether the thinking counter
  // is open. messages state is not readable synchronously inside an event
  // handler, so mirror the counter's intent in a ref: true from
  // ensureThinking() until removeThinking(). 'Open or about to open' is the
  // semantic we want — it means "the run has not finished yet".
  const thinkingOpenRef = useRef(false);

  const removeThinking = useCallback(() => {
    thinkingOpenRef.current = false;
    setMessages(prev => (prev.some(m => m.type === 'thinking') ? prev.filter(m => m.type !== 'thinking') : prev));
  }, []);

  const ensureThinking = useCallback(() => {
    thinkingOpenRef.current = true;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.type === 'thinking') return prev; // already ticking
      return [...prev, { id: `th-${Date.now()}-${Math.random()}`, type: 'thinking' as MessageType, text: 'thinking', ts: new Date().toISOString() }];
    });
  }, []);

  // Append reasoning tokens to the OPEN thinking message (4.1.2). Opens one
  // if none is open (reasoning can arrive before step_start on some models).
  const appendReasoning = useCallback((text: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.type === 'thinking') {
        return prev.map((m, i) => i === prev.length - 1 ? { ...m, reasoning: (m.reasoning || '') + text } : m);
      }
      return [...prev, { id: `th-${Date.now()}-${Math.random()}`, type: 'thinking' as MessageType, text: 'thinking', ts: new Date().toISOString(), reasoning: text }];
    });
  }, []);

  const updateGodActivity = useCallback((
    god: string,
    phase: GodPhase,
    task?: string,
    opts?: { currentTool?: string; steps?: number },
  ) => {
    setGodStates(prev => {
      const next = new Map(prev);
      const existing = next.get(god);
      next.set(god, {
        god,
        status: PHASE_TO_STATUS[phase] || 'working',
        task,
        // A step is banked when a god reports completion, never while it is
        // mid-flight — otherwise the counter ticks on every tool call.
        steps: opts?.steps ?? (phase === 'done' ? (existing?.steps || 0) + 1 : existing?.steps || 0),
        currentTool: phase === 'idle' ? undefined : (opts?.currentTool ?? existing?.currentTool),
        lastEvent: task ?? existing?.lastEvent,
        lastTs: Date.now(),
      });
      return next;
    });
  }, []);

  // Issue #42: the panel takes an ordered array; the map stays the single
  // writable store so no other code path can invent god state.
  const godStateList = useMemo(() => Array.from(godStates.values()), [godStates]);

  const handleServerEvent = useCallback((ev: any) => {
    pushEvent(ev);
    if (ev.type === 'ws_connected') return;
    if (ev.type === 'prompt_received') { addMessage({ type: 'system', text: ev.msg || 'Prompt received by Apollo' }); return; }
    if (ev.type === 'delegation' && ev.from && ev.to) {
      addMessage({ type: 'delegation', text: `${GOD_NAMES[ev.from] || ev.from} delegating to ${GOD_NAMES[ev.to] || ev.to}`, god: ev.to });
      updateGodActivity(ev.to, 'thinking', ev.msg || 'Receiving delegation...');
      pushPulse(ev.from, ev.to);
      setActiveGod(ev.to);
      return;
    }
    // Issue #36: subtask parts (god -> demigod). Same wire type as the god->god
    // frame above, but no from/to — that branch's guard lets this one through.
    if (ev.type === 'delegation') {
      const god = ev.god || 'unknown god';
      addMessage({ type: 'delegation', text: `>> delegation: ${god} — ${ev.description || ''}`.trimEnd(), god: ev.god || undefined });
      updateGodActivity(ev.god || 'apollo', 'working', 'Delegated task running...');
      return;
    }
    if (ev.type === 'god_thinking') { updateGodActivity(ev.god, 'thinking', ev.msg || 'Thinking...'); return; }
    if (ev.type === 'god_done') { updateGodActivity(ev.god, 'done', ev.msg || 'Done'); return; }
    if (ev.type === 'question') {
      addMessage({ type: 'question', text: ev.msg || ev.text || 'Question', god: ev.god || 'apollo', choices: ev.choices, questionId: ev.id, awaitingAnswer: true });
      setAwaitingAnswer(true);
      return;
    }
    if (ev.type === 'answer_recorded') { setAwaitingAnswer(false); setMessages(prev => prev.map(m => m.questionId === ev.id ? { ...m, awaitingAnswer: false } : m)); return; }
    if (ev.type === 'permission_ask') {
      // Fix C (issue #17): the server already granted this permission under
      // policy and flagged it, so the card would be a lie and its buttons
      // would send a second reply that 502s ("Permission reply failed").
      // Say what happened once, keep the card green — the run is unblocked
      // and continuing — and send nothing back.
      if (ev.autoApproved) {
        removeThinking();
        const denied = ev.policyVerdict === 'denied';
        addMessage({
          type: 'system',
          text: denied
            ? `[permission] denied by policy — ${ev.action}: ${(ev.patterns || []).join(', ')}`
            : `[permission] allowed by policy — ${ev.action}: ${(ev.patterns || []).join(', ')}`,
          god: 'apollo',
        });
        updateGodActivity('apollo', 'working', `${denied ? 'Denied' : 'Auto-approved'} ${ev.action}`);
        ensureThinking();
        return;
      }
      // OpenCode blocked the run on a permission ask — surface it NOW (the
      // run stays parked until one of the buttons is pressed; without this
      // card the terminal silently hung on "waiting for Apollo...").
      // Issue #32: a redelivery of the ask we already carded renders once.
      if (lastPermissionId.current === ev.requestID) return;
      lastPermissionId.current = ev.requestID;
      pendingPermissionsRef.current[ev.requestID] = { tool: ev.action || '', patterns: ev.patterns || [] };
      // Issue #46: arm this ask's own timeout. The pendingPermissions check
      // inside it is what makes the timer safe — an ask answered by a button
      // click is already deleted from pendingPermissions by the time it fires.
      permissionTimersRef.current[ev.requestID] = setTimeout(() => {
        delete permissionTimersRef.current[ev.requestID];
        if (!pendingPermissionsRef.current[ev.requestID]) return; // answered already
        // Deny it for this run only — exactly what the Deny button sends.
        // Never grantDenied: a timeout is not a policy decision.
        permissionReplyRef.current(ev.requestID, 'reject');
        setMessages(prev => prev.map(m => m.permissionId === ev.requestID && m.type === 'permission'
          ? { ...m, permissionState: 'denied', permissionTimedOut: true }
          : m));
      }, PERMISSION_TIMEOUT_MS);
      addMessage({
        type: 'permission',
        text: `Apollo needs permission to use ${ev.action} on:`,
        god: 'apollo',
        permissionId: ev.requestID,
        permissionAction: ev.action,
        permissionPatterns: ev.patterns || [],
        permissionState: 'pending',
      });
      updateGodActivity('apollo', 'working', `Waiting for approval: ${ev.action}`);
      ensureThinking();
      return;
    }
    if (ev.type === 'permission_replied') {
      // Issue #32: the ask is answered, so the guard slot frees up for the
      // next one. Without this a later ask reusing the id would be swallowed.
      if (lastPermissionId.current === ev.requestID) lastPermissionId.current = '';
      delete pendingPermissionsRef.current[ev.requestID];
      // Issue #46: the answer arrived — stop the timer so it cannot answer a
      // second time. The card's timed-out label (if any) is left alone.
      clearPermissionTimer(ev.requestID);
      setMessages(prev => prev.map(m => m.permissionId === ev.requestID && m.type === 'permission'
        ? { ...m, permissionState: ev.reply === 'always' ? 'always' : ev.reply === 'reject' ? 'denied' : 'approved', text: m.text }
        : m));
      return;
    }
    if (ev.type === 'reasoning') {
      // 4.1.2 — accumulate the model's reasoning stream into the open
      // thinking message (rendered by the expandable ThinkingMessage).
      const text = ev.part?.text || ev.text || '';
      if (text) appendReasoning(text);
      return;
    }
    if (ev.type === 'context_request') {
      addMessage({ type: 'context_request', text: ev.msg || 'Anything else?', god: ev.god || 'apollo' });
      setAwaitingContext(true);
      setShowContext(true);
      setTimeout(() => contextRef.current?.focus(), 50);
      return;
    }
    if (ev.type === 'context_recorded' || ev.type === 'context_skipped') { setAwaitingContext(false); setShowContext(false); setContext(''); return; }
    // Issue #43: one parser for every todo shape (legacy `{type,id,text}` +
    // `todo_done`, the activity-feed `{action,msg,meta.status}` envelope, and a
    // bulk `items[]` write). Rows merge by id, so the panel keeps stream
    // history instead of resetting on every write.
    const planRows = normalizeTodoEvent(ev);
    if (planRows) {
      setTodos(prev => {
        const next = [...prev];
        for (const row of planRows) {
          const i = next.findIndex(t => t.id === row.id);
          if (i === -1) next.push(row);
          else if (row.status === 'done' && !row.content) next[i] = { ...next[i], status: 'done' };
          else next[i] = { ...next[i], ...row };
        }
        return next;
      });
      // The stream keeps its own copy — the log is history, the panel is state.
      for (const row of planRows) addMessage({ type: 'todo', text: row.content, god: row.god });
      return;
    }

    // Handle opencode --format json event types.
    // opencode 1.18.3 emits: step_start, text, step_finish, tool.call,
    // tool.response, error, etc. We surface these as human-readable
    // messages in the terminal.
    if (ev.type === 'step_start' || ev.type === 'session.start' || ev.type === 'session_start') {
      updateGodActivity('apollo', 'thinking', 'Apollo is thinking...');
      ensureThinking();
      return;
    }
    // The 'text' event is the actual response from Apollo.
    // opencode emits: { type: 'text', part: { type: 'text', text: '...' } }
    if (ev.type === 'text' || ev.type === 'message' || ev.type === 'message.delta') {
      let text = '';
      // opencode 1.18.3 format: { type: 'text', part: { text: '...' } }
      if (ev.part?.text) {
        text = ev.part.text;
      } else if (ev.part?.type === 'text' && ev.part.text) {
        text = ev.part.text;
      }
      // Older format: { parts: [...] } or { content: { parts: [...] } }
      else {
        const parts = ev.parts || ev.content?.parts || [];
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (typeof p === 'string') text += p;
            else if (p?.type === 'text') text += p.text || '';
          }
        } else if (typeof ev.content === 'string') {
          text = ev.content;
        } else if (ev.text) {
          text = ev.text;
        }
      }
      if (text) {
        runHadText.current = true;
        runTextCount.current++;
        removeThinking();
        addMessage({ type: 'response', text, god: ev.god || 'apollo' });
        updateGodActivity(ev.god || 'apollo', 'working', 'Responding...');
        ensureThinking();
      }
      return;
    }
    if (ev.type === 'tool.call' || ev.type === 'tool_call') {
      const toolName = ev.tool?.name || ev.name || 'tool';
      const toolInput = ev.tool?.input || ev.input || {};
      const summary = typeof toolInput === 'string'
        ? toolInput.slice(0, 100)
        : Object.entries(toolInput).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`).join(', ');
      // Fix A: census the tools this run actually invoked, and keep the most
      // useful argument (a path) for the stall message.
      runToolCount.current++;
      // Issue #32: classify the call so action_done can report a census instead
      // of a verdict. Only the classes the fix cares about are tallied; any
      // other tool still counts toward runToolCount above.
      if (toolName === 'write') runWriteCount.current++;
      else if (toolName === 'edit') runEditCount.current++;
      else if (toolName === 'bash') runCommandCount.current++;
      else if (toolName === 'read' || toolName === 'grep' || toolName === 'glob' || toolName === 'list') {
        runReadCount.current++;
      }
      const arg = toolInput?.filePath || toolInput?.path || toolInput?.file || toolInput?.pattern || summary;
      runLastTool.current = `${toolName}(${String(arg).slice(0, 60)})`;
      removeThinking();
      // Issue #32: the call was already surfaced as a raw `k: v` system line;
      // replace it with the compact one-line form. The RESULT now gets its own
      // line below (previously nothing was rendered at all).
      addMessage({ type: 'tool', text: `⚙ ${toolName} — ${toolCallTarget(toolInput)}`, god: ev.god || undefined, toolName, toolInput });
      updateGodActivity(ev.god || 'apollo', 'working', `Using ${toolName}...`, { currentTool: toolName });
      ensureThinking();
      return;
    }
    if (ev.type === 'tool.response' || ev.type === 'tool_response') {
      // Issue #32 (complaint 2): the result was previously invisible — this
      // branch only moved the god pill, so the user saw a call and never its
      // answer. One compact line, preview only.
      removeThinking();
      addMessage({
        type: 'tool',
        // Issue #42: the result frame carries its god too, so focusing the
        // Parthenon on one god shows that god's calls *and* their answers.
        god: ev.god || undefined,
        text: `⚙ ${ev.tool?.name || ev.name || 'tool'} — ${summarizeToolResult(ev.tool?.output ?? ev.output, ev.tool?.error ?? ev.error)}`,
        toolName: String(ev.tool?.name || ev.name || ''),
      });
      updateGodActivity(ev.god || 'apollo', 'working', 'Processing tool result...', {
        currentTool: ev.tool?.name || ev.name,
      });
      ensureThinking();
      return;
    }
    if (ev.type === 'step_finish') {
      // Fix B: a finishing STEP is not a finishing RUN. opencode emits
      // step_finish after every tool cycle and then keeps deliberating — the
      // thinking counter stays open straight through that gap. Unconditionally
      // reporting 'done' here is what made a silent run look finished: the
      // spinner kept ticking while the god card read "Step complete".
      // While the counter is open the truth is 'still working'.
      if (thinkingOpenRef.current) {
        updateGodActivity('apollo', 'working', 'Step complete — still working...');
        ensureThinking();
      } else {
        updateGodActivity('apollo', 'done', 'Step complete');
      }
      return;
    }
    if (ev.type === 'session.end' || ev.type === 'session_end') {
      // The session's run is over — clear the in-flight state as a safety
      // net. In normal runs `action_done` follows immediately; in failure
      // modes (e.g. the free-tier compaction loop) the server may close the
      // stream without one, leaving "waiting for Apollo..." stuck forever.
      removeThinking();
      setSubmitting(false); setAwaitingAnswer(false); setAwaitingContext(false);
      updateGodActivity('apollo', 'done', 'Session complete');
      return;
    }

    if (ev.type === 'response' || ev.type === 'cli' || ev.type === 'log') {
      const msg = ev.msg || ev.cli || ev.text || '';
      if (msg) {
        // Same remove → add → ensure pattern as every other handler here, so
        // the counter stays the LAST line while it ticks. This matters for
        // the "Connected to the warm OpenCode session" log specifically: it
        // lands inside the TTFB gap, right after the counter was opened, and
        // would otherwise print below it and freeze the line mid-transcript.
        removeThinking();
        // Fix B2: the watchdog speaks with two different tones and they must
        // not look alike. The 60s WARN has NO ⚠ prefix (only the 150s STALL
        // does), so matching on the prefix alone left the warn rendering as
        // gray prose and never touching GOD ACTIVITY.
        //   STALL (⚠)      → red   — something is wrong, escalate.
        //   WARN           — calm system line — this also fires during
        //                     legitimate long thinking on the free tier, so red
        //                     here would cry wolf and train users to ignore it.
        const isStall = msg.startsWith('⚠');
        const isWarn = !isStall && msg.includes('No stream activity');
        addMessage({
          type: isStall ? 'error' : isWarn ? 'system' : 'response',
          text: msg,
          god: ev.god,
        });
        // Both keep the card green and pulsing: the run is still in flight,
        // which is exactly what Fix B requires during a silence.
        if (isStall || isWarn) {
          const silent = msg.match(/(\d+)s/)?.[1];
          updateGodActivity('apollo', 'working', silent ? `Silent ${silent}s — may be stalled` : 'May be stalled');
        }
        ensureThinking();
      }
      return;
    }
    // R-B: classification visibility — render one dim/mono inline line
    // (same class as 'log' events). Must NOT touch message flow, permission
    // cards, or feed panel logic.
    if (ev.type === 'classification' && ev.classification) {
      const c = ev.classification;
      const line = `classified: ${c.domain} · ${c.complexity} → ${c.routeTo} · ~${Math.round(c.estimatedTokens / 1000)}k tok · planning=${c.needsPlanning ? 'yes' : 'no'}`;
      removeThinking();
      addMessage({ type: 'system', text: line });
      ensureThinking();
      return;
    }
    if (ev.type === 'error') {
      runHadError.current = true;
      removeThinking();
      addMessage({ type: 'error', text: ev.msg || ev.text || 'An error occurred' });
      updateGodActivity('apollo', 'error');
      return;
    }
    if (ev.type === 'action_start') {
      // Already handled by the "Routing to Apollo..." message above.
      runHadText.current = false;
      runHadError.current = false;
      // Issue #32: a new run is a new permission context.
      lastPermissionId.current = '';
      // Fix A: a new run starts with an empty census.
      runToolCount.current = 0;
      runTextCount.current = 0;
      runLastTool.current = '';
      runWriteCount.current = 0;
      runEditCount.current = 0;
      runCommandCount.current = 0;
      runReadCount.current = 0;
      return;
    }
    if (ev.type === 'action_done') {
      removeThinking();
      setSubmitting(false); setAwaitingAnswer(false); setAwaitingContext(false); updateGodActivity('apollo', 'idle');
      if (ev.code === 0) {
        if (runTextCount.current > 0) {
          // Issue #32: report the census, not a verdict. A code-0 exit with
          // zero write/edit calls changed nothing on disk, and calling that
          // "Task completed." is what let a read-only turn read as real work.
          const writes = runWriteCount.current;
          const edits = runEditCount.current;
          const commands = runCommandCount.current;
          const reads = runReadCount.current;
          addMessage({
            type: 'system',
            text: writes + edits > 0
              ? `Task completed. Census: writes ${writes}, edits ${edits}, commands ${commands}.`
              : `Run ended. Census: files written 0 — no changes on disk (reads ${reads}, commands ${commands}).`,
          });
        } else if (!runHadError.current) {
          // Fix A: exit code 0 with zero text blocks. The run DID tools
          // (typically an initial read) and then the model went quiet, so
          // this is a silent failure. The old copy — "Task completed
          // (no output)" — read as a success and is what trained users to
          // trust a stalled run. Say what happened, name the last tool, and
          // give the two ways out (STOP, or resend narrower).
          console.warn(
            `[terminal] no_output: tool_count=${runToolCount.current} text_count=${runTextCount.current} last_tool=${runLastTool.current || 'none'}`,
          );
          const last = runLastTool.current;
          addMessage({
            type: 'error',
            text: last
              ? `Run ended with no output. The model may have stalled. Last tool: ${last}. Click STOP or resend with a smaller scope.`
              : 'Run ended with no output. The model may have stalled before making any tool call. Click STOP or resend with a smaller scope.',
          });
        }
      } else {
        addMessage({ type: 'error', text: `Task failed (exit code ${ev.code})` });
      }
      inputRef.current?.focus();
      return;
    }
    // Unknown event types — log to console for debugging but don't show in UI.
    // This prevents noise from opencode internal events.
  }, [pushEvent, pushPulse, setActiveGod, addMessage, updateGodActivity, clearPermissionTimer]);

  // SSE-only — no WebSocket. The interactive terminal sends
  // prompts via POST to /api/olympus/action and receives events via the SSE
  // stream in the POST response. The global SSE stream (page.tsx) also
  // delivers activity events. No WS bridge, no reconnection, no "WS
  // connected" badge — just SSE.
  useEffect(() => {
    // Check SSE availability by pinging the health endpoint.
    // Cache: 'no-store' so the SSE status updates immediately.
    fetch('/api/olympus/health', { cache: 'no-store' })
      .then(r => { if (r.ok) setSseConnected(true); else setSseConnected(false); })
      .catch(() => setSseConnected(false));
    const iv = setInterval(() => {
      fetch('/api/olympus/health', { cache: 'no-store' })
        .then(r => setSseConnected(r.ok))
        .catch(() => setSseConnected(false));
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, godStates]);
  // Issue #46: a pending timeout that outlives its component would answer a
  // permission after the terminal is gone.
  useEffect(() => () => {
    for (const t of Object.values(permissionTimersRef.current)) clearTimeout(t);
    permissionTimersRef.current = {};
  }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = useCallback(async (
    text: string,
    contextText?: string,
    /** Optional inline image attached to this user message (Task 2).
     *  `thumbnailUrl` is a browser object URL used as <img src> for the
     *  inline preview. `savedPath` is the absolute on-disk path returned
     *  by /api/olympus/image-upload — Apollo reads the file from there. */
    image?: { thumbnailUrl: string; savedPath: string; filename: string },
  ) => {
    // Issue #47: '/permissions' is a local command, not a prompt. Until the
    // panel existed there was no way to see or undo an "always" grant — a rule
    // written to permissions.json was invisible and permanent. One inline
    // intercept, deliberately not a command framework.
    if (text.trim() === '/permissions') {
      setInput('');
      setShowPermissions(prev => !prev);
      return;
    }
    if (!text.trim() || submitting) return;

    // Build the uploaded-files prefix including the file tree for any
    // extracted archives. This gives Apollo full context: which files were
    // uploaded, where they live in the vault, and what's inside each archive.
    // The LLM uses vault.read / vault.list / vault.extract tools (registered
    // via the native vault subsystem) to inspect them on demand.
    //
    // ARCHIVES (.rar, .7z, .tar.gz, .zip): saved as-is, NOT extracted at
    // upload time. The prefix tells Apollo to use the compress_7z MCP to
    // extract them. This is more robust than JS archive libraries.
    const buildUploadPrefix = (): string => {
      if (uploadedFileDetails.length === 0 && !image) return '';
      const lines: string[] = ['[Uploaded files:'];
      for (const f of uploadedFileDetails) {
        const lower = f.name.toLowerCase();
        const isArchive = lower.endsWith('.rar') || lower.endsWith('.7z') ||
          lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') ||
          lower.endsWith('.zip');

        if (isArchive) {
          // Archive saved as-is — tell Apollo to extract via bash + 7-Zip
          const extractDir = f.path.replace(/\.[^.]+$/, '');
          lines.push(`  - ${f.name} → archive saved at ~/OLYMPUS-VAULT/${f.path} (${f.size} B)`);
          lines.push(`    **ACTION REQUIRED**: Extract this archive using the bash tool.`);
          lines.push(`    Run: 7z x "${f.path}" -o"${extractDir}" -y`);
          lines.push(`    (7-Zip handles .rar, .7z, .tar.gz, .zip. If 7z is not found, try: tar -xf for .tar.gz, or unzip for .zip)`);
          lines.push(`    After extraction, use vault.list and vault.read to inspect the extracted files.`);
        } else if (f.extracted && f.tree) {
          lines.push(`  - ${f.name} → extracted to ${f.path} (vault-relative). Files:`);
          const treeLines = f.tree.split('\n').slice(0, 80);
          for (const tl of treeLines) lines.push(`      ${tl}`);
          if (f.tree.split('\n').length > 80) lines.push('      ... (truncated; use vault.list to see more)');
          if (f.organized && f.organized.length > 0) {
            lines.push(`    Organized into vault:`);
            for (const o of f.organized.slice(0, 20)) lines.push(`      - [${o.category}] ${o.organizedPath}`);
          }
          if (f.indexNote) lines.push(`    Index: ${f.indexNote}`);
        } else {
          lines.push(`  - ${f.name} → saved at ${f.path} (${f.size} B)`);
        }
      }
      // Task 2 — reference image. Tell Apollo the on-disk path so Athena
      // can pick it up via the built-in VLM skill.
      if (image) {
        lines.push(`  - ${image.filename} → reference image saved at ${image.savedPath}`);
        lines.push(`    **ACTION**: Use the VLM skill (Athena) to analyze this image at the path above.`);
      }
      lines.push(']');
      if (!image) {
        lines.push('Use the vault.read tool to inspect any of these paths under ~/OLYMPUS-VAULT/.');
        lines.push('For archives, extract with bash (7z x) first, then read the extracted files.');
      } else {
        lines.push('Read the reference image directly from the absolute path with the VLM skill.');
      }
      return lines.join('\n');
    };

    // SSE-only — always POST, no WS check.
    setInput(''); setContext(''); setShowContext(false); setSubmitting(true);
    // Fix A: reset the census here too, not only on action_start. If the run
    // dies before action_start (abort, 502, provider error) the previous run's
    // counts would otherwise be read as this run's output.
    runToolCount.current = 0;
    runTextCount.current = 0;
    runLastTool.current = '';
    runWriteCount.current = 0;
    runEditCount.current = 0;
    runCommandCount.current = 0;
    runReadCount.current = 0;
    setTodos([]); setGodStates(new Map());
    addMessage({
      type: 'user',
      text: text.trim(),
      imagePath: image?.thumbnailUrl,
      imageFilename: image?.filename,
      imageSavedPath: image?.savedPath,
    });
    addMessage({ type: 'system', text: 'Routing to Apollo...' });
    updateGodActivity('apollo', 'thinking', 'Analyzing prompt...');
    // Open the counter NOW, before the POST. The provider's time-to-first-
    // token is 2-10s and nothing else renders until the first SSE event
    // arrives, so without this the terminal looks hung right after send.
    // Placed after the local echoes so it stays the LAST transcript line.
    ensureThinking();
    pushPulse('apollo', 'apollo'); setActiveGod('apollo');

    try {
      const uploadPrefix = buildUploadPrefix();
      const fullText = uploadPrefix ? `${text.trim()}\n\n${uploadPrefix}` : text.trim();
      // Abortable fetch — stop()/resetTerminal() abort this controller so
      // the server-side warm opencode POST is cancelled too (req.signal).
      actionAbortRef.current?.abort();
      const controller = new AbortController();
      actionAbortRef.current = controller;
      const res = await fetch('/api/olympus/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prompt', text: fullText, context: contextText?.trim() || undefined, conversationId: conversationIdRef.current }),
        signal: controller.signal,
      });
      if (!res.body) { addMessage({ type: 'error', text: 'No response stream returned.' }); return; }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim(); if (!line) continue;
          try { handleServerEvent(JSON.parse(line)); } catch {}
        }
      }
    } catch (e: any) {
      // Ignore intentional aborts (user pressed stop / reset) — the state
      // was already reset by stop()/resetTerminal(). Only surface real
      // network/request failures.
      if (e?.name !== 'AbortError') {
        addMessage({ type: 'error', text: `Request failed: ${e.message}` });
      }
    }
    finally {
      if (actionAbortRef.current?.signal.aborted === false) actionAbortRef.current = null;
      setSubmitting(false); updateGodActivity('apollo', 'idle'); inputRef.current?.focus(); setUploadedFiles([]); setUploadedFileDetails([]);
    }
  }, [submitting, addMessage, updateGodActivity, pushEvent, pushPulse, setActiveGod, handleServerEvent, uploadedFileDetails]);

  // DesignReviewCard onSelect handler.
  // Declared AFTER `submit` to avoid the block-scoped TDZ (submit referenced
  // before its declaration). Both handlers are consumed by <DesignReviewCard>
  // further down in the JSX, so being declared here is safe.
  const handleDesignReviewSelect = useCallback((selection: string, _reviewId: string) => {
    const message = `I selected "${selection}". Please proceed with this design reference.`;
    // Auto-submit the selection as a user message
    submit(message);
  }, [submit]);

  const handleDesignReviewDismiss = useCallback((_reviewId: string) => {
    // The user dismissed the card without selecting — no action needed.
    // The card removes itself from the DOM via its own state.
  }, []);

  const handleChoice = useCallback((choice: string, context?: string) => {
    // POST the choice instead of WS.
    // Task 3 — if the user typed optional context into the inline box below
    // the choices, fold it into the displayed user message and send it as
    // the `context` field alongside the answer.
    const ctxTrim = context?.trim() || '';
    const displayText = ctxTrim ? `${choice}  (additional context: ${ctxTrim})` : choice;
    addMessage({ type: 'user', text: displayText });
    setAwaitingAnswer(false);
    fetch('/api/olympus/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'answer', text: choice, context: ctxTrim || undefined, conversationId: conversationIdRef.current }),
    }).catch(() => {});
  }, [addMessage]);

  const sendContext = useCallback(() => {
    // POST the context instead of WS.
    const ctx = context.trim();
    setAwaitingContext(false); setShowContext(false);
    if (ctx) addMessage({ type: 'user', text: ctx });
    setContext('');
    if (ctx) {
      fetch('/api/olympus/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'context', text: ctx, conversationId: conversationIdRef.current }),
      }).catch(() => {});
    }
  }, [context, addMessage]);

  const handlePermissionReply = useCallback((requestID: string, reply: 'once' | 'always' | 'reject') => {
    // Issue #46: the FIRST answer wins, and this is the one place that can
    // enforce it — the ask is only in pendingPermissionsRef while it is
    // genuinely unanswered. Three things can beat a button click to it: the
    // 120s timeout, a double-click, and the click that races the timer. Once
    // answered (here, by the timer, or by the SSE reply) the entry is gone,
    // and a second reply would 502 and double-answer one permission server-side.
    const ask = pendingPermissionsRef.current[requestID];
    if (!ask) return;
    delete pendingPermissionsRef.current[requestID];
    clearPermissionTimer(requestID);
    // POST the decision straight to OpenCode's permission API (via the action
    // route) — NOT a chat prompt. The matching card flips to its approved /
    // always / denied state when the `permission_replied` SSE event arrives.
    //
    // Issue #41: the tool + patterns ride along so the route can persist an
    // "always" grant to ~/.olympus/permissions.json. Without them the grant
    // would only last for this run and the next ask would card again.
    fetch('/api/olympus/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'respond-permission',
        requestID,
        decision: reply,
        tool: ask.tool,
        patterns: ask.patterns,
      }),
    }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(j.error || `HTTP ${r.status}`); });
    }).catch(err => {
      // The claim is ours, not the server's: OpenCode may never have seen the
      // decision (a dead warm server 502s, a dropped connection rejects). If we
      // keep the claim the card is frozen on a reply that was never delivered —
      // the exact freeze #46 exists to kill — so give the ask back to the
      // buttons. We deliberately do NOT re-arm the 120s timer here; the user is
      // looking at the error, and the buttons are the right affordance. A late
      // `permission_replied` for a restored claim just 502s harmlessly: the
      // server stays authoritative about what was actually answered.
      pendingPermissionsRef.current[requestID] = ask;
      addMessage({ type: 'error', text: `Permission reply failed: ${err.message}` });
    });
  }, [addMessage, clearPermissionTimer]);

  // Issue #46: the permission timeout needs this handler but is declared
  // before it, so the timer calls through a ref rather than a dependency.
  useEffect(() => {
    permissionReplyRef.current = handlePermissionReply;
  }, [handlePermissionReply]);

  const stop = useCallback(() => {
    // Abort the in-flight POST — the abort propagates to the server's
    // req.signal, cancelling the warm opencode run (not just local state).
    actionAbortRef.current?.abort();
    actionAbortRef.current = null;
    setSubmitting(false); setAwaitingAnswer(false); setAwaitingContext(false);
    updateGodActivity('apollo', 'idle');
    addMessage({ type: 'system', text: 'Stopped.' });
  }, [addMessage, updateGodActivity]);

  // Reset terminal with confirmation (clears all messages, TODOs, god activity).
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  // TDZ FIX — `uploadedFiles` and `uploadedFileDetails` useState declarations
  // MOVED to the top of the component (before this `submit` useCallback).
  // They were previously declared here, causing a TDZ ReferenceError because
  // `submit`'s dependency array references `uploadedFileDetails` before its
  // `const` binding was initialized.
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Task 2 — image upload state + ref. `uploadingImage` drives the spinner
  // on the image button. `imageInputRef` is the hidden <input type=file>
  // that we click programmatically.
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const resetTerminal = useCallback(() => {
    // Abort any in-flight run FIRST — otherwise the old SSE stream keeps
    // appending events into the freshly-reset message list (the loop the
    // user saw after resetting while a free-tier run was still generating).
    actionAbortRef.current?.abort();
    actionAbortRef.current = null;
    // Fresh conversation → fresh warm opencode session on the next message.
    conversationIdRef.current = makeConversationId();
    // Fix B: messages are replaced wholesale below, which drops any open
    // thinking line — keep the mirror honest or the next step_finish would
    // see a stale "still working" and never report done again.
    thinkingOpenRef.current = false;
    setMessages([
      { id: 'sys-1', type: 'system' as const, text: 'Olympus Interactive Terminal - speak directly to Apollo.', ts: new Date().toISOString() },
      { id: 'sys-2', type: 'system' as const, text: 'Apollo will interview you, classify your task, and delegate to the right gods.', ts: new Date().toISOString() },
    ]);
    setTodos([]);
    setGodStates(new Map());
    setFocusedGod(null);
    setSubmitting(false);
    setAwaitingAnswer(false);
    setAwaitingContext(false);
    setShowContext(false);
    setInput('');
    setContext('');
    setUploadedFileDetails([]);
    // Issue #46: a reset abandons every parked ask — its timer has to go with
    // it, or it would fire minutes later and reply on behalf of a conversation
    // that no longer exists. Neither of these was cleared here before.
    clearAllPermissionTimers();
    pendingPermissionsRef.current = {};
    lastPermissionId.current = '';
    updateGodActivity('apollo', 'idle');
    setShowResetConfirm(false);
    inputRef.current?.focus();
  }, [updateGodActivity, clearAllPermissionTimers]);

  // File upload handler — sends files to /api/olympus/upload, then appends
  // the file paths to the uploadedFiles list so they can be included in the
  // next prompt to Apollo.
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]);
      }
      const res = await fetch('/api/olympus/upload', { method: 'POST', body: formData });
      // Safe parse — a missing route or server error returns non-JSON
      // (Next.js renders a plain-text error page), which used to surface
      // as "Unexpected token 'S', \"Server act...\" is not valid JSON".
      const text = await res.text();
      let d: any;
      try {
        d = JSON.parse(text);
      } catch {
        throw new Error(`Upload endpoint error (HTTP ${res.status}): ${text.slice(0, 200)}`);
      }
      if (d.ok && d.files) {
        const names = d.files.map((f: any) => f.name);
        setUploadedFiles(prev => [...prev, ...names]);
        setUploadedFileDetails(prev => [...prev, ...d.files]);
        // P11.5 — surface extraction status + tree to the user.
        const summary = d.files.map((f: any) => {
          if (f.extracted) {
            const fileCount = f.tree ? (f.tree.match(/\n/g)?.length || 0) : '?';
            return `${f.name} → extracted (${fileCount} files${f.extractError ? `, ${f.extractError}` : ''})`;
          }
          if (f.extractError) return `${f.name} → ${f.extractError}`;
          // Clean notification — just the filename, no byte count
          return `${f.name}`;
        });
        addMessage({
          type: 'system',
          text: `Uploaded ${d.files.length} file(s): ${summary.join(', ')}`,
        });
      } else {
        addMessage({ type: 'error', text: d.error || 'Upload failed' });
      }
    } catch (err: any) {
      addMessage({ type: 'error', text: `Upload failed: ${err.message}` });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [addMessage]);

  // ------------------------------------------------------------------
  // Task 2 — Image upload handler.
  //
  // When the user picks an image via the hidden <input type=file
  // accept="image/*">, we:
  //   1. Validate an active project exists (the image lives in
  //      <project>/reference-images/).
  //   2. Create a local object URL for the inline thumbnail preview.
  //   3. POST the file (multipart) to /api/olympus/image-upload with
  //      the active project path.
  //   4. The server saves it to <project>/reference-images/<ts>-<name>.<ext>
  //      and returns the absolute saved path.
  //   5. We submit() a prompt to Apollo: "I uploaded a reference image
  //      at <path> — use it for the design", with the inline thumbnail
  //      attached to the user message. Apollo can then route the image
  //      to Athena (built-in VLM skill) for analysis.
  // ------------------------------------------------------------------
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    // Reset the input immediately so the same file can be re-selected
    // later (otherwise the onChange won't fire again for the same path).
    if (imageInputRef.current) imageInputRef.current.value = '';

    const projectPath = activeProject?.path;
    if (!projectPath) {
      addMessage({
        type: 'error',
        text: 'No active project. Select a project first — reference images are saved to <project>/reference-images/.',
      });
      return;
    }

    setUploadingImage(true);
    try {
      // Process each selected image (usually just one — but loop to handle
      // multi-select too. Each image becomes its own prompt to Apollo so
      // Athena gets a clean per-image VLM skill call.)
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (!file.type.startsWith('image/')) {
          addMessage({ type: 'error', text: `${file.name} is not an image — use the paperclip for code files.` });
          continue;
        }

        const thumbnailUrl = URL.createObjectURL(file);
        const formData = new FormData();
        formData.append('image', file);
        formData.append('projectPath', projectPath);

        let savedPath: string | null = null;
        let savedFilename: string = file.name;
        try {
          const res = await fetch('/api/olympus/image-upload', { method: 'POST', body: formData });
          const d = await res.json();
          if (d.ok && d.path) {
            savedPath = d.path;
            savedFilename = d.filename || file.name;
          } else {
            URL.revokeObjectURL(thumbnailUrl);
            addMessage({ type: 'error', text: d.error || `Image upload failed for ${file.name}` });
            continue;
          }
        } catch (err: any) {
          URL.revokeObjectURL(thumbnailUrl);
          addMessage({ type: 'error', text: `Image upload failed: ${err.message}` });
          continue;
        }

        // Submit the prompt to Apollo with the inline image attached.
        // Only the first image kicks off a new submit; subsequent images
        // would be queued behind `submitting` and could collide, so we
        // break after the first to keep the UX predictable. (If the user
        // wants to upload multiple, they can do so one at a time.)
        //
        // `savedPath` is non-null here because both failure paths above
        // `continue`d out of the loop. TS can't see through the
        // try/catch/continue control flow, so we assert non-null.
        await submit(
          `I uploaded a reference image at ${savedPath!} — use it for the design`,
          undefined,
          { thumbnailUrl, savedPath: savedPath!, filename: savedFilename },
        );
        break;
      }
    } finally {
      setUploadingImage(false);
    }
  }, [activeProject, addMessage, submit]);

  const toggleTodo = (id: string) => setTodos(prev => prev.map(t =>
    t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t,
  ));

  // Build a transcript summary of the
  // current conversation for the new-session handoff. Apollo receives
  // this in its fresh context window so the conversation continues
  // seamlessly. We:
  //   - Skip the initial welcome banners (sys-1 / sys-2) — static, no info.
  //   - Take the last 8 messages (oldest first).
  //   - Truncate very long messages so the summary itself doesn't blow
  //     up the new session's context (defeating the whole point).
  //   - Label each line with the speaker so Apollo knows who said what.
  const buildConversationSummary = useCallback(() => {
    const meaningful = messages.filter(m =>
      !(m.id === 'sys-1' || m.id === 'sys-2') &&
      m.text && m.text.trim().length > 0
    );
    // Collapse runs of consecutive assistant/system messages to a single
    // entry (the last one in the run). A model stuck re-emitting the same
    // kind of output (e.g. repeated "update the summary" blocks) would
    // otherwise poison the handoff — the new session would inherit dozens
    // of identical response lines and keep the loop alive.
    const collapsed: typeof meaningful = [];
    for (const m of meaningful) {
      const isAssistantLike = m.type === 'response' || m.type === 'system' || m.type === 'delegation' || m.type === 'todo';
      const prev = collapsed[collapsed.length - 1];
      if (prev && isAssistantLike && (prev.type === 'response' || prev.type === 'system' || prev.type === 'delegation' || prev.type === 'todo')) {
        collapsed[collapsed.length - 1] = m;
      } else {
        collapsed.push(m);
      }
    }
    const recent = collapsed.slice(-8);
    if (recent.length === 0) return '(no prior conversation)';
    const lines: string[] = [
      `Most recent ${recent.length} message${recent.length === 1 ? '' : 's'} (oldest first):`,
      '',
    ];
    const maxLen = 800;
    for (const m of recent) {
      const who =
        m.type === 'user' ? 'user' :
        m.type === 'response' ? (m.god ? (GOD_NAMES[m.god] || m.god) : 'assistant') :
        m.type === 'question' ? (m.god ? (GOD_NAMES[m.god] || m.god) : 'assistant') :
        m.type === 'context_request' ? (m.god ? (GOD_NAMES[m.god] || m.god) : 'assistant') :
        m.type === 'delegation' ? 'delegation' :
        m.type === 'todo' ? 'todo' :
        m.type === 'error' ? 'error' :
        'system';
      const text = m.text.length > maxLen
        ? m.text.slice(0, maxLen) + '... [truncated]'
        : m.text;
      lines.push(`[${who}]: ${text}`);
    }
    return lines.join('\n');
  }, [messages]);

  // Called when the user clicks "new session" in the ContextIndicator.
  // The reset is destructive (it drops the conversation and restarts the
  // warm server), so we confirm first instead of doing it on click.
  const handleNewSessionStart = useCallback(() => {
    // Kill any in-flight run so the new session doesn't inherit events from
    // the old conversation's stream.
    actionAbortRef.current?.abort();
    actionAbortRef.current = null;
    setShowNewSessionConfirm(true);
  }, []);

  // Confirmed: perform the TRUE reset.
  //   1. Clear every piece of in-memory client state (resetTerminal does
  //      this: messages, thinking line, reasoning buffer, todos, god
  //      activity, uploads, plus a fresh conversationId).
  //   2. POST action:'reset-session' — the server calls cleanupServer() then
  //      ensureServer(), so the warm `opencode serve` is killed and a brand
  //      new one is spawned on the next free port. Only a new process can
  //      give a genuinely empty context window.
  //   3. Report the new port so the user can see the server really changed.
  // The indicator needs no explicit poke: resetTerminal rotates the
  // conversationId, and the next 5s poll finds no mapping → zeros.
  const confirmNewSession = useCallback(async () => {
    setShowNewSessionConfirm(false);
    // Issue #21: resetTerminal() rotates conversationId below, so capture the
    // pre-reset id FIRST and hand it to the server — that is the stale mapping
    // it needs to prune from ~/.olympus/opencode-sessions.json.
    const staleConversationId = conversationIdRef.current;
    resetTerminal();
    setSubmitting(true);
    addMessage({ type: 'system', text: 'Restarting warm server…' });
    updateGodActivity('apollo', 'thinking', 'Restarting warm server...');
    ensureThinking();
    try {
      const res = await fetch('/api/olympus/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-session', conversationId: staleConversationId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addMessage({ type: 'error', text: `Session reset failed: ${data?.error || res.status}` });
        removeThinking();
        return;
      }
      addMessage({ type: 'system', text: `OpenCode server ready on port ${data.port}${data.warm ? ' (reused)' : ''} — fresh context window.` });
    } catch (e: any) {
      addMessage({ type: 'error', text: `Session reset failed: ${e?.message || 'network error'}` });
      removeThinking();
    } finally {
      removeThinking();
      setSubmitting(false);
      updateGodActivity('apollo', 'idle');
      inputRef.current?.focus();
    }
  }, [addMessage, updateGodActivity, ensureThinking, removeThinking, resetTerminal]);

  // Called when the new-session stream ends. handleServerEvent already
  // processed the 'action_done' SSE event (reset submitting/awaiting/etc.
  // and added a "Task completed." / "Task failed" message). This is a
  // safety net for the case where the stream ended WITHOUT an
  // 'action_done' (network failure before the SSE stream started).
  const handleNewSessionDone = useCallback(() => {
    setSubmitting(false);
    setAwaitingAnswer(false);
    setAwaitingContext(false);
    updateGodActivity('apollo', 'idle');
    inputRef.current?.focus();
  }, [updateGodActivity]);

  return (
    <div className="w-full h-full bg-olympus-bg flex flex-col">
      <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-olympus-gold/10 bg-olympus-panel">
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <Landmark size={11} style={{ color: GOD_COLOR }} />
          <span style={{ color: GOD_COLOR }} className="font-semibold">Olympus Terminal</span>
          <span className="text-[#5A5A5A]">-</span>
          {/* Only one mode now. Always "Interactive Mode" (green). */}
          <span className="text-[9px] text-olympus-green">
            Interactive Mode
          </span>
          {/* Compact "ctx N%" + bar.
              Placed next to the title so it reads as a session-state
              indicator (like a status LED) rather than a control. The
              "new session" button only renders when quality is warning
              or critical, so this slot is normally just the percentage
              + bar (subtle, no clutter). */}
          <div className="ml-2 flex items-center">
            <ContextIndicator
              getSummary={buildConversationSummary}
              getConversationId={() => conversationIdRef.current}
              onStart={handleNewSessionStart}
              onEvent={handleServerEvent}
              onDone={handleNewSessionDone}
            />
          </div>
        </div>
        <div className="flex items-center gap-1 text-[9px] font-mono text-[#5A5A5A]">
          {/* Active CLI badge */}
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-olympus-gold/10 ring-1 ring-olympus-gold/20 mr-1">
            <span style={{ color: GOD_COLOR }}>CLI:</span>
            <span style={{ color: GOD_COLOR }} className="font-semibold">{activeCli}</span>
          </span>
          {/* Removed the 2-way mode toggle (Apollo | OpenCode).
              Only the Interactive (Apollo) chat remains. The OpenCode Chat pane
              and the TUI are gone from this surface. */}
          <Users size={9} style={{ color: GOD_COLOR }} />
          <span>{godStateList.filter(s => s.status !== 'idle').length} gods</span>
          {todos.length > 0 && (
            <>
              <span className="text-[#5A5A5A]">-</span>
              <span>{todos.filter(t => t.status !== 'done').length}/{todos.length} todos</span>
            </>
          )}
          <OlympusTooltip content="Reset terminal (clears all messages + context)" side="bottom">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="ml-2 text-olympus-text-dim hover:text-olympus-red transition-colors"
            >
              <RefreshCw size={10} />
            </button>
          </OlympusTooltip>
        </div>
      </div>

      {/* Reset confirmation dialog — Olympus styled, not browser default */}
      {showNewSessionConfirm && (
        <div className="shrink-0 px-3 py-2 bg-olympus-gold/10 border-b border-olympus-gold/30 flex items-center justify-between">
          <span className="text-[10px] font-mono text-olympus-gold flex items-center gap-1.5">
            <RefreshCw size={11} />
            Start a fresh session? This clears the conversation and restarts the warm server (~10s). The project stays the same.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewSessionConfirm(false)}
              className="text-[10px] font-mono px-2 py-1 rounded text-olympus-text-dim hover:bg-olympus-gold/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmNewSession}
              className="text-[10px] font-mono px-2 py-1 rounded bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 ring-1 ring-olympus-gold/30 transition-colors"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="shrink-0 px-3 py-2 bg-olympus-red/10 border-b border-olympus-red/30 flex items-center justify-between">
          <span className="text-[10px] font-mono text-olympus-red flex items-center gap-1.5">
            <AlertCircle size={11} />
            Reset terminal? This clears all messages, TODOs, and context. This cannot be undone.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="text-[10px] font-mono px-2 py-1 rounded text-olympus-text-dim hover:bg-olympus-gold/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={resetTerminal}
              className="text-[10px] font-mono px-2 py-1 rounded bg-olympus-red/20 text-olympus-red hover:bg-olympus-red/30 ring-1 ring-olympus-red/30 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Issue #47 — toggled by typing /permissions. Owns its own fetch and
          revoke confirmations, so it stays out of the terminal's state. */}
      {showPermissions && <PermissionsPanel onClose={() => setShowPermissions(false)} />}

      <div className="flex-1 min-h-0 flex">
        {/* Only the Interactive (Apollo) chat remains.
            The OpenCode Mode toggle and the TerminalTabs rendering are gone.
            The Apollo chat uses /api/olympus/action (god delegation, todos, etc.). */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scroll px-3 py-2 font-mono text-[11px] leading-relaxed space-y-2">
            {messages.map(m => (
              <VisibleMessage
                key={m.id}
                message={m}
                focusedGod={focusedGod}
                onChoice={handleChoice}
                onPermissionReply={handlePermissionReply}
              />
            ))}
            {/* DesignReviewCard renders inline when Athena
                surfaces design-system candidates. The card polls
                /api/olympus/design-review for pending requests and renders
                itself when one exists. The user clicks a candidate to select
                it, which auto-submits a user message to the chat. */}
            <DesignReviewCard
              onSelect={handleDesignReviewSelect}
              onDismiss={handleDesignReviewDismiss}
            />
            {submitting && !awaitingAnswer && !awaitingContext && (
              <div className="flex items-center gap-2 text-olympus-text-dim">
                <Loader2 size={12} className="animate-spin" style={{ color: GOD_COLOR }} />
                <span>waiting for <span style={{ color: GOD_COLOR }}>Apollo</span>...</span>
              </div>
            )}
            {awaitingAnswer && (
              <div className="flex items-center gap-2 text-olympus-gold text-[10px]">
                <ChevronRight size={11} className="animate-pulse" />
                <span>click a choice above to answer...</span>
              </div>
            )}
            {awaitingContext && (
              <div className="flex items-center gap-2 text-olympus-gold text-[10px]">
                <ChevronRight size={11} className="animate-pulse" />
                <span>type context below, Cmd+Enter to send (empty = skip)...</span>
              </div>
            )}
          </div>

          {showContext && (
            <div className="shrink-0 border-t border-olympus-gold/10 bg-olympus-panel px-3 py-2">
              <div className="text-[9px] font-mono text-olympus-text-dim mb-1">
                Additional context {awaitingContext ? '(Apollo is waiting — Cmd+Enter to send, empty = skip)' : '(optional)'}:
              </div>
              <textarea
                ref={contextRef}
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Add any extra context..."
                className="w-full bg-olympus-bg border border-olympus-gold/15 rounded-md px-2 py-1.5 text-[11px] font-mono text-olympus-text outline-none focus:border-olympus-gold/40 resize-none"
                rows={2}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (awaitingContext) sendContext();
                    else submit(input, context);
                  }
                }}
              />
            </div>
          )}

          <div className="shrink-0 border-t border-olympus-gold/10 bg-olympus-panel px-3 py-2 flex items-center gap-2">
            <span style={{ color: GOD_COLOR }} className="font-mono text-[12px] shrink-0">$</span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !awaitingAnswer && !awaitingContext) submit(input, context);
              }}
              disabled={submitting || awaitingAnswer || awaitingContext}
              placeholder={awaitingAnswer ? 'click a choice above (or type optional context in the box under the question)...' : awaitingContext ? 'type context below (Cmd+Enter)...' : 'Ask Apollo anything...'}
              className="flex-1 bg-transparent border-0 outline-none text-[12px] font-mono text-olympus-text placeholder:text-[#5A5A5A] disabled:opacity-50"
            />
            {/* Task 3 — the always-visible "ctx" toggle button is gone.
                Additional context is now collected inline under each
                interview question (see MessageRenderer's question branch).
                The `context_request` flow (Apollo explicitly asking for
                context after a task) still drives `showContext`/`awaitingContext`
                and renders the textarea below when needed. */}
            {/* File upload button — accepts .rar, .tar, .svg, code files */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".rar,.tar,.tar.gz,.tgz,.zip,.svg,.md,.txt,.json,.yaml,.yml,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.c,.cpp,.h,.hpp,.cs,.rb,.php,.swift,.kt,.scala,.sh,.bash,.ps1,.bat,.html,.css,.scss,.less,.vue,.svelte,.sql,.graphql,.proto"
              onChange={handleFileUpload}
              className="hidden"
            />
            <OlympusTooltip content="Upload documents for the gods to read (.rar, .tar, .svg, code files)" side="top">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  'flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-mono transition-all shrink-0',
                  uploading ? 'text-olympus-gold animate-pulse' : 'text-[#5A5A5A] hover:text-olympus-gold',
                )}
              >
                {uploading ? <Loader2 size={10} className="animate-spin" /> : <Paperclip size={10} />}
                {uploadedFiles.length > 0 && (
                  <span className="text-olympus-gold">{uploadedFiles.length}</span>
                )}
              </button>
            </OlympusTooltip>
            {/* Task 2 — Image upload button. Saves the image to
                <active-project>/reference-images/<timestamp>.<ext> and
                sends Apollo a prompt pointing at the saved path so Athena
                can analyze it via the built-in VLM skill. Disabled (with a hint)
                when no project is active. */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp,image/svg+xml"
              onChange={handleImageUpload}
              className="hidden"
            />
            <OlympusTooltip
              content={
                activeProject?.path
                  ? `Send a reference image — saved to <project>/reference-images/ (Athena analyzes it via VLM skill)`
                  : 'Select an active project first — reference images are saved to <project>/reference-images/'
              }
              side="top"
            >
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage || !activeProject?.path || submitting}
                className={cn(
                  'flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-mono transition-all shrink-0',
                  uploadingImage
                    ? 'text-olympus-cyan animate-pulse cursor-pointer'
                    : activeProject?.path
                      ? 'text-[#5A5A5A] hover:text-olympus-cyan cursor-pointer'
                      // No-project case: keep the ImageIcon (do NOT swap to Ban),
                      // dim it, and apply the custom OLYMPUS ban cursor. The
                      // native Windows red-circle-slash cursor is replaced by
                      // the SVG ban overlay (.olympus-ban-cursor in globals.css).
                      : 'text-[#5A5A5A]/40 olympus-ban-cursor',
                )}
              >
                {uploadingImage ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <ImageIcon size={10} />
                )}
              </button>
            </OlympusTooltip>
            {submitting ? (
              <OlympusTooltip content="Stop generation" side="top">
                <button
                  onClick={stop}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-olympus-red/20 text-olympus-red hover:bg-olympus-red/30 transition-all shrink-0"
                >
                  <Square size={11} /> stop
                </button>
              </OlympusTooltip>
            ) : (
              <OlympusTooltip content={input.trim() ? 'Send to Apollo (Enter)' : 'Type something to send'} side="top">
                {/* empty-input: keep Send icon */}
                <button
                  onClick={() => submit(input, context)}
                  disabled={!input.trim()}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all shrink-0',
                    input.trim()
                      ? 'bg-olympus-gold/15 ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25 cursor-pointer'
                      : 'bg-olympus-card/50 ring-1 ring-olympus-red/10 olympus-ban-cursor',
                  )}
                  style={input.trim() ? { color: GOD_COLOR } : { color: '#5A5A5A' }}
                >
                  <><Send size={11} /> send</>
                </button>
              </OlympusTooltip>
            )}
            <span className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-[#5A5A5A]">
              <CornerDownLeft size={9} /> enter
            </span>
          </div>
        </div>

        {(godStateList.length > 0 || todos.length > 0) && (
          <div className="w-60 shrink-0 border-l border-olympus-gold/10 bg-olympus-panel flex flex-col min-h-0">
            {/* The cards scroll; the plan does not. A checklist you have to
                scroll to find is not telling you what is happening now. */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
              <GodPanel states={godStateList} focusedGod={focusedGod} onFocus={setFocusedGod} />
            </div>
            <PlanPanel items={todos} onToggle={toggleTodo} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MessageRenderer — renders each message type. Written with proper    */
/* multi-line JSX to avoid parsing errors.                             */
/*                                                                      */
/* Task 1 — 'response', 'god', 'system', 'todo' messages are rendered  */
/* as markdown (via `marked`) inside the .olympus-markdown CSS class   */
/* defined in globals.css. The HTML is memoized so we don't re-parse   */
/* the same text on every render. User/error/delegation/context_request*/
/* stay as plain text — they're authored, not LLM-output.              */
/*                                                                      */
/* Task 2 — user messages may carry an inline image thumbnail          */
/* (`imagePath`) shown above the message text.                          */
/*                                                                      */
/* Task 3 — question messages render a small inline context textarea   */
/* below the choices. See QuestionMessage below.                        */
/* ------------------------------------------------------------------ */
/**
 * Issue #42 — click-to-focus. Focusing a god in the Parthenon narrows the
 * stream to that god's frames. Frames with no god are global by construction
 * (the user's own words, system notices, errors), and hiding them would strand
 * a parked run with nothing to answer — so they always stay visible.
 */
function VisibleMessage({
  message,
  focusedGod,
  ...rest
}: {
  message: ChatMessage;
  focusedGod: string | null;
  onChoice: (choice: string, context?: string) => void;
  onPermissionReply: (requestID: string, reply: 'once' | 'always' | 'reject') => void;
}) {
  if (focusedGod && message.god && message.god !== focusedGod) return null;
  return <MessageRenderer message={message} {...rest} />;
}

function MessageRenderer({
  message,
  onChoice,
  onPermissionReply,
}: {
  message: ChatMessage;
  onChoice: (choice: string, context?: string) => void;
  onPermissionReply: (requestID: string, reply: 'once' | 'always' | 'reject') => void;
}) {
  const time = new Date(message.ts).toLocaleTimeString('en-US', { hour12: false });

  // Task 1 — memoize markdown HTML for the types that should render
  // formatted. Returns null for types that stay as plain text.
  const markdownHtml = useMemo(() => {
    if (
      message.type === 'response' ||
      message.type === 'god' ||
      message.type === 'system' ||
      message.type === 'todo'
    ) {
      return renderMarkdown(message.text);
    }
    return null;
  }, [message.type, message.text]);

  // ----------------------------------------------------------------
  // USER — plain text (the user's input is never rendered as
  // markdown). Task 2: optionally render an inline image thumbnail
  // above the text when the message carries an uploaded image.
  //
  // Alignment fix: the timestamp sits in a fixed w-16 column on the
  // left, and ALL content (the `$` prompt marker + text + optional
  // image) lives in a single flex-1 column on the right. This keeps
  // every message type's content starting at the same x position,
  // regardless of whether the row has icons, markdown, or plain text.
  // ----------------------------------------------------------------
  if (message.type === 'user') {
    return (
      <div className="flex items-start gap-2 mt-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex-1 min-w-0">
          {message.imagePath && (
            <div className="mb-1.5">
              <img
                src={message.imagePath}
                alt={message.imageFilename || 'reference image'}
                className="max-h-40 max-w-56 rounded-md ring-1 ring-olympus-gold/25 object-cover"
              />
              {message.imageSavedPath && (
                <div className="text-[9px] text-[#5A5A5A] mt-1 font-mono break-all">
                  saved → {message.imageSavedPath}
                </div>
              )}
            </div>
          )}
          <div className="flex items-start gap-1.5">
            <span style={{ color: GOD_COLOR }} className="shrink-0">$</span>
            <span className="text-olympus-text wrap-break-word flex-1 min-w-0">{message.text}</span>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // SYSTEM — short status messages. Rendered as markdown so a plan
  // .md file Apollo echoes back as a system message gets formatted.
  // Falls back to plain text if marked produced nothing.
  // ----------------------------------------------------------------
  if (message.type === 'system') {
    return (
      <div className="flex items-start gap-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex-1 min-w-0">
          {markdownHtml ? (
            <div
              className="olympus-markdown text-[11px]"
              dangerouslySetInnerHTML={{ __html: markdownHtml }}
            />
          ) : (
            <span className="text-olympus-text-dim">{message.text}</span>
          )}
        </div>
      </div>
    );
  }

  if (message.type === 'error') {
    return (
      <div className="flex items-start gap-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          <AlertCircle size={11} className="text-olympus-red shrink-0 mt-0.5" />
          <span className="text-olympus-red wrap-break-word flex-1 min-w-0">{message.text}</span>
        </div>
      </div>
    );
  }

  if (message.type === 'delegation') {
    const Icon = message.god ? GOD_ICONS[message.god] : null;
    return (
      <div className="flex items-start gap-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Zap size={11} style={{ color: '#9B7BAE' }} className="shrink-0 mt-0.5" />
          <span className="text-olympus-purple wrap-break-word flex-1 min-w-0">{message.text}</span>
          {Icon && <Icon size={11} style={{ color: GOD_COLOR }} className="shrink-0 mt-0.5" />}
        </div>
      </div>
    );
  }

  if (message.type === 'tool') {
    // Issue #32: compact one-line tool activity. Dimmer than a delegation
    // frame — these are frequent and are signal, not narration. Deliberately
    // NOT markdown-rendered (bash output can contain backticks/brackets).
    // Issue #44: file-touching tools render a diff-aware frame instead; every
    // other tool keeps exactly the single compact line it had.
    return (
      <div className="flex items-start gap-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex-1 min-w-0">
          <ToolFrame toolName={message.toolName || ''} input={message.toolInput} text={message.text} />
        </div>
      </div>
    );
  }

  if (message.type === 'context_request') {
    const Icon = message.god ? GOD_ICONS[message.god] : null;
    return (
      <div className="flex items-start gap-2 mt-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          {Icon && <Icon size={11} style={{ color: GOD_COLOR }} className="shrink-0 mt-0.5 animate-pulse" />}
          <div className="flex-1 min-w-0">
            <div className="text-olympus-gold font-semibold mb-1">
              {GOD_NAMES[message.god!] || 'Apollo'} asks:
            </div>
            <div className="text-olympus-text">{message.text}</div>
            <div className="text-[9px] text-[#5A5A5A] mt-1">type in the context box below (Cmd+Enter to send, empty = skip)</div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // QUESTION — interview prompt with dynamic choices. Task 3: a
  // small inline context textarea lives below the choices so the
  // user can send extra context along with their answer. This
  // replaces the always-visible "ctx" toggle button.
  // ----------------------------------------------------------------
  if (message.type === 'question') {
    return <QuestionMessage message={message} onChoice={onChoice} time={time} />;
  }

  // ----------------------------------------------------------------
  // THINKING — one self-updating "thinking… (Ns)" counter line. Purely
  // client-side (1s interval over message.ts); it keeps counting through
  // tool runs, permission waits, and provider stalls, replacing the dead
  // silence that made freezes #1–#3 look identical.
  // ----------------------------------------------------------------
  if (message.type === 'thinking') {
    return <ThinkingMessage message={message} time={time} />;
  }

  // ----------------------------------------------------------------
  // PERMISSION — OpenCode blocked the run on a permission ask.
  // Buttons POST to /api/olympus/action {action:'permission'} which hits
  // the warm server's /permission/{id}/reply endpoint directly.
  // ----------------------------------------------------------------
  if (message.type === 'permission') {
    const pending = message.permissionState === 'pending';
    const decided = message.permissionState === 'approved' ? '✓ approved for this run'
      : message.permissionState === 'always' ? '✓ always allowed'
      // Issue #46: the timeout denies the ask, so the SSE reply flips this to
      // 'denied' — the flag is what distinguishes "nobody answered" from a
      // deliberate Deny click, and it survives that flip.
      : message.permissionState === 'denied' ? (message.permissionTimedOut ? '✗ denied (timeout)' : '✗ denied') : '';
    return (
      <div className="flex items-start gap-2 mt-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex-1 min-w-0 rounded-md border border-olympus-amber-soft/40 bg-olympus-amber-soft/5 p-2">
          <div className="text-[10px] font-mono font-semibold text-olympus-amber-soft mb-1">
            {message.permissionAction} permission required
          </div>
          <div className="text-[9px] font-mono text-olympus-text-dim mb-1.5">{message.text}</div>
          {(message.permissionPatterns || []).map((p, i) => (
            <div key={i} className="text-[9px] font-mono text-olympus-text-dim truncate">• {p}</div>
          ))}
          {pending && onPermissionReply && (
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={() => onPermissionReply(message.permissionId!, 'once')}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-olympus-gold/15 text-olympus-gold border border-olympus-gold/30 hover:bg-olympus-gold/25 transition-colors"
              >
                Allow once
              </button>
              <button
                onClick={() => onPermissionReply(message.permissionId!, 'always')}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-olympus-gold/15 text-olympus-gold border border-olympus-gold/30 hover:bg-olympus-gold/25 transition-colors"
              >
                Always allow
              </button>
              <button
                onClick={() => onPermissionReply(message.permissionId!, 'reject')}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-olympus-red/10 text-olympus-red border border-olympus-red/30 hover:bg-olympus-red/20 transition-colors"
              >
                Deny
              </button>
              {/* Issue #41: "always" is no longer a promise about this run. */}
              <span className="text-[9px] font-mono text-olympus-text-dim ml-1">
                run is blocked until one is chosen — always writes {message.permissionAction || 'this tool'} to permissions.json
              </span>
            </div>
          )}
          {!pending && (
            // Issue #46: a denial (a Deny click, or the timeout) is not a
            // green outcome — it read as "allowed" until now.
            <div className={`text-[10px] font-mono mt-1.5 ${message.permissionState === 'denied' ? 'text-olympus-red' : 'text-olympus-green'}`}>{decided}</div>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // TODO — markdown rendered (todos often contain `**bold**` task
  // descriptions or short lists from Apollo's plan writer).
  // ----------------------------------------------------------------
  if (message.type === 'todo') {
    const Icon = message.god ? GOD_ICONS[message.god] : null;
    return (
      <div className="flex items-start gap-2">
        <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          <CheckCircle2 size={11} style={{ color: GOD_COLOR }} className="shrink-0 mt-0.5" />
          {Icon && <Icon size={11} style={{ color: GOD_COLOR }} className="shrink-0 mt-0.5" />}
          {markdownHtml ? (
            <div
              className="olympus-markdown text-[11px] flex-1 min-w-0"
              dangerouslySetInnerHTML={{ __html: markdownHtml }}
            />
          ) : (
            <span className="text-olympus-text wrap-break-word flex-1 min-w-0">{message.text}</span>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Default — response (Apollo's main output). Always rendered as
  // markdown so plans, code blocks, bullet lists, etc. display
  // formatted. The left border tinted with the god's color is kept
  // so multi-god conversations still visually separate responses.
  // ----------------------------------------------------------------
  const Icon = message.god ? GOD_ICONS[message.god] : null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
      <div className="flex items-start gap-1.5 flex-1 min-w-0">
        {Icon && <Icon size={11} style={{ color: GOD_COLOR }} className="shrink-0 mt-0.5" />}
        <div
          className="olympus-markdown text-[11px] flex-1 min-w-0"
          style={message.god ? { borderLeft: `2px solid ${GOD_COLOR}40`, paddingLeft: '6px' } : undefined}
          dangerouslySetInnerHTML={{ __html: markdownHtml ?? message.text }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QuestionMessage — interview prompt with dynamic choices.            */
/*                                                                      */
/* Task 3 — a small inline textarea lives below the choices so the     */
/* user can type optional additional context (limited to MAX_CONTEXT    */
/* characters with a live counter, like z.ai). When the user clicks a  */
/* choice, both the choice AND the typed context are sent to Apollo    */
/* (the choice becomes the answer; the context is folded in as a       */
/* `context` field on the answer payload).                             */
/* ------------------------------------------------------------------ */
/* ThinkingMessage — the live "thinking… (Ns)" counter (Phase 4.0). The
 * counter derives from message.ts, so it survives React re-renders and
 * keeps ticking while the model streams, a tool runs, or the provider
 * stalls. Dim gray + pulse — reuses the god-row token palette.        */
function ThinkingMessage({
  message,
  time,
}: {
  message: ChatMessage;
  time: string;
}) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.round((Date.now() - new Date(message.ts).getTime()) / 1000)),
  );
  const [expanded, setExpanded] = useState(false);
  const reasoningRef = useRef<HTMLDivElement>(null);
  const hasReasoning = (message.reasoning || '').length > 0;
  useEffect(() => {
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.round((Date.now() - new Date(message.ts).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [message.ts]);
  // Auto-scroll the reasoning box while streaming (only when expanded).
  useEffect(() => {
    if (expanded && reasoningRef.current) reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
  }, [expanded, message.reasoning]);

  return (
    <div className="flex items-start gap-2 mt-2">
      <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-1.5 min-w-0 cursor-pointer select-none"
          onClick={() => setExpanded(x => !x)}
          title={expanded ? 'Collapse reasoning' : 'Expand reasoning'}
        >
          <span className="text-[10px] font-mono text-[#5A5A5A] animate-pulse">thinking…</span>
          <span className="text-[9px] font-mono text-[#5A5A5A] tabular-nums">({secs}s)</span>
          <span className="text-[9px] font-mono text-[#5A5A5A] ml-auto shrink-0">
            {hasReasoning ? (expanded ? '▾' : '▸') : ''}
          </span>
        </div>
        {expanded && (
          <div
            ref={reasoningRef}
            className="mt-1 ml-3 max-h-48 overflow-y-auto custom-scroll border-l border-[#5A5A5A]/30 pl-2"
          >
            {hasReasoning ? (
              <div className="text-[13px] italic text-[#5A5A5A] whitespace-pre-wrap break-words leading-snug">
                {message.reasoning}
              </div>
            ) : (
              <div className="text-[13px] italic text-[#5A5A5A]">
                No reasoning stream received — this model may not emit thinking tokens (see LLM Strategy to switch).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionMessage({
  message,
  onChoice,
  time,
}: {
  message: ChatMessage;
  onChoice: (choice: string, context?: string) => void;
  time: string;
}) {
  const Icon = message.god ? GOD_ICONS[message.god] : null;
  // Local state for the inline context box. Lives inside this component
  // so each question tracks its own context independently.
  const [ctx, setCtx] = useState('');
  const MAX_CONTEXT = 500;

  return (
    <div className="flex items-start gap-2 mt-2">
      <span className="text-[9px] text-[#5A5A5A] shrink-0 tabular-nums w-16 pt-0.5 leading-none">{time}</span>
      <div className="flex items-start gap-1.5 flex-1 min-w-0">
        {Icon && <Icon size={11} style={{ color: GOD_COLOR }} className="shrink-0 mt-0.5 animate-pulse" />}
        <div className="flex-1 min-w-0">
          <div className="text-olympus-gold font-semibold mb-1">
            {GOD_NAMES[message.god!] || 'Apollo'} asks:
          </div>
          <div className="text-olympus-text mb-2">{message.text}</div>
          {message.choices && message.choices.length > 0 && (
            <div className="space-y-1">
              {message.choices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => onChoice(choice, ctx)}
                  disabled={!message.awaitingAnswer}
                  className={cn(
                    'block w-full text-left px-2 py-1 rounded-md text-[10px] font-mono transition-all',
                    message.awaitingAnswer
                      ? 'bg-olympus-card hover:bg-olympus-gold/10 ring-1 ring-olympus-gold/15 hover:ring-olympus-gold/30 text-olympus-text hover:text-olympus-gold cursor-default'
                      : 'bg-olympus-card/50 ring-1 ring-olympus-gold/5 text-[#5A5A5A] cursor-default opacity-60',
                  )}
                >
                  <span className="text-[#5A5A5A] mr-1.5">{i + 1}.</span>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {/* Task 3 — inline context box. Only rendered while the
              question is awaiting an answer (after the user picks a
              choice, awaitingAnswer flips false and the box disappears).
              Limited to MAX_CONTEXT chars with a live counter. The
              counter turns amber in the last 50 chars as a soft warning. */}
          {message.awaitingAnswer && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#5A5A5A] mb-1">
                <span>optional context (sent with your answer)</span>
                <span
                  className={cn(
                    ctx.length > MAX_CONTEXT - 50 ? 'text-olympus-amber' : 'text-[#5A5A5A]',
                  )}
                >
                  {ctx.length}/{MAX_CONTEXT}
                </span>
              </div>
              <textarea
                value={ctx}
                onChange={e => setCtx(e.target.value.slice(0, MAX_CONTEXT))}
                placeholder="e.g. 'use Tailwind', 'mobile-first', 'avoid external deps'…"
                rows={2}
                className="w-full bg-olympus-bg border border-olympus-gold/15 rounded-md px-2 py-1.5 text-[10px] font-mono text-olympus-text placeholder:text-[#5A5A5A] outline-none focus:border-olympus-gold/40 resize-none custom-scroll"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
