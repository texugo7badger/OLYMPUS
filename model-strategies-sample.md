1. The free-openrouter strategy routes all ten gods through OpenRouter's strongest free flagship model with automatic refresh.
2. The free-big-pickle strategy assigns every god to a single 550B parameter model for unified reasoning across domains.
3. The free-nvidia-build strategy leverages NVIDIA's free endpoints including GLM-5.2 and Nemotron families for cost-free operation.
4. The zen-max-quality strategy deploys premium models per god role with GLM-5.3 for Apollo and Artemis in maximum quality mode.
5. The zen-balanced strategy optimizes cost-performance using GLM-5.3-Flash for Apollo and Hy3 for Atlas within reasonable budgets.
6. The zen-budget strategy minimizes spend by routing simpler gods to smaller models while preserving Hy3 for orchestration.
7. Apollo always uses GLM family models as sacred architecture — never downgraded regardless of strategy tier.
8. Atlas always uses Hy3 in GO strategies as sacred orchestration model — never substituted in paid tiers.
9. The free strategies auto-refresh model selections via scripts/refresh-free-models.js to capture strongest available endpoints.
10. Strategy selection determines which god gets which model — a core architectural decision in Olympus deployment.
11. GO strategies provide three quality tiers while free strategies provide three cost tiers for different user constraints.
12. Model assignments are codified in opencode.json and AGENTS.md as the single source of truth for routing.
13. The 128-agent fleet (10 gods + 118 demigods) all inherit their parent god's model assignment automatically.
14. Cross-god consistency matters — Apollo and Atlas model choices cascade to their demigod dispatches.
15. Token budgets per strategy are tracked in ~/.claude/cost-tracker for transparency and cap management.
16. Rolling caps on premium models (e.g., GLM-5.3 at $3/5h) constrain max-quality strategy to intermittent use.
17. Hy3 excels at agent orchestration specifically — making it optimal for Atlas regardless of cost tier.
18. Demigods inherit model assignments from their parent god — no independent model selection at demigod level.
19. The free-big-pickle strategy is unique — all gods share one model creating unified reasoning style.
20. Strategy switching requires opencode.json update and agent restart — not a runtime parameter.
21. Zen strategies use OpenCode Zen pay-as-you-go with no request caps — full 128-agent fleet always available.
22. Free strategies may hit rate limits on shared endpoints — zen strategies avoid this via dedicated billing.
23. Model strategy affects instinct confidence — same task may short-circuit differently across strategies.
24. Callimachus curates instincts per strategy — empirical patterns diverge when model capabilities change.
25. The active strategy is declared in AGENTS.md header — authoritative reference for all god behaviors.