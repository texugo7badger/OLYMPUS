# THE UAT KIT — texugo's v0.0.3 GATE RUN (final protocol; his to review + edit)

**Standing authorization (registered verbatim, p5):** a from-scratch generation of a simple project ("exemplo landingpage") with ALL gods and demigods working in parallel, producing a bug-free project that runs first-try and is well-built. **Nothing auto-ships.**

## 0. PRE-CONDITIONS (the E2 gate — verify BEFORE the run)

1. **The live apply is RUN** (this is the one blocker found at the UAT-R1 rehearsal, E2, verbatim): `node scripts/apply-strategy.js --strategy free-openrouter` — then verify: `npx tsx scripts/budget-guard.test.mjs` → **GREEN 12/12** (the guard reads the live surface on this box) and `grep -c "glm-5.2" opencode.json` → 0. Without this, the run reproduces #76's cuts BY CONFIGURATION.
2. Provider/quota decision (N10): the GO plan or a budget-sized lane — the D31/#76 KNOWN behavior is fixed in the tracked config; the live apply carries it.
3. The app installed + the repo at the release frontier; battery-19 green.

## 1. THE BRIEF (frozen shape — his subject stays his own: "exemplo landingpage")

> Build **"<his subject>"** — a one-page landing. Sections: fixed nav (logo + two links + CTA), hero (headline, sub, CTA), three feature cards, one testimonial strip, footer. Static front-end, no backend, no framework beyond what the scaffold provides. Bar: runs first-try, zero bugs, well-built — semantic HTML, responsive, accessible (labels, contrast, focus states), one JS file for the nav toggle + CTA smooth-scroll. Clean, minimal, production-shaped.

## 2. THE COMMANDS (from zero)

```bash
mkdir -p ~/olympus-bench/uat-gate/projects/<slug>/project   # workspace OUTSIDE the repo
cd <the workspace lane>                                       # config + .opencode at the LANE level (P-E law)
# spawn the full pantheon on the brief (the campaign runner pattern; the single
# prompt carries the delivery contract + single-turn clause + gate-final):
#   the driver/runner shape: ~/.opencode/... or the f4-runner pattern with the NEW tracked config
# watch the bus:      tail -f ~/.olympus/symphony-bus.jsonl   (seq monotonic; heartbeats per god)
# read the sync-map:  ~/.olympus/sync-map.json                (Atlas; entries per prompt + dispatch)
# run the gate:       node <repo>/scripts/project-exit-gate.mjs <project-dir>
# serve + click:     cd <project-dir> && npm run dev          (then click the CTA in the browser)
```

## 3. THE OBSERVABLE CHECKLIST (what "good" looks like)

- **Spawn census**: every god lane + every semideus lane present in the bus/census (all 10 gods).
- **Bus**: seq strictly monotonic, zero drops, the loud-drop counter at 0.
- **Sync-map**: his prompt (origin project) + every dispatch (origin dispatch) with lifecycle statuses.
- **Transcripts**: zero `reason: 'length'` anywhere (the #76 bar).
- **Gate**: all 7 checks green, first-try.
- **Page**: renders; the CTA smooth-scrolls (his real click — the live rung).
- **Well-built rubric**: semantic HTML, responsive, accessible, clean minimal design, pt-BR real (no lorem).

## 4. PASS / FAIL (the bar, operationalized)

**PASS** = census full · bus clean · gate all-7 first-try · zero cuts · page renders + clicks · he judges it well-built → **v0.0.3**.
**FAIL names the lane**: gate red → which check (generator/contract lane); a cut → the live-apply did not take (re-run §0.1); no dispatch on the bus → the spine/lane; heartbeats missing → #77; renders-but-ugly → the quality rubric (his eyes, then the cert matrix); cut mid-output again → #76 re-opens with the new transcript.

## 5. DECISION REQUESTS (texugo's calls — pre-staged, NOT applied)

**(a) The #77 flip** (the root-session managed-gate heartbeat lane) — one-line design call, his: extend the managed gate to the interactive session (heartbeats live) vs keep the gate as-is. **(b) v0.0.3 tag-on-PASS** — the release-notes draft is the CHANGELOG Unreleased section (evidence-pointered); tag + publish after his PASS. **(c) Provider/quota (N10)** — the top-up that unblocks cert night (the 4 cold gods + callimachus re-try need a resolvable lane). **(d) Instinct-store policy for his run** — default: run as-is (the promoted residents are machine state, part of the machine he is testing; his call to freeze).

## 6. STATE AT END (the rehearsal's honest handoff)

The UAT-R1 rehearsal was **STOPPED AT E2 by design** (the live surface un-sized; the full-pantheon build under old caps would have burned the night reproducing known cuts). The re-entry after texugo's apply is EXACTLY this kit's §0→§4. Next sessions: cert night (planted-defect doctrine, the cold gods + callimachus; needs N10) or MADRUGA-4.
