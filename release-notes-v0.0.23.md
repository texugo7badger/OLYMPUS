## OLYMPUS v0.0.23 — THE STRATEGY ENGINE

One strategy truth · rebuilt GO/ZEN rosters · an interactive model picker · a measured MCP arsenal · gods that lead teams of demigods · a minimalist identity.

### Strategies — rebuilt around DeepSeek V4.1 Flash (1017)
- **GO Max Quality** — Apollo **DeepSeek V4.1 Flash** · Atlas **Hy3** · Hephaestus **Kimi K2.7 Code** · Athena/Hermes **Qwen3.7 Plus** · Artemis **Kimi K3** · QA/DB/vault **DeepSeek V4.1 Flash** · Prometheus **MiniMax M3**.
- **GO Balanced (default)** — Apollo/Hephaestus/Artemis/Persephone/Callimachus **DeepSeek V4.1 Flash** · Athena/Dionysus/Hermes **Qwen3.7 Plus** · Atlas **Hy3** · Prometheus **MiniMax M3**.
- **GO Budget** — DeepSeek V4.1 Flash as the quality floor · Athena **Qwen3.8 Flash** · volume gods **MiMo-V2.6-Flash**.
- **ZEN Max / Balanced / Budget** — GPT 6.1 Sol · Claude Sonnet 5.5 / Opus 5.5 / Haiku 5.5 · GPT 6 Sol/Luna · Gemini 3.1 Pro · Grok 4.7 · DeepSeek V4.1 Flash.
- **DeepSeek V4 Pro retired** from every roster; **GLM-5.3-Flash retired from quality roles**; **BYOK deleted** — every provider (OpenRouter, NVIDIA included) is registered inside OpenCode.
- Budgets verified against https://opencode.ai/v2/docs/console/go/ (2026-10-29): DS 4.1 Flash 173,330 req/mo · Hy3 21,500 · Qwen3.7 Plus 21,600 · Kimi K2.7 6,750 · MiniMax M3 16,000 · MiMo 150,400.

### The Strategy Builder (new screen)
Settings → LLM Strategy → **Build**: search any model registered in OpenCode by id, name or provider; per-god picker with context/output/price and fit hints; live lane/cost summary; **Save & apply**. Backed by `GET /api/olympus/models` and `POST /api/olympus/strategy/custom` (validates all ten gods + catalogue ids before applying).

### MCP arsenal — measured, not guessed
`npm run mcp:audit` performs the JSON-RPC handshake (`initialize` + `tools/list`) on all 28 servers. Curated default at **44 tools**: filesystem (14), memory (9), git (12), context7 (2), sequential-thinking (1), olympus-craft (6). Heavy servers stay opt-in under the 128-tool provider limit (rea 207, grafana 79, comfyui 41, godot, blender). Craft MCP gains a storm cap (max 3 live instances, dead-pid prune).

### Demigod teams
Every hop's arsenal directive carries the **TEAM CONTRACT**: size the work first, dispatch **2–5 independent sub-tasks in one parallel wave**, verify every artifact, synthesize and report the chain; trivial hops work alone.

### Runtime truth
Stale in-flight hops are reconciled on resume (#244); the run-state names `god · model · hop · elapsed`; a **Model lanes** panel lists dead lanes with class and retry time (#224); `session.idle` prunes the vault (bounded to 6h, #233); canonical slugs end project duplication (#242).

### Identity & docs
- Header + badge bar: v0.0.23, real counts (10 gods · 122 demigods · 321 skills · 28 MCPs · 4 plugins), `GO · ZEN · LOCAL`, one gold accent, no glow.
- The **eight badges are interactive** (version · license · downloads · forks · stars · last commit · size · contributors) and now **auto-update** from the GitHub API (`npm run badges:update`, on release, daily and on demand). Downloads count installer assets only.
- The header version token updates with the same script.
- README highlight: **“Low-cost. Excellent quality. Always free.”**
- README/AGENTS/MODEL-STRATEGIES/installer/SECURITY corrected: providers are authorized **inside OpenCode before opening the app**; OLYMPUS stores no LLM key.
- `docs/` is maintainer-only (gitignored); the public `LOCAL-LLM.md` lives at the repo root.

### Security
- **seroval 1.6.11** — clears two medium advisories (typed-array constructor code injection, RegExp source script injection). `npm audit` → 0.

### Gates
- Battery **65 PASS / 0 FAIL / 1 declared SKIP** · `tsc --noEmit` 0 · `next build` green · `check-strategy-sync` green.
- Release assets: AppImage, `.deb`, `.tar.gz`, `latest-linux.yml`.

### Fixed / closed in this release
#223 #224 #225 #228 #229 #230 #232 #233 #234 #235 #236 #237 #238 #239 #240 #242 #243 #244 #245 #246 #247 #248 #249 #250 #251 #252 #253 #254 #255 #256 #257 #258 #259 #260.

**Still open (real features, v0.0.24):** #226 campaign grouping · #227 in-flight hop panel · #231 activity pagination · #241 warm-server hop transport.
