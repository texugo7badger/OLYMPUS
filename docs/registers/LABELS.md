# LABELS — the GitHub label-set register (E3's recorded 23)

The tracker's whole label vocabulary, recorded at GAP-1-S4's E3 gate (the filing night's
"existing labels only" bar — cited as "23 recorded at E3" in `reports/gap-1/s4/FILING-LOG.md`)
but never committed in-tree until **AN-S4-4** paid it at MADRUGA-CLOSE-1 (2026-10-08).
Verified live via `gh label list` at CLOSE-1 — the set is unchanged since S4.

## The 23 labels (verbatim, alphabetical)

`accessibility` · `autonomy` · `bug` · `build` · `dependencies` · `dev-server` ·
`documentation` · `duplicate` · `enhancement` · `free-tier` · `good first issue` · `harness` ·
`help wanted` · `invalid` · `investigation` · `permissions` · `question` · `registry` ·
`security` · `tech-debt` · `telemetry` · `triage` · `wontfix`

## Shape (per the AGENTS.md taxonomy standing rule)

- **Type labels (one per issue):** `bug` / `enhancement` / `documentation`.
- **Area labels (match the title's scope word where one exists):** `autonomy` · `build` ·
  `dev-server` · `free-tier` · `harness` · `investigation` · `permissions` · `registry` ·
  `security` · `tech-debt` · `telemetry` · `accessibility` · `dependencies`.
- **GitHub utility labels:** `duplicate` · `good first issue` · `help wanted` · `invalid` ·
  `question` · `triage` · `wontfix`.
- **Honest gap, recorded not acted on:** the AGENTS.md scope vocabulary extends beyond the
  label set — the scope words `vault` and `cost` have no matching labels, so titles may carry
  a scope word while the labels use the nearest existing area (the UAT-FIX-1 #100 precedent:
  `feat(dev-server)` with the area label `dev-server`). Extending the label set is a
  standing-rule update, not a filing-night decision.
