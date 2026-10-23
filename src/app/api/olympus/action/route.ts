/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { basename, dirname } from 'node:path';
import { requireAuth } from '@/lib/auth';
// Uses spawnOpencode() for Windows shell:true + stdin:'ignore' + local binary resolution.
import { spawnOpencode, resolveDispatchCwd } from '@/lib/opencode-spawn';
import { resolveAndRegisterIntent, stripUploadBlock } from '@/lib/project-intent';
import { maybeStartDevServer } from '@/lib/dev-server-trigger';
import { maybeWalkThePlan, resolvePlanWalkAnswer } from '@/lib/hop-runtime/post-run';
import { watchdogDecision, classifyRetry, isTurnAliveServerSide } from '@/lib/opencode-session';
import { probeLane } from '@/lib/lane-probe';
import { reconcileProjectPath } from '@/lib/project-context';
import { composePlannerRag } from '@/lib/rag-inject';
import { UI_REFERENCES_MARKER_BLOCK } from '@/lib/ui-references';
// Warm OpenCode session manager — one persistent `opencode serve` per app
// run. First message cold-starts the server; every subsequent message reuses
// the running server + session (no cold start, context retained).
import {
  ensureServer,
  cleanupServer,
  getOrCreateSession,
  runWarmMessage,
  buildStrategyContextBlock,
  respondToPermission,
  markSessionError,
  forgetConversation,
} from '@/lib/opencode-session';
// Dynamic input token routing via task classifier.
import { classifyTask, classifyTurnWithInheritance, isNewTaskMarker, noQuestionsIntent, serializeClassification, type TaskClassification } from '@/lib/task-classifier';
import { appendActivity } from '@/lib/activity-feed';
// Issue #41: persisting an "always" grant so the next ask for the same tool
// is settled by policy instead of by another card.
import { grantAlways, loadPermissions, revokeTool, SEED_TOOL_NAMES } from '@/lib/permissions';
// ChildProcess type for the streamChild() signature.
import type { ChildProcess } from 'node:child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Timeout: if opencode produces no output within STARTUP_TIMEOUT_MS,
// send an error event and kill the process.
// 120s — opencode cold start + first API call. Free-tier endpoints
// (OpenRouter/Groq shared pools) can take 30-90s to return the first
// token when rate-limited; a 45s timer was killing legitimately-slow
// free-tier runs ("no output within 45s" seen in the interactive
// terminal on 2026-07-31).
const STARTUP_TIMEOUT_MS = 120_000; // 120 seconds
// Total max runtime — if opencode runs longer than this, we kill it.
// UAT-5 (the peak-hour evolution): the max-runtime ceiling is now
// env-tunable — the 10-minute default was the UAT-4/5 specimen: a peak-hour
// planning turn legitimately needs more wall-clock. OLYMPUS_MAX_RUNTIME_MS
// (default 15 min — generous for planning, short enough to catch real hangs).
const MAX_RUNTIME_MS = (() => {
  const n = Number.parseInt(process.env.OLYMPUS_MAX_RUNTIME_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60_000;
})();

// Issue #51: unattended mode. When a caller declares body.unattended on a
// prompt, the run has no human on the other end — probes, batch harnesses,
// scheduled/automated jobs. The brainstorming skill (and siblings) enforce a
// HARD-GATE of "present design → wait for user approval", which stalls such
// runs forever (12a probes T5b/T6b stalled at the Q&A phase until the
// harness deadline). This directive is prepended IN-BAND to the spawned run
// so it overrides any skill-level gate the model loads mid-run; the
// OLYMPUS_UNATTENDED=1 env (same pattern as OLYMPUS_MANAGED) additionally
// lets the plugin emit an unattended_mode telemetry event (session.created
// hook) and lets future code-side gates key off the flag. Default behavior
// is UNCHANGED when the flag is absent.
const UNATTENDED_DIRECTIVE = [
  '[OLYMPUS UNATTENDED MODE]',
  'This run is unattended: no human will read or answer anything until it finishes.',
  '- Never ask questions and never wait for a reply — not for clarifications, approvals, design review, or spec sign-off.',
  '- This explicitly overrides any skill-level HARD-GATE or "wait for the user" instruction (e.g. the brainstorming skill\'s interview and approval gates): satisfy those gates yourself and say you did.',
  '- NEVER end your turn by presenting a design, plan, or proposal and waiting. "I\'ll present a design before implementing" followed by a stop is the known failure shape — a design presented to nobody is a stall, not progress. Present the design AND build the deliverable in the SAME run.',
  '- Decide and proceed with sensible defaults. State every assumption you made explicitly in your final output.',
  '',
].join('\n');

/**
 * #64 (BATCH 13): the no-questions intent detector lives in
 * task-classifier.ts (pure-function home); see NO_QUESTIONS_RE there.
 */

/**
 * Issue #63 (BATCH 13): conversationId → the last APPLIED classification.
 * Server-lifetime, bounded to 512 entries (oldest evicted); a server
 * restart = cold session = fresh classification, by design.
 */
const classificationMemory = new Map<string, TaskClassification>();
function rememberConversationClassification(conversationId: string, c: TaskClassification): void {
  classificationMemory.delete(conversationId);
  classificationMemory.set(conversationId, c);
  if (classificationMemory.size > 512) {
    const oldest = classificationMemory.keys().next();
    if (!oldest.done) classificationMemory.delete(oldest.value);
  }
}

// #U2 (UAT-2-FIX): the conversation-project continuity — a conversation
// that created or routed a project REMEMBERS it; a follow-up turn
// inherits it (never a new-project derivation from a control message,
// the 16:59 specimen: "Perfeito, só me retorne quando finalizar" became
// the project 'perfeito-retorne-quando-finalizar'). New-project turns
// are explicit (the classifier's new-task markers), never meta-text.
const conversationProjectMemory = new Map<string, string>();
function rememberConversationProject(conversationId: string, slug: string): void {
  conversationProjectMemory.delete(conversationId);
  conversationProjectMemory.set(conversationId, slug);
  if (conversationProjectMemory.size > 512) {
    const oldestP = conversationProjectMemory.keys().next();
    if (!oldestP.done) conversationProjectMemory.delete(oldestP.value);
  }
}
function getConversationProject(conversationId: string): string | null {
  return conversationProjectMemory.get(conversationId) ?? null;
}

/**
 * POST /api/olympus/action
 *
 * Dispatches Olympus commands via the `opencode` CLI and streams JSON lines
 * back to the client as SSE. Three modes:
 *
 * 1. Prompt mode — free-form text dispatched to Apollo.
 *    Body: { action: 'prompt'|'answer'|'context', text: string, conversationId?: string }
 *    Runs on the WARM opencode session (persistent `opencode serve`): the
 *    first message per app run cold-starts the server, every following
 *    message reuses the same opencode session for the same conversationId,
 *    so context is retained with no cold start.
 *
 * 2. New-session mode — fresh opencode session (new conversationId) with
 *    the previous conversation's summary carried forward.
 *    Body: { action: 'new-session', text: string, conversationId: string }
 *
 * 3. Context-menu mode — instinct lifecycle actions on a brain-atlas node.
 *    Body: { action: 'evolve'|'archive'|'promote'|'contradiction'|'lineage'|'prune'|'stocktake',
 *            node?: { name, type, god } }
 *
 *    Mapping to real Olympus commands:
 *      - archive                       → /callimachus-heartbeat --deep (compact-brain)
 *      - evolve / promote / contradiction / prune → /callimachus-heartbeat (7-stage cleanup, includes PRUNE)
 *      - lineage / stocktake           → /instinct-status (read-only pool dump)
 *
 *    These stay on the one-shot `opencode run` path (rare button clicks,
 *    command-style invocations — not conversation messages).
 *
 * Auth is required in lan/tunnel mode; localhost origins pass in local mode.
 *
 * If the warm server cannot start, prompt/new-session modes transparently
 * fall back to one-shot `opencode run --format json [--session <id>]`
 * (context still retained via the session id when one exists).
 */
export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { action, node, text } = body;

  // conversationId — client-generated per chat conversation. When absent
  // (older clients / non-terminal callers) each request gets a fresh
  // opencode session, preserving the previous one-shot behavior.
  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.trim()
      ? body.conversationId.trim()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ─── #63 (BATCH 13): warm-session classification inheritance ────────────
  // conversationId → the last APPLIED TaskClassification. Server-lifetime
  // map (dev/prod process memory): a restart is a cold session → fresh
  // classification, which is exactly the intended cold-session behavior.
  // Bounded so a long-lived server can't grow it unbounded.
  const priorClassification = classificationMemory.get(conversationId) ?? null;

  // ---- Permission reply ---------------------------------------------------
  // `permission` actions answer a pending OpenCode permission ask directly
  // via the warm server's /permission/{requestID}/reply endpoint — they are
  // NOT prompts (unlike `answer`, which is fed to the LLM as chat text).
  //
  // Issue #41: `respond-permission` is the card's action. It carries a
  // `decision` (once|always|reject) and, for `always`, the tool + pattern it
  // applies to — the grant is written to ~/.olympus/permissions.json so the
  // next ask for the same tool is settled by policy instead of by a card.
  // The legacy `permission` + `reply` shape stays supported so an older
  // client cannot strand a parked run.
  if (action === 'permission' || action === 'respond-permission') {
    const requestID = typeof body.requestID === 'string' ? body.requestID : '';
    const decision = action === 'respond-permission' ? body.decision : body.reply;
    if (!requestID || (decision !== 'once' && decision !== 'always' && decision !== 'reject')) {
      return NextResponse.json(
        { error: 'permission action requires requestID + reply (once|always|reject)' },
        { status: 400 },
      );
    }
    try {
      const ok = await respondToPermission(requestID, decision);
      // Persist the grant only when OpenCode accepted it, so a failed reply
      // cannot leave a rule the user thinks they set but that never applied.
      let granted = false;
      if (ok && decision === 'always') {
        const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
        if (tool) {
          const pattern = Array.isArray(body.patterns) && typeof body.patterns[0] === 'string' ? body.patterns[0] : '';
          grantAlways(tool, pattern);
          granted = true;
        }
      }
      return NextResponse.json({ ok, granted, error: ok ? undefined : 'OpenCode rejected the reply (unknown requestID or server unavailable)' }, { status: ok ? 200 : 502 });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || 'permission reply failed' }, { status: 500 });
    }
  }

  // ---- Permission policy (issue #47) --------------------------------------
  // `permissions-list` / `permissions-revoke` back the /permissions panel.
  // Both live here, under the same local-origin/auth guard as every other
  // action, and both answer with the full refreshed list so the panel never
  // has to guess what the file now says.
  if (action === 'permissions-list') {
    const policy = loadPermissions();
    return NextResponse.json({
      tools: policy.tools,
      paths: policy.paths,
      seededTools: [...SEED_TOOL_NAMES],
    });
  }

  if (action === 'permissions-revoke') {
    const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
    if (!tool) return NextResponse.json({ error: 'permissions-revoke requires tool' }, { status: 400 });
    // The list MUST be read after the revoke: revokeTool() -> commit() ->
    // resetPermissionCache() swaps in a brand-new policy object, so a snapshot
    // taken before the call still carries the row we just removed and the
    // panel would re-render the very tool it just revoked.
    const revoked = revokeTool(tool);
    const policy = loadPermissions();
    return NextResponse.json({
      ok: true,
      revoked,
      tools: policy.tools,
      paths: policy.paths,
      seededTools: [...SEED_TOOL_NAMES],
    });
  }

  // ---- Prompt mode -------------------------------------------------------
  // `answer` and `context` actions (from InteractiveTerminal) are treated as
  // follow-up prompts to Apollo, prefixed with a context marker.
  if (action === 'prompt' || action === 'answer' || action === 'context') {
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'missing text' }, { status: 400 });
    }

    // #120 (PLANO-MASTER-1 B6c): the plan-walk gate answer — 's'/'n' typed
    // here resolves the SAME HITL gate the Pantheon toast shows (one state,
    // no bifurcation), and the approving turn WALKS the plan inline without
    // burning an LLM turn on the approval word.
    if (action === 'prompt' || action === 'answer') {
      const gateAnswer = resolvePlanWalkAnswer(text);
      if (gateAnswer) {
        return gateAnswerStream({
          resolution: gateAnswer,
          conversationId,
          action,
        });
      }
    }

    // Classify prompt before spawning opencode for dynamic-context routing.
    // Pure heuristic classifier — no LLM call, runs in microseconds.
    // #63: warm-session continuation turns inherit god/class/budget from
    // the conversation's prior classification; cold sessions, explicit
    // redirects (structured godId=/god: or free-text "com Athena") and
    // explicit new-task markers re-classify. PetLove F3 evidence: the
    // approval turn "Recomendação sua pode seguir - nome PetLove" was
    // misrouted devops·simple→prometheus by fresh classification.
    const promptText = action === 'answer'
      ? `[User answer to your question] ${text}`
      : action === 'context'
        ? `[Additional context from user] ${text}`
        : text;
    const classification = classifyTurnWithInheritance(action, text, priorClassification);
    rememberConversationClassification(conversationId, classification);
    const classificationEnv = serializeClassification(classification);
    // Issue #51: caller-declared unattended run (probes / batch harnesses /
    // scheduled jobs). The classifier still sees the RAW prompt so routing
    // semantics do not shift between attended and unattended runs of the
    // same task; the directive is prepended only to the spawned run text.
    // #51: caller-declared unattended run. #64 (BATCH 13): an explicit
    // no-questions intent in the prompt text is honored at PARITY — the
    // campaign proved the text alone is not enough; the directive is.
    // #51: caller-declared unattended run (probes / batch harnesses /
    // scheduled jobs). The classifier still sees the RAW prompt so routing
    // semantics do not shift between attended and unattended runs of the
    // same task; the directive is prepended only to the spawned run text.
    // #64 (BATCH 13): an explicit no-questions intent in the prompt text is
    // honored at PARITY — the campaign proved the text alone is not enough
    // to suppress the brainstorming gate; the directive is.
    const unattended = action === 'prompt' && (body.unattended === true || noQuestionsIntent(text));
    // Issue #54: in-band classification marker. The classification event
    // (below) and the plugin-side dispatch writers share this id — the
    // agreement metric gets an exact join key instead of ts-proximity.
    // In-band because the warm opencode serve is a shared, already-running
    // process that per-request env (OLYMPUS_TASK_CLASSIFICATION) cannot
    // reach; the env payload still carries the id for one-shot spawns.
    // Issue #54: in-band classification marker. The classification event
    // (below) and the plugin-side dispatch writers share this id — the
    // agreement metric gets an exact join key instead of ts-proximity.
    // In-band because the warm opencode serve is a shared, already-running
    // process that per-request env (OLYMPUS_TASK_CLASSIFICATION) cannot
    // reach; the env payload still carries the id for one-shot spawns.
    // #65 (BATCH 13): the OLYMPUS-SESSION marker carries the conversationId —
    // the stable key for the decision-checkpoint file
    // (.olympus/sessions/<conversationId>.decisions.md). It rides ALL turn
    // types (approval decisions land on answer turns — PetLove FC-5 had six
    // successful turns and zero persisted state); the classification marker
    // stays prompt-only.
    const sessionMarker = `[OLYMPUS-SESSION ${conversationId}] `;
    const classificationMarker = action === 'prompt'
      ? `[OLYMPUS-CLASSIFICATION id=${classification.classificationId} routeTo=${classification.routeTo}] `
      : '';
    // R-C: appendActivity for prompt (not answer/context) — durable run-start audit.
    if (action === 'prompt') {
      appendActivity({
        god: 'system',
        action: 'classification',
        msg: classification.reason,
        meta: {
          classificationId: classification.classificationId,
          domain: classification.domain,
          complexity: classification.complexity,
          routeTo: classification.routeTo,
          estimatedTokens: classification.estimatedTokens,
          needsPlanning: classification.needsPlanning,
        },
      });
    }

    // #110 (FLUENCY-1): the autonomous first-prompt intake — OLYMPUS opens
    // with NO folder selected; the prompt decides: new | existing:<slug> |
    // ask. Deterministic + non-blocking: a failed intake never breaks the
    // run (the stage result rides the stream as a log event).
    let intentStage: { slug?: string; kind?: string; message: string } | undefined;
    if (classification.complexity !== 'trivial') {
      // #U2 (UAT-2-FIX): the CONVERSATION CONTINUITY — a follow-up turn in
      // a conversation that already created/routed a project inherits it;
      // never derive a NEW project from a control/meta message (the user's
      // specimen: "Perfeito, só me retorne quando finalizar" became the
      // project 'perfeito-retorne-quando-finalizar' at the 16:59 turn).
      const convoProject = getConversationProject(conversationId);
      if (convoProject && !isNewTaskMarker(text)) {
        intentStage = { slug: convoProject, kind: 'existing', message: `Routed to the conversation's project '${convoProject}' (continuity — a follow-up turn never forks a new project)` };
        rememberConversationProject(conversationId, convoProject);
      } else {
        try {
          // #178: the upload manifest is transport metadata — never let it
          // name the project ('AIME Uploaded Files AIME').
          const intent = await resolveAndRegisterIntent(stripUploadBlock(promptText), classification.stack ?? []);
          intentStage = { slug: intent.slug, kind: intent.kind, message: intent.message };
          if (intent.slug) rememberConversationProject(conversationId, intent.slug);
        } catch (e) {
          intentStage = { message: `Intake stage failed (non-fatal): ${e instanceof Error ? e.message : String(e)}` };
        }
      }
    }

    // #U1 (UAT-2-FIX): THE LANE-ROOT PIN — the planner marker carries the
    // ABSOLUTE home path resolved from the intake, so the plan lands in
    // the vault home, never the warm session's cwd (the 16:29 specimen:
    // Apollo wrote the scaffold + dispatch-plan.json to the WORKSPACE
    // because the marker said "the project lane root" and his cwd WAS
    // the workspace).
    const intentLaneRoot = intentStage?.slug
      ? reconcileProjectPath(intentStage.slug)?.path ?? null
      : null;
    // W-A RAG-CERT A3: the planner RAG — the campaign prompt's style words
    // retrieve the vault's prior assets BEFORE the plan ("style of my
    // previous assets" as a planning input). composePlannerRag previously
    // existed with zero callers (dead code); it now rides the planner turn.
    // Non-fatal by contract: the RAG never breaks the plan.
    const plannerRagBlock = action === 'prompt' && classification.needsPlanning
      ? await composePlannerRag(promptText).catch(() => '')
      : '';
    const plannerMarker = action === 'prompt' && classification.needsPlanning
      ? `[OLYMPUS-PLANNER] This task is architectural/complex. Your deliverable for this turn is THE PLAN, not monolithic code: write dispatch-plan.json${intentLaneRoot ? ` to THIS ABSOLUTE PATH: ${intentLaneRoot}/dispatch-plan.json — at that exact path, NEVER the session cwd or any workspace lane` : ' to the project lane root'} — a DAG of small hops. NEVER write code files yourself — the plan IS your deliverable. The HOP RUNTIME is the ONLY execution engine: it dispatches each hop to the hop's god on the god's model lane. If the walk is parked, the user's next prompt resumes it in the post-run — you do NOT need to (and MUST NOT) execute hops, write component code, or dispatch the plan to Atlas. THE CONTRACT IS INLINE (a minimal canonical plan — do NOT open any source to learn it): {"version":1,"laneRoot":"${intentLaneRoot ?? '<the ABSOLUTE path of this project lane root>'}","hops":[{"id":"shell","god":"hephaestus","prompt":"<the spec SLICE + the DESIGN DIRECTIVES slice for this hop>","artifacts":["app/layout.tsx"],"verify":{"review":"deterministic","checks":["file-exists:app/layout.tsx"]},"budgetTokens":8192},{"id":"landing","god":"athena","prompt":"<its own slice + the design tokens>","artifacts":["app/page.tsx"],"verify":{"review":"deterministic","checks":["file-exists:app/page.tsx"]},"budgetTokens":8192,"after":["shell"]}]} — the hard rules: version is exactly 1; hop ids unique; one god per hop; artifacts are real deliverable paths relative to the laneRoot; after-edges must stay acyclic; budgetTokens at most 16384 (8192 is the sane default); verify.review is "deterministic" with checks like file-exists:<path>. The hop runtime walks the plan: per-hop dispatch on the god\'s own model lane (concurrency at most 3), deterministic verify (0 tokens), park-on-exhaustion with resume. Sessions are lanes; the disk carries the campaign. HARD RULE: hop prompts must NEVER instruct deletion or cleanup of the lane's runtime files (.opencode, opencode.json, opencode.demigods.json, dispatch-plan.json, .olympus-*, project.md, _handoff.md, _delegations) — residue cleanup is the runtime's post-campaign job (the 10:16 specimen: a build-fix god deleted the machinery mid-walk and killed the campaign). STRICT JSON: the file must parse with JSON.parse on the first try — inside string values NEVER write raw line breaks or control characters (escape them as \\n); a 'Bad control character' parse error refuses the whole walk (the 23:32 specimen). USE THE WRITE TOOL to create the file — a chat-text plan is NOT a delivery: the post-run reads the FILE (it may HARVEST your narrated text as a fallback, but the write tool is the contract). YOUR FILE TOOLS ARE DIRECT: write/read/bash/edit are direct tools in your toolset — they are NEVER in the Code Mode catalog, and the catalog search will NOT find them; that is expected, not a gap. When you need to write dispatch-plan.json, call the write tool DIRECTLY — never report yourself blocked over file creation. `
      : '';
    // W-J UI-REFERENCES: the curated component inspiration rides the design
    // marker (bounded — the gods draw from REAL patterns, never invent
    // generic layouts; the full catalog lives in the Craft Apps pane).
    const uiReferencesBlock = action === 'prompt' && classification.needsPlanning
      ? `\n${UI_REFERENCES_MARKER_BLOCK}\n`
      : '';
    // #DESIGN-INTELLIGENCE D1: the [OLYMPUS-DESIGN] marker — the visual
    // quality directives that make the output DESIGNED, not AI-slop.
    // Every plan MUST reference these in its hop prompts so all hops
    // build against the same design contract.
    const designMarker = action === 'prompt' && classification.needsPlanning
      ? `${(promptText.match(/[ãâêôõçáéíóúà]/i) ? '[CULTURAL CONTEXT] PT-BR detected: ALL fixtures, names, companies, copy, and UI text must be Brazilian — Brazilian names (Mariana Oliveira, Rafael Santos, Patrícia Nogueira, etc.), Brazilian companies, R$ currency, pt-BR throughout. Never generic international names.' : '[CULTURAL CONTEXT] Match the prompt\'s language and cultural context in all fixtures, names, companies, and copy.')}
[OLYMPUS-DESIGN] The design directives — EVERY hop prompt MUST reference these. They are LAW for the visual output:
Typography: import a DISTINCTIVE font via next/font (NOT Inter, NOT system-ui — choose: Space Grotesk, DM Sans, Manrope, Outfit, or a font fitting the project's personality). Set it in layout.tsx.
Color: the accent color is THE brand. Define it as a CSS custom property in globals.css. Use it BOLDLY on CTAs, active states, highlights — and SPARINGLY (max 10% of visible surface). Never a second accent.
Dark theme: create DEPTH with 3+ layers of elevation (bg < surface < elevated) via CSS custom properties, not flat zinc-800/zinc-900 everywhere. Each layer must be visually distinguishable.
Spacing: sections get py-20 minimum. Cards get p-6 minimum. Whitespace IS the design — generous, not cramped.
Components: design with PERSONALITY. Each component must have at least ONE distinctive detail (a gradient, a unique border treatment, a custom hover state, a distinctive shadow). Generic shadcn/card clones are FORBIDDEN.
Assets: for logos, icons, and illustrations — create a simple inline SVG or CSS-based logo mark. If the project needs a vector logo, include a hop that creates it as an SVG.
Deliverables: the project root must contain ONLY deliverable files. No planning artifacts (dispatch-plan.json, .olympus-* files, opencode.json, .opencode) inside the project — the machine cleans these after the walk. Add a .gitignore that excludes any worklog/ or .olympus-* files.
Design review: include a design-review hop as the SECOND-TO-LAST hop (god: athena, artifacts: ["design-review.json"], budgetTokens: 4096). Its prompt must tell the god to: (1) run \`node scripts/extract-page-styles.mjs <preview-url> <project-root>\` to get the REAL visual data (fonts, colors, spacing, slop signals, component quality signals — extracted from the served page, not from source alone). (2) Read the key component files. (3) Rate each dimension 0-10 (typography, color, spacing, components, hierarchy, darkTheme, content, motion). (4) Write design-review.json with {"scores":{...},"overall":N,"issues":[...],"fixInstructions":[...]}. The verify check: design-score:7.
${uiReferencesBlock}`
      : '';
    const runText = unattended
      ? UNATTENDED_DIRECTIVE + sessionMarker + classificationMarker + promptText + (plannerRagBlock ? `\n\n${plannerRagBlock}` : '') + plannerMarker + designMarker
      : sessionMarker + classificationMarker + promptText + (plannerRagBlock ? `\n\n${plannerRagBlock}` : '') + plannerMarker + designMarker;

    return streamWarm(req, {
      conversationId,
      text: runText,
      agent: 'apollo',
      extraEnv: unattended
        ? { OLYMPUS_TASK_CLASSIFICATION: classificationEnv, OLYMPUS_UNATTENDED: '1' }
        : { OLYMPUS_TASK_CLASSIFICATION: classificationEnv },
      meta: { action, node: undefined, cli: `opencode run --format json --agent apollo <text>` },
      classification,
      intent: intentStage,
    });
  }

  // ---- New-session mode -------------------------------------------------
  // When the client sends a conversation summary via "New Session",
  // wrap it in a handoff prompt and continue on a FRESH opencode session
  // (the client rotates conversationId) with a clean context window but
  // carrying forward the previous session's context.
  if (action === 'new-session') {
    const summary = (typeof text === 'string' ? text : '').trim();
    if (!summary) {
      return NextResponse.json(
        { error: 'missing conversation summary (text)' },
        { status: 400 },
      );
    }

    // The handoff prompt is deliberately terse — Apollo is a smart agent
    // and doesn't need a verbose preamble. We tell it:
    //   1. This is a fresh session (new context window).
    //   2. Here's what we were just working on.
    //   3. Pick up where we left off — don't re-introduce, don't restart.
    //   4. Summary boundaries are explicit (---) so Apollo can't confuse
    //      them with its own output.
    const handoffPrompt = [
      'Starting a new session. The previous session\'s context window was filling up,',
      'so I\'m continuing the conversation here with a summary of where we left off.',
      '',
      '--- BEGIN SUMMARY OF PREVIOUS CONVERSATION ---',
      summary,
      '--- END SUMMARY OF PREVIOUS CONVERSATION ---',
      '',
      'Continue from where we left off. Pick up the thread naturally — do NOT restart',
      'the conversation, do NOT re-introduce yourself, and do NOT re-ask questions',
      'that were already answered in the summary. Treat the summary as your context',
      'and proceed with the next concrete step toward the user\'s goal.',
    ].join('\n');

    // Classify the handoff so the dynamic-context plugin routes the right
    // instincts in. We pass the summary through the classifier — if the
    // previous task was, say, a refactor, the new session keeps the same
    // instinct filtering.
    const classification = classifyTask(handoffPrompt);
    const classificationEnv = serializeClassification(classification);

    // R-C: appendActivity for new-session — durable run-start audit.
    appendActivity({
      god: 'system',
      action: 'classification',
      msg: classification.reason,
      meta: {
        domain: classification.domain,
        complexity: classification.complexity,
        routeTo: classification.routeTo,
        estimatedTokens: classification.estimatedTokens,
        needsPlanning: classification.needsPlanning,
      },
    });

    return streamWarm(req, {
      conversationId,
      text: handoffPrompt,
      agent: 'apollo',
      extraEnv: {
        OLYMPUS_TASK_CLASSIFICATION: classificationEnv,
        // Hint to the OLYMPUS overlay that this is a handoff — the
        // experimental.session.compacting hook can use this to tweak the
        // compaction prompt if it wants.
        OLYMPUS_NEW_SESSION: '1',
      },
      meta: { action, node: undefined, cli: `opencode run --format json --agent apollo <handoff>` },
      classification,
    });
  }

  // ---- True-reset mode ---------------------------------------------------
  // "New session" must genuinely RESET the context window. The 'new-session'
  // branch above cannot do that: it reuses the live warm serve (ensureServer
  // is a no-op while one is alive) and injects a transcript summary as the
  // first message, so the "fresh" session starts out holding the entire
  // previous conversation. Measured: 53% → 82% after one click.
  //
  // A real reset means tearing the serve down. opencode keeps session state
  // in the serve process (RAM + its SQLite store), so only a new process
  // gives a genuinely empty window. cleanupServer() kills the child, drops
  // the PID file and nulls the cached serverPromise; the following
  // ensureServer() therefore cold-starts a brand-new serve on the next free
  // port and logs "OpenCode server ready on port N (pid M)".
  //
  // Project registration lives in ~/.olympus (not in the serve), so it
  // survives untouched — as do the vault, permissions and instincts.
  if (action === 'reset-session') {
    try {
      cleanupServer();
      const server = await ensureServer();
      // Issue #21: drop the pre-reset conversation's session mapping. Its
      // `opencode serve` was just killed by cleanupServer(), so the entry is a
      // dangling reference — leaving it behind means a later context lookup on
      // that conversationId still reports the pre-reset percentage of a
      // session that no longer exists. The client sends the OLD id, captured
      // before it rotated to a fresh one.
      const forgotten = forgetConversation(body.conversationId || '');
      console.log(
        `[olympus-action] reset-session: fresh OpenCode server on port ${server.port} (warm=${server.warm}, pruned_stale_mapping=${forgotten})`,
      );
      return NextResponse.json({
        ok: true,
        port: server.port,
        warm: server.warm,
        authed: server.authed,
        prunedStaleMapping: forgotten,
      });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message || 'reset-session failed' },
        { status: 500 },
      );
    }
  }

  // ---- Context-menu action mode -----------------------------------------
  const valid = ['evolve', 'archive', 'promote', 'contradiction', 'lineage', 'prune', 'stocktake'];
  if (!valid.includes(action)) {
    return NextResponse.json({ error: `invalid action: ${action}` }, { status: 400 });
  }

  // Map the 7 UI actions to real Olympus commands.
  // Lifecycle actions go to Callimachus; status actions go to instinct-status.
  const cliArgs: Record<string, string[]> = {
    archive:                       ['/callimachus-heartbeat', '--deep'],
    evolve:                        ['/callimachus-heartbeat'],
    promote:                       ['/callimachus-heartbeat'],
    contradiction:                 ['/callimachus-heartbeat'],
    prune:                         ['/callimachus-heartbeat'],
    lineage:                       ['/instinct-status'],
    stocktake:                     ['/instinct-status'],
  };
  const args = cliArgs[action] || ['/instinct-status'];

  const child = spawnOpencode(
    ['run', '--format', 'json', ...args, '--agent', 'callimachus'],
    {
      // #104 (the complete class, SERVE-1 Batch C): the bookkeeping lanes
      // run in the workspace lane — never the repo root.
      cwd: resolveDispatchCwd(),
      extraEnv: { OLYMPUS_ACTION_NODE: node?.name || '' },
    },
  );

  return streamChild(child, { action, node: node?.name, cli: `opencode run ${args.join(' ')}` }, req);
}

