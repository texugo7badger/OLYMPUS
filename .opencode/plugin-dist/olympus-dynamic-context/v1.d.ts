/**
 * olympus-dynamic-context — Dynamic Input Token Routing plugin.
 *
 * This plugin hooks the `experimental.chat.messages.transform` event and
 * rewrites the system prompt to include only stack-relevant skills,
 * god-allowlisted MCPs, scope-matched instincts, and stack-relevant
 * reference docs.
 *
 * The classification is passed via the `OLYMPUS_TASK_CLASSIFICATION` env
 * var (set by `/api/olympus/action` and `/api/olympus/intake` before the
 * `opencode run` spawn). When the env var is absent (e.g. legacy callers),
 * the plugin is a no-op — the full context loads as before.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { Plugin } from "@opencode-ai/plugin";
declare const plugin: Plugin;
export default plugin;
