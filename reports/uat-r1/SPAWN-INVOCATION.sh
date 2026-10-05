#!/usr/bin/env bash
# THE UAT spawn invocation — the KIT §2 single command (N34: recorded verbatim
# from the R2 rehearsal's real execution). Workspace OUTSIDE the repo.
# Pre-conditions: the curative apply ran; budget-guard BOTH surfaces GREEN.
set -euo pipefail
REPO=/home/texugo/Projects/olympus
LANE="$HOME/olympus-bench/uat-gate/projects/<slug>"
mkdir -p "$LANE/project"
ln -sfn "$REPO/.opencode" "$LANE/.opencode"
ln -sfn "$REPO/node_modules" "$LANE/node_modules"
cp "$REPO/opencode.json" "$LANE/opencode.json"
cp "$REPO/opencode.demigods.json" "$LANE/"
OLYMPUS_HOME="$(mktemp -d)" OLYMPUS_ROOT="$LANE" node "$REPO/scripts/apply-strategy.js" --strategy go-balanced
# then the runner (the R2-executed shape — the full prompt + single-turn
# clause + the delivery contract + the gate-final step lives in
# /tmp/opencode/r2-runner.mjs shape, shipped as reports/uat-r1/SPAWN-INVOCATION.sh;
# texugo's run: node <the runner> with his brief — see UAT-KIT §2 [rev: executed R2])
