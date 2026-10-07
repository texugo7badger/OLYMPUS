# UAT-FIX-1 — FILING LOG (2026-10-08 report-day; recon night)

All bodies carry the exact UTC stamps (E-2): the UAT run's real span 2026-10-07T16:44–16:52Z.
Labels from the existing 23-label set only. Tracker open set re-verified immediately before
creation (E-5): exactly #76 + #78–#96.

| # | Issue | Type | Labels | Body file (staging) | URL |
|---|---|---|---|---|---|
| 1 | F1 | fix(registry) | bug, registry | /tmp/opencode/uat-fix-1/issue-f1.md | https://github.com/texugo7badger/OLYMPUS/issues/97 |
| 2 | F2 | fix(harness) | bug, harness, free-tier | /tmp/opencode/uat-fix-1/issue-f2.md | https://github.com/texugo7badger/OLYMPUS/issues/98 |
| 3 | F3 | fix(harness) | bug, harness | /tmp/opencode/uat-fix-1/issue-f3.md | https://github.com/texugo7badger/OLYMPUS/issues/99 |
| 4 | F5 | feat(dev-server) | enhancement, dev-server | /tmp/opencode/uat-fix-1/issue-f5.md | https://github.com/texugo7badger/OLYMPUS/issues/100 |

Numbers landed exactly on the expected #97–#100 — zero cross-ref corrections needed.

## The #86 evidence comment (F4 — no new issue, per the charter)

- Comment: https://github.com/texugo7badger/OLYMPUS/issues/86#issuecomment-6045530622
- Payload: the warm session `ses_ee8bd9486ffe0ZuDzL6EVE3gnm` state verbatim (16 messages, the 2
  null-finish death turns with UTC stamps, the UnknownError records, the five files, the exit-gate
  FAIL verdict, the alive :3777 serve, the disposition pointer).

## Taxonomy check (batch report section)

- #97 fix(registry): … [bug, registry] — in-pattern
- #98 fix(harness): … [bug, harness, free-tier] — in-pattern
- #99 fix(harness): … [bug, harness] — in-pattern
- #100 feat(dev-server): … [enhancement, dev-server] — in-pattern
- #86 (commented, not closed) feat(recovery): … [enhancement, autonomy] — in-pattern per campaign
  conventions; scope-vocabulary drift vs the AGENTS.md set noted as an errata candidate.

No issues closed at the recon; the build night closes #97/#98/#99 per stage with merge-sha evidence.