// ---------------------------------------------------------------------------
// Shared opencode JSONL parsing
// ---------------------------------------------------------------------------

interface LineHandler {
  onLine: (line: string) => void;
  onStderr: (text: string) => void;
  getStderr: () => string;
  receivedOutput: boolean;
}

/**
 * Parse `opencode run --format json` output into UI events, mirroring the
 * opencode 1.18 event vocabulary (step_start / text / step_finish /
 * tool.call / tool.response / error). Shared by the one-shot streamChild
 * path and the warm-path fallback.
 */
function makeOpenCodeLineHandler(send: (ev: any) => void): LineHandler {
  const stderrBuf: string[] = [];
  let receivedOutput = false;

  const onLine = (line: string) => {
    const t = line.trim();
    if (!t) return;
    receivedOutput = true;
    // Try to parse as JSON (opencode --format json emits JSON lines).
    if (t.startsWith('{')) {
      try {
        const parsed = JSON.parse(t);
        // Surface opencode errors with a clear message.
        // opencode emits { type: 'error', error: { message, ... } }
        // or { error: { message, ... } } on API failures.
        if (parsed.type === 'error' || (parsed.error && !parsed.type)) {
          const errMsg = typeof parsed.error === 'string'
            ? parsed.error
            : parsed.error?.message || parsed.error?.name || JSON.stringify(parsed.error);
          send({ type: 'error', msg: `OpenCode error: ${errMsg}`, raw: parsed, ts: new Date().toISOString() });
          return;
        }
        // Forward other JSON events as-is.
        send(parsed);
        return;
      } catch {
        // Not valid JSON — fall through to log.
      }
    }
    send({ type: 'log', msg: t });
  };

  const onStderr = (text: string) => {
    receivedOutput = true;
    stderrBuf.push(text);
    const trimmed = text.trim();
    if (trimmed) send({ type: 'log', msg: trimmed, level: 'stderr' });
  };

  return {
    onLine,
    onStderr,
    getStderr: () => stderrBuf.join(''),
    get receivedOutput() { return receivedOutput; },
  };
}

