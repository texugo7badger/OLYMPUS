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

import { classifyTask, detectStacks, classifyTurnWithInheritance, isNewTaskMarker, isFreeTextGodRedirect, inheritClassification } from '../src/lib/task-classifier';

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

// 8. #63 (BATCH 13): continuation-turn inheritance — the PetLove F3
// regression. The approval turn "Recomendação sua pode seguir - nome
// PetLove" was freshly classified devops·simple→prometheus; it must now
// inherit the session's prior god/class/budget instead.
const F3_MESSAGE = 'Recomendação sua pode seguir - nome PetLove';
const petlovePrior = classifyTask('Desenvolva a landing page interativa do abrigo de pets PetLove — hero, formulário de adoção, galeria.'); // athena·frontend
console.log('   (prior classification for the F3 conversation:', JSON.stringify({ routeTo: petlovePrior.routeTo, domain: petlovePrior.domain, tokens: petlovePrior.estimatedTokens }) + ')');

// 8a. answer turn inherits god/class/budget, fresh id, provenance in reason
const inherited = classifyTurnWithInheritance('answer', F3_MESSAGE, petlovePrior);
expect('F3 answer inherits routeTo', inherited.routeTo, petlovePrior.routeTo);
expect('F3 answer inherits domain', inherited.domain, petlovePrior.domain);
expect('F3 answer inherits budget', inherited.estimatedTokens, petlovePrior.estimatedTokens);
expect('F3 answer has FRESH classificationId', inherited.classificationId !== petlovePrior.classificationId, true);
expect('F3 answer reason carries provenance', inherited.reason.startsWith(`inherited-from=${petlovePrior.classificationId}`), true);

// 8b. warm prompt continuation inherits too
const warmPrompt = classifyTurnWithInheritance('prompt', 'Pode seguir com a implementação do formulário.', petlovePrior);
expect('warm prompt inherits routeTo', warmPrompt.routeTo, petlovePrior.routeTo);

// 8c. explicit redirect re-classifies (free-text, pt-BR)
const redirect = classifyTurnWithInheritance('prompt', 'Refatore isso com a Athena por favor', petlovePrior);
expect('free-text redirect → fresh routeTo', redirect.routeTo !== petlovePrior.routeTo || redirect.classificationId !== petlovePrior.classificationId, true);
expect('free-text redirect detected', isFreeTextGodRedirect('Refatore isso com a Athena por favor'), true);

// 8d. structured godId redirect still re-classifies (12c P5 precedence)
const structured = classifyTurnWithInheritance('prompt', 'dispatch with godId=hephaestus, demigod=build-resolver', petlovePrior);
expect('structured redirect → hephaestus', structured.routeTo, 'hephaestus');

// 8e. explicit new-task marker re-classifies
expect('new-task marker detected (pt-BR)', isNewTaskMarker('Agora uma nova tarefa: refazer o site da padaria'), true);
const newTask = classifyTurnWithInheritance('prompt', 'Agora uma nova tarefa: refazer o site da padaria com formulário de encomendas', petlovePrior);
expect('new-task → fresh classification', newTask.reason.startsWith(`inherited-from=${petlovePrior.classificationId}`), false);

// 8f. cold session (prior=null) → fresh classification
const cold = classifyTurnWithInheritance('answer', F3_MESSAGE, null);
expect('cold session → fresh classify', typeof cold.classificationId === 'string' && !cold.reason.startsWith('inherited-from='), true);

// 8g. inheritance helper preserves budget + god verbatim
const viaHelper = inheritClassification(petlovePrior);
expect('inheritClassification preserves god', viaHelper.routeTo, petlovePrior.routeTo);
expect('inheritClassification preserves complexity', viaHelper.complexity, petlovePrior.complexity);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll task-classifier regression assertions passed');
process.exit(0);
