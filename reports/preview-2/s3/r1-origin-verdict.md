# PREVIEW-2 Batch C — the R1-origin verdict (the auditor's micro-experiment, settled)

**CORRECT on all three byte-level samples. The eaten shape (`stacks: tml, css, javascript]`)
cannot be produced by the current deterministic intake path — proven by re-running the exact
path with a fresh slug and byte-dumping the `stacks:` line at three sampled moments**
(transcript: `r1-origin-transcript.txt`, exit 0):

```
SAMPLE-1 (immediately post-create):  'stacks: [html, css, javascript]' — 31 bytes, hex 73 74 61 63 6b 73 3a 20 5b 68 ... ( '['+h INTACT )
SAMPLE-2 (+250ms, post any deferred rewrite): identical bytes
SAMPLE-3 (after a read-back pass):            identical bytes; classifyFirstPrompt routes existing: preview-two-origin-check
CONSUMER READ-BACK (getProject):              stacks = ['html','css','javascript'] — the full array, no anomalies
```

The experiment ran in the REAL vault (`02_Projects/preview-two-origin-check`, created by the
real `resolveAndRegisterIntent`, 0 LLM) and cleaned after itself (the active-project pointer
restored byte-identical; the experiment's project dir removed — verified in the transcript's
HYGIENE block).

## The synthesis (all committed records agree; only one venue ever showed the specimen)

- The FLUENCY-1 intake-proof transcript (`reports/fluency-1/s5/intake-proof-transcript.txt:25`)
  carries the correct line (byte-verified at SMOKE-1, re-verified tonight).
- The live note (`~/OLYMPUS-VAULT/02_Projects/fluency-smoke/project.md:6`) carries the correct
  line (byte-verified at SMOKE-1).
- The SMOKE-1 entry-gates record (`reports/smoke-1/s0/ENTRY-GATES.md`) says BOTH carry the
  correct line — the auditor's read of it as "both carry the eaten shape" is inverted; the
  committed record is the truth and it says byte-perfect-correct.
- The ONLY venue where the eaten shape was ever observed is the FLUENCY-1 **chat tail** — the
  session's own LLM-generated summary surface, which #101 already documented degenerating into
  tokenizer salad (chars eaten mid-stream is that class's exact signature). A deterministic
  0-LLM artifact never carried it; the chat surface did.
- Tonight's experiment closes the question with fresh-bytes evidence: even if a mid-fix transient
  had eaten it at 01:49Z on the rider-era tree, the current path provably does not.

## Why the R1 cure still stands (the permanent guard)

The `__anomalies` surface (SMOKE-1 merge `aef2f9b`) flags a bracket-eaten `stacks:` line LOUDLY
(parseFrontmatter records `{key, raw, reason}` instead of silently stringing it), and the
round-trip pin (write → read → identical) runs in every battery. If the corrupt class ever lands
on ANY durable surface again — chat paste, hand edit, partial write — it is detected at parse
time rather than degrading to `[]` silently. The guard answers the auditor's real concern
("if anything ever parses stacks back, it degrades silently") independent of the specimen's
origin. That is the cure working; the origin question is now CLOSED with evidence.