/**
 * Shared SSE-streaming helper for spawned CLI children (context-menu actions).
 *
 * Features:
 *   1. Startup timeout — kills if no output within STARTUP_TIMEOUT_MS.
 *   2. Max runtime — kills after MAX_RUNTIME_MS.
 *   3. stderr/error surfacing — detects opencode JSON errors.
 *   4. JSON event parsing — parses and forwards `--format json` output.
 */
function streamChild(
  child: ChildProcess,
  meta: { action: string; node?: string; cli: string },
  req: NextRequest,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let killed = false;

      const send = (obj: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
      };

      const killChild = (reason: string) => {
        if (killed) return;
        killed = true;
        try { child.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
        if (!closed) {
          send({ type: 'error', msg: reason, ts: new Date().toISOString() });
          send({ type: 'action_done', action: meta.action, node: meta.node, code: -1, ts: new Date().toISOString() });
          try { controller.close(); } catch {}
          closed = true;
        }
      };

      send({ type: 'action_start', action: meta.action, node: meta.node, cli: meta.cli, ts: new Date().toISOString() });
      send({ type: 'log', msg: 'Starting OpenCode (this may take 5-10 seconds for the cold start)...', ts: new Date().toISOString() });

      const handler = makeOpenCodeLineHandler(send);
      const lineBuf: string[] = [];

      // Startup timeout — if no output within STARTUP_TIMEOUT_MS, kill + error.
      const startupTimer = setTimeout(() => {
        if (!handler.receivedOutput) {
          killChild(
            `OpenCode produced no output within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
            `This usually means: (1) the OPENCODE_GO_API_KEY / provider key is invalid or expired, ` +
            `(2) a free-tier endpoint (OpenRouter/Groq) is rate-limited — free models share a pool and ` +
            `can 429 during peak hours, so wait a minute and retry, or (3) the network is down. ` +
            `Check your keys in OpenCode (olympus opencode → Settings → Providers) and re-run ` +
            `npm run install-opencode -- --update if needed.`
          );
        }
      }, STARTUP_TIMEOUT_MS);

      // Max runtime — kill after MAX_RUNTIME_MS regardless.
      const maxRuntimeTimer = setTimeout(() => {
        killChild(`OpenCode exceeded the maximum runtime of ${MAX_RUNTIME_MS / 60000} minutes.`);
      }, MAX_RUNTIME_MS);

      child.stdout?.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        lineBuf.push(...lines);
        while (lineBuf.length > 1) handler.onLine(lineBuf.shift()!);
      });

      child.stderr?.on('data', (chunk) => {
        handler.onStderr(chunk.toString());
      });

      child.on('close', (code) => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        if (lineBuf.length) handler.onLine(lineBuf.shift()!);
        if (code !== 0 && handler.getStderr().length > 0 && !handler.receivedOutput) {
          const stderrText = handler.getStderr().trim();
          if (stderrText) {
            send({ type: 'error', msg: `OpenCode failed: ${stderrText.slice(0, 500)}`, ts: new Date().toISOString() });
          }
        }
        send({ type: 'action_done', action: meta.action, node: meta.node, code, ts: new Date().toISOString() });
        try { controller.close(); } catch {}
        closed = true;
      });

      child.on('error', (err: any) => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        send({ type: 'error', msg: `spawn error: ${err.message}`, ts: new Date().toISOString() });
        send({ type: 'action_done', action: meta.action, node: meta.node, code: -1, ts: new Date().toISOString() });
        try { controller.close(); } catch {}
        closed = true;
      });

      req.signal.addEventListener('abort', () => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        closed = true;
        try { child.kill('SIGTERM'); } catch {}
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ---------------------------------------------------------------------------
// Warm-session SSE streaming (prompt / answer / context / new-session)
// ---------------------------------------------------------------------------

interface WarmStreamOptions {
  conversationId: string;
  text: string;
  agent: string;
  extraEnv?: Record<string, string>;
  meta: { action: string; node?: string; cli: string };
  classification?: TaskClassification;
  /** #110: the autonomous intake stage result — emitted as a log event and
   *  used to fire the dev-server trigger after a successful frontend run. */
  intent?: { slug?: string; kind?: string; message: string };
}

/**
 * Stream a conversation message through the warm opencode session.
 *
 * Flow:
 *   1. Send action_start.
 *   2. ensureServer() — the only cold start; if it fails, fall back to a
 *      one-shot `opencode run` (no session id — the server never came up).
 *   3. getOrCreateSession(conversationId) — reuses the conversation's
 *      opencode session (context retained).
 *   4. runWarmMessage() — maps the server's live event feed to UI events.
 *      If the run failed BEFORE any event was delivered and the message was
 *      never posted, fall back to one-shot with `--session <id>` (context
 *      still retained).
 *   5. action_done.
 */
/**
 * #120 (PLANO-MASTER-1 B6c): the gate-answer mini stream — resolve the
 * plan-walk gate (already resolved by resolvePlanWalkAnswer; this stream
 * NARRATES + walks) without an LLM turn. Approve -> the walk runs inline
 * (the hop events + the honest summary stream as usual); abort -> the
 * honest abort line. The action_done closes the turn.
 */
function gateAnswerStream(opts: {
  resolution: { gateId: string; decision: 'approve' | 'abort'; planPath: string; approvalPrompt: string };
  conversationId: string;
  action: string;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (ev: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`)); } catch { closed = true; }
      };
      const finish = () => { if (closed) return; try { controller.close(); } catch {} closed = true; };
      try {
        if (opts.resolution.decision === 'approve' && opts.resolution.planPath) {
          const laneRoot = dirname(opts.resolution.planPath);
          const slug = basename(laneRoot);
          send({ type: 'log', msg: `Plan walk approved (gate ${opts.resolution.gateId}) — walking ${slug} now.`, ts: new Date().toISOString() });
          await maybeWalkThePlan({ slug, laneRoot, send, sessionId: opts.conversationId, publishActivity: true });
        } else {
          send({ type: 'log', msg: `Plan walk ABORTED (gate ${opts.resolution.gateId}) — the plan stays on disk; ask for a replan to start over.`, ts: new Date().toISOString() });
        }
        send({ type: 'action_done', action: opts.action, node: undefined, code: 0, ts: new Date().toISOString() });
      } catch (e: any) {
        send({ type: 'log', msg: `Gate resolution failed (non-fatal): ${e?.message || String(e)}`, ts: new Date().toISOString() });
        send({ type: 'action_done', action: opts.action, node: undefined, code: 1, ts: new Date().toISOString() });
      }
      finish();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

function streamWarm(req: NextRequest, opts: WarmStreamOptions) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let firstEventAt: number | null = null;
      // W-U PLAN-HARVEST: the warm stall holder (the errSessionId precedent — declared
      // before finish() to keep the block-scoped order legal).
      let warmStallTimer: ReturnType<typeof setInterval> | null = null;
      // W-U: the planner's turn text buffer (harvested when the write never lands).
      let turnTextBuf = '';

      const send = (obj: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
      };

      const finish = (code: number) => {
        if (closed) return;
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        if (warmStallTimer) clearInterval(warmStallTimer);
        send({ type: 'action_done', action: opts.meta.action, node: opts.meta.node, code, ts: new Date().toISOString() });
        try { controller.close(); } catch {}
        closed = true;
      };

      // W-N WARM-STALL (the 2026-10-21 13:21 specimen — the 15-minute silent
      // death): the warm lane had ONLY the startup timer (defeated the
      // moment any internal log line lands) and the max-runtime ceiling. A
      // turn posted to a dead free endpoint (the #129 free-anchor stall
      // class) streamed NOTHING for the full 15 minutes and died with a
      // ceiling message that named no cause. The warm-stall watchdog is the
      // route-level bound the session layer's own stall-kill already
      // enforces server-side: zero REAL turn activity for
      // OLYMPUS_WARM_STALL_MS → the loud diagnosis + the honest early end.
      // "Real" excludes OLYMPUS's own pre-post narration (the exact lines
      // that defeat the startup timer) — everything server-side counts,
      // including the session layer's stall/child/permission narrations
      // (every heartbeat re-stamps: a LIVE wait never trips this bound).
      let lastTurnAt = Date.now();
      const WARM_STALL_MS = Number(process.env.OLYMPUS_WARM_STALL_MS || 180_000);
      const INTERNAL_LOG_PREFIXES = [
        '▶', 'Starting OpenCode', 'Pre-flight', 'classified:', 'Created project',
        'Routed to', 'Routing to', 'Falling back', 'One-shot re-attempt', 'Gate resolution',
      ];
      warmStallTimer = setInterval(() => {
        if (closed) return;
        if (Date.now() - lastTurnAt < WARM_STALL_MS) return;
        fail(
          `The model lane stalled — zero turn activity for ${Math.round(WARM_STALL_MS / 1000)}s ` +
          `(the #129 free-anchor stall class: the provider accepted the turn and never streamed). ` +
          `Resend the prompt (the warm session and its context are preserved) or switch the free ` +
          `strategy in Settings (free-openrouter fails loudly; a dead lane re-tries the same death).`
        );
      }, 15_000);

      // W-N LANE-PROBE: one token asked of the active lane BEFORE the real
      // turn posts — fire-and-forget (zero latency added to a healthy lane);
      // a lane that cannot answer "ping" in the probe window gets named in
      // seconds, not discovered after the ceiling.
      void probeLane().then((r) => {
        if (closed || !r) return;
        if (!r.ok) {
          send({
            type: 'log',
            msg: `⚠ Pre-flight: the active lane ${r.model} did not answer a 1-token probe (${r.error ?? 'no response'}; ${r.latencyMs}ms) — the free-anchor stall class (#129). The turn may hang; if it stalls, resend or switch the free strategy in Settings.`,
            ts: new Date().toISOString(),
          });
        }
      });

      // Issue #35: sessionId lands here once known; fail() may fire before
      // that (startup timeout), so hold it in a pre-declared holder (no TDZ).
      let errSessionId: string | null = null;
      const fail = (msg: string) => {
        if (closed) return;
        if (errSessionId) {
          try { markSessionError(errSessionId); } catch {}
        }
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        send({ type: 'error', msg, ts: new Date().toISOString() });
        finish(-1);
      };

      // Startup timeout — if no output within STARTUP_TIMEOUT_MS, kill + error.
      const startupTimer = setTimeout(() => {
        if (firstEventAt === null) {
          fail(
            `OpenCode produced no output within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
            `This usually means: (1) a provider key is invalid or expired, ` +
            `(2) a free-tier endpoint (OpenRouter/Groq) is rate-limited — free models share a pool and ` +
            `can 429 during peak hours, so wait a minute and retry, or (3) the network is down. ` +
            `Check your keys in OpenCode (olympus opencode → Settings → Providers) and re-run ` +
            `npm run install-opencode -- --update if needed.`
          );
        }
      }, STARTUP_TIMEOUT_MS);

      const maxRuntimeTimer = setTimeout(() => {
        fail(`OpenCode exceeded the maximum runtime of ${MAX_RUNTIME_MS / 60000} minutes.`);
      }, MAX_RUNTIME_MS);

      // onEvent wrapper — tracks first-event for the startup timeout and
      // routes events into the SSE stream.
      const onEvent = (ev: any) => {
        if (firstEventAt === null) firstEventAt = Date.now();
        // W-U PLAN-HARVEST: the turn's TEXT accumulates — when the free
        // planner NARRATES the plan instead of writing it, the post-run
        // harvests the JSON from this very buffer (the model's prose IS
        // the deliverable; the write-tool gap stops blocking the walk).
        if (ev?.type === 'text' && typeof ev?.part?.text === 'string') turnTextBuf += ev.part.text + '\n';
        // W-N WARM-STALL: only REAL turn activity re-stamps the clock —
        // OLYMPUS's own pre-post narration (the lines that defeat the
        // startup timer) must not defeat the stall bound too. Everything
        // server-side counts, including the session layer's stall/child
        // narrations (a LIVE wait re-stamps every heartbeat).
        const isInternal =
          ev?.type === 'action_start' || ev?.type === 'classification' ||
          (ev?.type === 'log' && INTERNAL_LOG_PREFIXES.some((p) => String(ev.msg || '').startsWith(p)));
        if (!isInternal) lastTurnAt = Date.now();
        // W-D7 (v0.0.6 MISSION-CONTROL-TRUE): the TODO EMITTER — the god's
        // todowrite calls feed the Plan panel (plan-panel.tsx shipped with a
        // full normalizer and NO emitter; this is the missing half). The
        // bulk shape fills the panel in one pass per write.
        if (ev?.type === 'tool.call' && ev?.tool?.name === 'todowrite') {
          try {
            const todos = ev?.tool?.input?.todos;
            if (Array.isArray(todos) && todos.length > 0) {
              const rows = todos.map((t: any) => ({
                content: String(t?.content ?? t?.activeForm ?? ''),
                status: String(t?.status ?? 'pending'),
              })).filter((t: { content: string }) => t.content);
              if (rows.length > 0) {
                send({ type: 'todo', god: opts.agent ?? 'apollo', todos: rows, ts: new Date().toISOString() });
              }
            }
          } catch { /* the todo emitter never breaks the stream */ }
        }
        send(ev);
      };

      // One-shot fallback: spawn `opencode run --format json` and stream it.
      const fallbackOneShot = (sessionId?: string, attempt: number = 0) => {
        // Prepend the authoritative strategy block (same as the warm path) so
        // the model never infers the strategy from model IDs.
        const text = `${buildStrategyContextBlock()}\n\n${opts.text}`;
        const args = [
          'run', '--format', 'json',
          ...(sessionId ? ['--session', sessionId] : []),
          '--agent', opts.agent,
          text,
        ];
        if (attempt > 0) {
          send({ type: 'log', msg: `One-shot re-attempt ${attempt} (the #91 lane cover — the nudge/class retry fires at most once).`, ts: new Date().toISOString() });
        } else {
          send({ type: 'log', msg: `Falling back to one-shot: opencode ${args.join(' ').slice(0, 120)}…`, ts: new Date().toISOString() });
        }
        // #104 (the complete class, SERVE-1 Batch C): the one-shot fallback
        // matches the warm serve's context — the workspace lane, never the
        // repo root (the old default cwd).
        const child = spawnOpencode(args, { cwd: resolveDispatchCwd(), extraEnv: opts.extraEnv });
        // Issue #58: route one-shot output through the SAME onEvent wrapper
        // the warm path uses, so firstEventAt is set on the first streamed
        // line and the 120s startup timer becomes a true no-OUTPUT bound.
        // Previously this passed `send` directly — firstEventAt stayed null
        // and the timer killed one-shot runs mid-output (12b probes B1/B2
        // died at exactly 120s while the process was streaming).
        // #91 (HIGIENIA-2 H3a): the stall watchdog state rides the same
        // wrapper — lastOutputAt for the silence clock, permissionPending
        // for the S3 override (a pending permission ask is NOT a stall).
        let lastOutputAt = Date.now();
        let permissionPending = false;
        const handler = makeOpenCodeLineHandler((ev: any) => {
          if (ev?.type === 'permission_ask') permissionPending = true;
          else if (ev?.type === 'permission_replied') permissionPending = false;
          onEvent(ev);
        });
        // #91 (HIGIENIA-2 H3a): the ONE-SHOT WATCHDOG — the S3 decision
        // function (the warm path's own machinery) consulted on the
        // fallback's stream: silence past stallMs (no permission pending)
        // = nudge-abort — the child is killed and ONE re-attempt fires (the
        // S3 parity: the nudge fires exactly once). The 15s tick matches
        // the warm watchdog's cadence.
        let nudged = false;
        const stallTimer = setInterval(() => {
          if (closed) return;
          const decision = watchdogDecision({
            silentForMs: Date.now() - lastOutputAt,
            warnMs: 60_000,
            stallMs: 150_000,
            permissionPending,
          });
          if (decision === 'nudge-abort' && !nudged && attempt === 0) {
            nudged = true;
            send({ type: 'log', msg: 'One-shot stalled mid-stream (150s silent) — nudge-abort, re-attempting once.', ts: new Date().toISOString() });
            try { child.kill('SIGTERM'); } catch { /* already gone */ }
          }
        }, 15_000);
        const lineBuf: string[] = [];
        child.stdout?.on('data', (chunk) => {
          lastOutputAt = Date.now();
          lineBuf.push(...chunk.toString().split('\n'));
          while (lineBuf.length > 1) handler.onLine(lineBuf.shift()!);
        });
        child.stderr?.on('data', (chunk) => { lastOutputAt = Date.now(); handler.onStderr(chunk.toString()); });
        child.on('close', (code) => {
          clearInterval(stallTimer);
          if (lineBuf.length) handler.onLine(lineBuf.shift()!);
          // W-O ORPHAN-CURE (the 16:04 specimen): the nudge re-attempt fires
          // REGARDLESS of receivedOutput — the stall hit MID-STREAM (output
          // seen, then 150s silent), and the old !receivedOutput gate skipped
          // the promised re-attempt: "re-attempting once" was a lie and the
          // task died at exit 130. attempt===0 keeps it exactly once.
          if (code !== 0 && attempt === 0 && nudged) {
            send({ type: 'log', msg: 'One-shot nudge path — one re-attempt (mid-stream stall class).', ts: new Date().toISOString() });
            fallbackOneShot(sessionId, 1);
            return;
          }
          if (code !== 0 && !handler.receivedOutput) {
            // #91 (HIGIENIA-2 H3a): the fast-fail retry — a provider-error
            // class on the close (the #107 classification, one-shot-shaped)
            // re-attempts ONCE; anything else stays terminal (honest).
            if (attempt === 0) {
              const kind = classifyRetry({ code: code ?? -1, error: handler.getStderr().slice(-2000), statusCode: undefined } as never);
              if (kind) {
                send({ type: 'log', msg: `One-shot ${kind} path — one re-attempt.`, ts: new Date().toISOString() });
                fallbackOneShot(sessionId, 1);
                return;
              }
            }
            const stderrText = handler.getStderr().trim();
            if (stderrText) send({ type: 'error', msg: `OpenCode failed: ${stderrText.slice(0, 500)}`, ts: new Date().toISOString() });
          }
          finish(code ?? -1);
        });
        child.on('error', (err: any) => {
          clearInterval(stallTimer);
          fail(`spawn error: ${err.message}`);
        });
        req.signal.addEventListener('abort', () => {
          closed = true;
          clearInterval(stallTimer);
          try { child.kill('SIGTERM'); } catch {}
        });
      };

      (async () => {
        send({ type: 'action_start', action: opts.meta.action, node: opts.meta.node, cli: opts.meta.cli, ts: new Date().toISOString() });

        // Emit classification immediately after action_start — first thing the
        // user sees in the 66s window (R-A).
        if (opts.classification) {
          const c = opts.classification;
          send({
            type: 'classification',
            classification: c,
            ts: new Date().toISOString(),
          });
        }

        // #110: the autonomous intake stage — the created/routed/ask message
        // is visible in the session before any dispatch.
        if (opts.intent) {
          if (opts.intent.slug) {
            // #113 (PLANO-MASTER-1 B2): the TYPED panel event — the client
            // refreshes the project list + the active pointer on it (the
            // intake already set the pointer server-side; the panel was
            // mount-once blind, the B1 verdict (b) gap).
            send({ type: 'project_created', slug: opts.intent.slug, kind: opts.intent.kind ?? null, msg: opts.intent.message, ts: new Date().toISOString() });
          } else {
            send({ type: 'log', msg: opts.intent.message, ts: new Date().toISOString() });
          }
        }

        // 1. Warm server (only cold start). Failure → one-shot without session.
        let server;
        try {
          server = await ensureServer();
        } catch (err: any) {
          if (closed) return;
          send({ type: 'log', msg: `OpenCode server unavailable (${err?.message || 'unknown error'}) — using one-shot run.`, ts: new Date().toISOString() });
          fallbackOneShot(undefined);
          return;
        }
        if (closed) return;

        send({
          type: 'log',
          msg: server.warm
            ? 'Connected to the warm OpenCode session — no cold start, continuing the conversation.'
            : 'Starting OpenCode (cold start — this may take 5-10 seconds)...',
          ts: new Date().toISOString(),
        });

        // 2. Conversation → opencode session.
        let sessionId: string;
        try {
          sessionId = await getOrCreateSession(opts.conversationId);
        } catch (err: any) {
          if (closed) return;
          send({ type: 'log', msg: `Session setup failed (${err?.message || 'unknown error'}) — using one-shot run.`, ts: new Date().toISOString() });
          fallbackOneShot(undefined);
          return;
        }
        if (closed) return;
        errSessionId = sessionId;

        // 3. Run the message on the warm session.
        // W-T PLAN-FRESHNESS: the turn's start — the walk uses it to tell a
        // plan the turn WROTE from a stale one the turn only echoed about.
        const turnStartedAt = Date.now();
        const result = await runWarmMessage({
          sessionId,
          text: opts.text,
          agent: opts.agent,
          onEvent,
          signal: req.signal,
          maxRuntimeMs: MAX_RUNTIME_MS,
          // #62: class-scaled idle budget for the watchdog.
          complexity: opts.classification?.complexity ?? null,
        });
        if (closed) return;

        // #60 (BATCH 13): client-gone run bounded — emit the run_abandoned
        // telemetry to the activity feed (the SSE client is gone; the FEED is
        // the durable witness). meta carries the exact contract.
        if (result.abandoned) {
          try {
            appendActivity({
              god: 'system',
              action: 'run_abandoned',
              msg: `Run abandoned: client gone; server-side prompt aborted after ${result.abandoned.grace_ms}ms grace (session ${result.abandoned.session_id})`,
              meta: {
                session_id: result.abandoned.session_id,
                last_event_ts: result.abandoned.last_event_ts,
                grace_ms: result.abandoned.grace_ms,
              },
            });
          } catch {
            // Non-fatal: the feed write must never break the close path.
          }
        }

        if (result.code === 0) {
          // #110: a frontend artifact lands -> the deterministic dev-server
          // trigger (the #105 doctrine: probe evidence or the honest
          // refusal — never a narrated "running"). Non-fatal, bounded.
          // #117 (PLANO-MASTER-1 B3): THEN THE PLAN IS WALKED — the planner
          // turn emitted dispatch-plan.json; the walk runs here, inside the
          // stream, hops narrated live (concurrency <= 3, deterministic
          // verify, park-on-exhaustion with the resume contract printed).
          // A parked plan resumes on the next successful prompt in the
          // project (the state carries the campaign). Non-fatal both.
          if (opts.intent?.slug) {
            const laneRoot = reconcileProjectPath(opts.intent.slug)?.path ?? resolveDispatchCwd(opts.intent.slug);
            try {
              const t = await maybeStartDevServer(opts.intent.slug, laneRoot);
              send({
                type: 'log',
                msg: t.triggered
                  ? t.status?.url
                    ? `Live preview ready: ${t.status.url} — ${t.reason}`
                    : `Live preview: ${t.reason}`
                  : `Dev server: ${t.reason}`,
                ts: new Date().toISOString(),
              });
            } catch (e) {
              send({
                type: 'log',
                msg: `Dev-server trigger failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
                ts: new Date().toISOString(),
              });
            }
            // #WALK-BUDGET (the 00:00:48 specimen): the route-level
            // max-runtime timer is the TURN's budget — it exists to catch a
            // hung turn. The walk phase is NOT a turn: it has its own bounds
            // (the per-hop ceiling OLYMPUS_HOP_TIMEOUT_MS + the first-byte
            // deadline + park-on-exhaustion with hop-state persistence from
            // second zero). Leaving the turn's timer armed through the walk
            // killed hops fixtures/ui-kit mid-flight at exactly
            // request-start + 15 min while they were GREEN-ward bound. The
            // turn is over — its timer retires; the walk bounds itself.
            clearTimeout(maxRuntimeTimer);
            clearTimeout(startupTimer);
            // W-T WALK-STALL-RETIRE (the 00:56 specimen): the warm-stall
            // timer is ALSO a turn budget — a hop running silently in its
            // spawn for >180s tripped it MID-WALK and killed the stream over
            // a healthy walk (hop-by-hop-corrections was alive, the client
            // saw "Task failed"). The walk bounds itself (per-hop ceiling +
            // first-byte deadline + park-on-exhaustion); the stall bound
            // retires with the turn.
            if (warmStallTimer) clearInterval(warmStallTimer);
            try {
              const walk = await maybeWalkThePlan({
                slug: opts.intent.slug, laneRoot, send, sessionId: opts.conversationId, publishActivity: true,
                expectPlan: opts.classification?.needsPlanning === true,
                // W-T PLAN-FRESHNESS: the planning turn's start — a plan on
                // disk older than this is the STALE one (the model echoed a
                // new plan but never wrote it — the 00:53 specimen walked
                // the old plan from a prior session).
                turnStartedAt,
                // W-U PLAN-HARVEST: the turn's text — when the plan never
                // lands on disk, the post-run extracts it from this buffer.
                turnText: turnTextBuf,
                // W-S TURN-SETTLE: the v2 prompt resolves a step early — the
                // walk waits for the planner's turn to finish server-side
                // before reading any plan (the 23:31 hybrid-state specimen).
                turnStillAlive: opts.conversationId ? async () => {
                  try {
                    const server = await ensureServer();
                    const ocSession = await getOrCreateSession(opts.conversationId);
                    return (await isTurnAliveServerSide(server, ocSession)).alive;
                  } catch { return false; }
                } : undefined,
              });
              if (walk.awaitingApproval?.gate) {
                // #120 (PLANO-MASTER-1 B6c): the SAME gate the Pantheon
                // toast polls, asked through the existing question flow —
                // approve from EITHER surface; 's'/'n' typed here resolve
                // it in-turn (resolvePlanWalkAnswer, above).
                send({ type: 'question', id: walk.awaitingApproval.gate.id, msg: walk.awaitingApproval.gate.approvalPrompt, choices: ['s — approve the walk', 'n — abort the plan'], ts: new Date().toISOString() });
              }
              // W-V POST-WALK PREVIEW: the pre-walk trigger ran before the
              // hops existed — a first-run lane has no HTMLs at that point
              // ("no package.json and no HTML entry" was TRUE then). The
              // walk just wrote the deliverables: re-trigger the static
              // preview so the panel goes green on the SAME run, never
              // only on the second prompt.
              if (walk.walked) {
                try {
                  const t2 = await maybeStartDevServer(opts.intent.slug, laneRoot);
                  if (t2.triggered) {
                    send({ type: 'log', msg: t2.status?.url ? `Live preview ready: ${t2.status.url} — ${t2.reason}` : `Live preview: ${t2.reason}`, ts: new Date().toISOString() });
                  }
                } catch { /* the preview never breaks the turn */ }
              }
            } catch (e) {
              send({
                type: 'log',
                msg: `Plan walk failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
                ts: new Date().toISOString(),
              });
            }
          }
          finish(0);
          return;
        }

        // 4. Server-level failure before anything was delivered AND the
        //    message was never posted → safe one-shot fallback (context
        //    retained via --session). API/provider errors are surfaced as-is.
        if (!result.receivedEvents && !result.postStarted) {
          send({ type: 'log', msg: `Warm session interrupted (${result.error || 'error'}) — retrying once via one-shot run.`, ts: new Date().toISOString() });
          fallbackOneShot(sessionId);
          return;
        }
        if (result.error && result.error !== 'aborted') {
          fail(`OpenCode run failed: ${result.error}`);
          return;
        }
        finish(result.code);
      })().catch((err: any) => {
        clearTimeout(startupTimer);
        clearTimeout(maxRuntimeTimer);
        fail(`Unexpected error: ${err?.message || String(err)}`);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
