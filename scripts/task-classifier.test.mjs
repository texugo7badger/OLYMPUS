#!/usr/bin/env node
/**
 * task-classifier.test.mjs — zero-dependency regression test (BATCH 12c, P5).
 *
 * Run: npx tsx scripts/task-classifier.test.mjs    (exit 0 = pass)
 *
 * Pins the BATCH 12b finding: prompts explicitly addressing a god
 * (godId=apollo …) were stack-routed to hermes because
 * STACK_KEYWORDS.graphql contained the bare 'apollo' (the Apollo GraphQL
 * client's name colliding with the god's). The 12c fix: (a) god names are
 * never bare stack keywords, (b) an explicitly addressed god wins
 * outright. All OTHER stack detection must stay unchanged.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { classifyTask, detectStacks } from '../src/lib/task-classifier';

let failures = 0;
function expect(name, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
  if (!ok) failures++;
}

// 1. THE 12b COLLISION PROMPT — VERBATIM from the live evidence
// (classification event cls_mus8ixsyzo7e9q / cls_mus8w7tapy5xp0 both
// reported routeTo:"hermes" for this text; both id-joined pairs scored
// match:false in the 12b metric).
const collisionPrompt = 'MANDATORY FIRST STEP: call olympus-dispatch with godId=apollo, demigod=planner, task="Fixture verification for the classification join key (issue 54). Acknowledge in one line; do not perform any work." After the dispatch tool returns, reply DONE and nothing else.';
expect('12b collision prompt → routeTo', classifyTask(collisionPrompt).routeTo, 'apollo');
expect('12b collision prompt → no graphql stack', classifyTask(collisionPrompt).stack.includes('graphql'), false);

// 2. godId=apollo + graphql-FLAVORED text — explicit address must still win.
expect('godId + graphql flavor → routeTo', classifyTask('call olympus-dispatch with godId=apollo and a graphql API schema task').routeTo, 'apollo');

// 3. Pure GraphQL prompt — unchanged behavior (no god address). NOTE: the
// pre-existing cascade fires on "design" (frontend) and "schema"
// (database) before the integrations branch, so this prompt deliberately
// avoids both to isolate the graphql→integrations path.
expect('pure graphql prompt → routeTo', classifyTask('Wire the GraphQL API endpoint with mutations and resolvers').routeTo, 'hermes');
expect('pure graphql prompt → graphql stack', classifyTask('Wire the GraphQL API endpoint with mutations and resolvers').stack.includes('graphql'), true);

// 4. Apollo CLIENT library mention — graphql stack detection preserved.
expect('apollo client mention → graphql stack', detectStacks('Set up Apollo Client for data fetching in the React app').includes('graphql'), true);

// 5. Free-text god mention (no structured field) — no stack routing.
expect('free-text apollo mention → no graphql stack', detectStacks('ask apollo to plan the roadmap').includes('graphql'), false);
expect('free-text apollo mention → routeTo', classifyTask('ask apollo to plan the roadmap').routeTo, 'apollo');

// 6. Other explicitly addressed gods — precedence + canonical domain.
expect('godId=hephaestus → routeTo', classifyTask('dispatch with godId=hephaestus, demigod=build-resolver').routeTo, 'hephaestus');
expect('godId=hephaestus → domain', classifyTask('dispatch with godId=hephaestus, demigod=build-resolver').domain, 'backend');
expect('god: persephone → routeTo', classifyTask('god: persephone review the schema migration').routeTo, 'persephone');

// 7. Unchanged routing spot-checks (no god address involved).
expect('rust build error → hephaestus', classifyTask('fix this Rust build error in the cargo build').routeTo, 'hephaestus');
expect('e2e test prompt → dionysus', classifyTask('run the playwright e2e coverage suite').routeTo, 'dionysus');
expect('sql migration → persephone', classifyTask('write the SQL migration for the new table index').routeTo, 'persephone');
expect('greeting → trivial/apollo', classifyTask('hi').complexity, 'trivial');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll task-classifier regression assertions passed');
process.exit(0);
