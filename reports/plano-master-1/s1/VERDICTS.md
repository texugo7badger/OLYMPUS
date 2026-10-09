# PLANO-MASTER-1 / B1 — the F5 + F6 forensics: verdicts WITH PATHS (zero code)

Four questions, four verdicts. Every claim below carries its file path; every path was read
on this box on 2026-10-09 (post-`6ff1933`). Nothing was changed to produce this report.

---

## (a) F5 — does the vault folder exist? YES. It always did.

**Verdict:** `~/OLYMPUS-VAULT/02_Projects/lumina-crm` EXISTS, born **2026-10-09 13:41:29 BRT**
(16:41:29Z), created by the #110 intake 49 seconds into the user's UAT window — 0-LLM,
deterministic, honest (classified, registered, port 3011 assigned). The user's belief
("Lumina did not get a folder in the vault on the first prompt") was WRONG about the disk and
RIGHT about the panel: the panel never showed it. Why — verdict (b).

**Evidence:** folder birth in `s0/key-mtimes.txt`; `.olympus-context.json` (`createdAt:
2026-10-09T16:41:29.633Z`, `livePreviewPort: 3011`) archived at `s0/vault-lumina/`;
`project.md` + `_handoff.md` (the user's original prompt, preserved bytes) in the same archive.

## (b) F5 — which surface does the panel read? The POINTER + a mount-once list — and the #110 intake updates NEITHER.

**Verdict:** the panel's project truth is TWO steps removed from the vault disk, and the
#110 first-prompt intake wires into none of them:

1. **The active-project pointer.** The store's `activeProject` loads from
   `GET /api/olympus/projects` → `readActiveProject()` → **`~/.olympus/active-project.json`**
   (`src/lib/project-context.ts:54` `ACTIVE_FILE`; read at `:513-514`, write at `:530`).
   The pointer's content at close of evidence: **`{"slug": "continue", "ts":
   "2026-10-09T17:51:03.032Z"}`** — 14:51:03 BRT, AFTER the UAT window, and pointing at the
   user's OTHER project, not lumina. The **manual** creation flow DOES set it
   (`src/app/api/olympus/projects/auto/route.ts:97-110` — create → `PUT /projects/active`),
   but the **#110 autonomous intake** (the action-route path the UAT actually exercised)
   never calls it — it creates the vault project + note and triggers the dev-server off the
   routed SLUG, bypassing the pointer entirely.
2. **The switcher list.** `project-switcher.tsx:35` fetches the project list ONCE on
   component mount (`useEffect([refreshProjects])`) into the zustand store
   (`olympus-store.ts:450-461`); the dropdown (`:59-60`) renders from the STORE, with no
   re-fetch on open. The app started 13:40:23 → the list froze WITHOUT lumina → even opening
   the switcher at 13:50 showed nothing new.

So during the whole UAT: not active (pointer untouched), not listed (mount-once cache) —
the panel's truth said "no Lumina anywhere" while the vault truth said "born 13:41:29".
**The wiring to close this exists** (the auto route's PUT) — the intake path just never
calls it. **Cure lane: B2 rider** (the intake home wins AND becomes VISIBLE: set the pointer
+ refresh the panel on intake) **+ B6** (the where/who narration).

**Corroborating state:** `~/.olympus/opencode-sessions.json` — the UAT's opencode session
`ses_ede7562adffeovIRMFEqNtSYgZ` created `16:41:34.818Z` (13:41:34 BRT, one second folder-age
— the intake's spawn), last used `17:51:03.039Z` (the same 14:51:03 moment the pointer moved
to `continue` — the project switch back, closing the session's use window).

## (c) F5 — which build was serving the user's terminal at 13:40? A MIXED build — and nothing could tell him.

**Verdict:** the 13:40 terminal ran TWO builds of two ages:

- **The Electron main: compiled 2026-10-03 23:05** (`dist-electron-tsc/main.js`, mtime
  verified) — SIX DAYS and five campaigns of cures behind main (no #107 crescendo logic, no
  #112 manager, no B0). Its `isDev = !app.isPackaged` (`main.js:91`) resolved true → it
  spawned **`next dev -p 3737`** (`main.js:8-10`, `:168` `spawnNext()`), and its
  native-terminal module loaded at **13:40:23 BRT** (`~/.olympus/native-terminal.log`, tail —
  the app-start stamp inside the user's window).
- **The renderer + API: LIVE SOURCE** — the `.next/dev` artifacts carry mtime
  2026-10-09 15:07 (a dev server compiled from the repo's Oct-9 code during the window), and
  the UAT observably exercised Oct-9 server code: the **#107 retry cadence ("retry 1/4 in
  5s")** the user watched is `src/lib/opencode-session.ts` — merged the FLUENCY-1 night,
  impossible from the Oct-3 production build (`.next/BUILD_ID` Oct 3 23:00). The dev-server
  trigger that honestly refused at 13:47 is also Oct-9 code (`src/lib/dev-server-trigger.ts`).

So: old main (PTY/terminal/backend), new renderer+API (the brain). The mix WORKED — but
**no surface prints the git rev of either half** (the R1 gap), so "which build is serving"
cost the mission its diagnosis. **Cure lane: B6a** (the build banner — and per this verdict
it must name BOTH halves: the main's build date/rev and the renderer's rev).

## (d) F6 — the "stale-window" flag: NOT stale. The #35/#39 invariant working as designed — with unexplained copy.

**Verdict:** the flag is **in-memory, per-opencode-session** benchmark accumulator state —
not a file, not cross-session residue. `benchmark-config.json` (mtime Oct 2 17:46) is
config-only and was never touched. The mechanism (`src/lib/opencode-session.ts:1398-1424`):
before each turn's retry loop the code snapshots `preRunPoisoned` (`:1404`); if a retry
succeeds, it clears ONLY the poison this turn introduced (`:1413-1416`) — a window flagged
by an **earlier turn of the same session** is deliberately preserved ("that error came from
an earlier turn and is not ours to erase", `:1410-1412`) → the recovery line prints
**"benchmark window still flagged from an earlier error"** (`:1422`). The windows flush at
run end (`:1069`, `:1078`; `:2336` flushBenchmarkAccumulator).

So the line the user saw was HONEST — an earlier turn of his UAT session
(`ses_ede7562adffeovIRMFEqNtSYgZ`) errored (consistent with the window's provider falls),
and the recovery refused to erase history it didn't own. What makes it feel "cheap" is the
copy: it never says WHICH turn or WHAT error — provenance exists in the mechanism but not
in the sentence. **Which earlier turn flagged it is not in the durable record** (per-event
terminal text is not persisted) — disclosed honestly here. **Cure lane: B6b** (narration
carries where/who/why — the recovery line learns to name its provenance). NOT a B1 code fix.

---

## The cure matrix this feeds

| Verdict | Feeds |
|---|---|
| (a) folder exists | no cure — the record corrected; closes F5's first question |
| (b) pointer + list wiring gap | **B2 rider** (intake sets the active pointer + panel refresh) + B6 |
| (c) mixed build, invisible | **B6a** (the banner names BOTH halves' revs) |
| (d) honest-but-unexplained copy | **B6b** (narration provenance) |

The orphan-lane collision itself (F1) was already evidenced at Stage 0 (`s0/README.md`) and
cures in B2 proper. **Zero code changed in B1.** 4 of the 12-merge cap spent after this
paper (Phase 1 `0bd4a56`, B0 safe-set `07a34b5`, B0 park `6ff1933`, this B1 paper).
