# HIGIENIA-1 / H1a — #82 + #111 CURED (RED-first): the text-channel gate + the 429 window honesty + the ceiling-kill classification

**Closes #82, closes #111.**

## #82 — the whitespace-only text channel (the emission-point gate)

The observed specimen (D11, the madruga barbearia transcript): a text part carrying 21
newlines reached readers — the old emission took ANY truthy string. The cure:
`isEmittableText(text)` exported (`src/lib/opencode-session.ts`) — whitespace-only parts
die at the emission point (`mapPart`'s text case consults the gate); real content passes
untouched. Pinned: the 21-newline specimen + blanks NOT emittable; real text (incl.
padded real content like `' a '`) emittable; the source pin on the emission's consult.

## #111 part 1 — the exhaustion card's window honesty

The SMOKE-1 forensics made the ask precise: the machine class VERBATIM when the provider
body carries it; the honest nothing-line for the bare class. The cure:
`providerWindowSignals(errText)` (exported) surfaces `limit_source` /
`provider_error_code` / `remedy_hint` verbatim on the card when present
(OpenRouter-class); `retryExhaustionGuidance` falls back to the honest line — "The
provider body signals nothing about the window (no Retry-After, no quota/reset fields —
the window length is unknowable from the response)" — never an invented window. The
"respect Retry-After" instrumentation note stays note-only until a provider ever sends
one (the forensics' own finding). Pinned: both classes against the real card composer.

## #111 part 2 — the ceiling-kill classification (the classless `exit null` dies)

The FLUENCY-1/SMOKE-1 specimen: the per-hop ceiling's SIGKILL parked `dispatch-failed`
with a bare `exit null` — classless, while an inner retry loop held the process. The
cure: `classifyCeilingKill(stderrText)` (exported from the walker) — a hang whose
stderr carries a provider-error class counts as **provider-overload WITHIN the crescendo
budget** (absorbed, retried within maxAttempts, the named error on final exhaustion); a
pure hang parks **NAMED** ("ceiling-kill (OLYMPUS_HOP_TIMEOUT_MS Nms): the stream hung
with no provider error"). The dispatcher consults it on the `code === null` signal-kill
path — the layered design (inner loop absorbs bursts, crescendo rides fast-fails,
ceiling bounds hangs) now actually composes. Pinned: both branches + the wiring source
pin.

## RED → GREEN

RED: 6 named FAILs (the gate absent + the emission still truthy-taking; the card
carrying neither the machine class nor the nothing-line; the classifier absent + the
wiring absent). GREEN: opencode-session FULL + hop-runtime FULL + **battery 30/30 +
tsc 0**.

**State: R4 untouched; frozen pair zero-diff; 0 CJK.** Next: H1b — #80 + #87 + #93.
