# HIGIENIA-2 / H3b — #84 + #79 CURED: the instinct RAG wired + the learning loop run LIVE

**Closes #84, closes #79.**

## #84 — the instinct RAG (F1): proven instincts as prior-context blocks

`src/lib/instinct-rag.ts` — `instinctPriorContext(godId, taskText, opts?)`: the composer's
proven instincts (confidence ≥ 0.8, a real token match against the trigger) compose into
the dispatched payload as a SHORT block — `[PRIOR CONTEXT — proven instincts … trust but
verify]` — never prompt essays. No match, no block (the dispatch stays lean). The scoring
is deliberately naive (token overlap on the trigger, a stoplist) — the instinct pools
are small; a vector store would be ceremony. The vault root comes from the CANONICAL
resolver (a first-draft bug — a hand-rolled env default that returned null outside the
env — was caught by the LIVE probe and fixed to `getVaultRoot()`).

The wiring: `symphony-resonate.ts` composes the block INTO the dispatched payload
(`effectivePayload84`) — what the demigod actually receives; the registry records the
dispatched payload; the sync-map entry keeps the user's original task.

Pinned (rlm-metabolism +4): the temp-vault behavior (a matching proven instinct RIDES
verbatim; no match → NO block; below-confidence NEVER rides) + the wiring source pin.
**Honest note:** #84's pins were written after the implementation — a RED-first miss,
disclosed (the behavioral pins are still the permanent guard; the miss is on the ritual,
not the proof).

## #79 — the RLM learning loop, run LIVE (G1)

**The first empirically-promoted instinct from REAL session data.** The promotion:
`~/OLYMPUS-VAULT/05_Auto_Learning/instincts/apollo/empirical/free-tier-hop-sizing.md`
— born from the PLANO-MASTER-1 B7 walk's REAL outcomes: the 9-file core-components hop
parked twice at ~20min with ZERO artifacts (the glm-5.3 default thinking consumed the
single-run output), the 5-file strong-lane attempt likewise, while the flash lane's
3-file hop completed in 337s/3.1k-out and every post-split hop walked green (20/20,
18 honest parks). The action: keep multi-file hops ≤ 5 artifacts; route volume-shaped
component work to the flash lane; never dispatch a 9-artifact single hop on the free
tier. The E6 two-source promotion gate satisfied (the failure pattern AND the success
pattern, both observed in the same campaign); confidence 0.85; samples 2/2/2; the
curation record in the frontmatter (status: promoted, promoted_by, evidence).

**The proof the loop is ALIVE (reports/higienia-1/h3b-live-rag-proof.txt): the #84 RAG
reads the #79 promotion live — a matching apollo dispatch today carries the hop-sizing
guidance.** The two cures feed each other: the learning loop's output is consumed by the
dispatch path. THE LOOP RAN.

## The honest engineering note

The live promotion immediately broke `parallel-pantheon`'s P2 pin — it asserted a FROZEN
inventory of the user's live instinct store (the exact first instinct by identity), and
the #79 promotion (working AS DESIGNED) changed the inventory. The pin is relaxed to its
intent ("the store answers, count ≥ 1") — the N29-class lesson applied: live-data
fixtures must never pin exact inventories. Declared here.

**GREEN: rlm-metabolism 17/17 + parallel-pantheon 8/8 + battery 30/0/0 via
`npm run battery` + tsc 0.**

**State: R4 untouched; frozen pair zero-diff; 0 CJK.** Next: H4 — #76 + #78 + #83.
