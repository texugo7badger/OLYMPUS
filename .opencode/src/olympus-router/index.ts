/**
 * olympus-router — V2 ENTRY (the v2 protocol, 2026-10-23).
 *
 * OpenCode v2 loads a plugin DIRECTORY by its `index.js` and requires the
 * module to export `{ id, setup }` (probe-verified against 2.0.32: the
 * loader ignores package.json main and a CJS `exports.default` fails the
 * schema — the module must assign `module.exports` directly).
 *
 * The Phase 1-4 business logic lives untouched in ./v1.ts (the v1 hook
 * map); this adapter wires it to the v2 domains:
 *
 *   v1 experimental.chat.system.transform -> session.hook("context")
 *   v1 chat.params                        -> session.hook("context")
 *   v1 permission.ask                     -> permission.hook("evaluate")
 *   v1 tool.execute.before                -> tool.hook("execute.before")
 *
 * Dropped per #189 (native v2 coverage): the cache hooks (v2 caches at the
 * provider layer) and the skill-registry scan (v2 config `skills` paths).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import routerV1 from "./v1.js";

type AnyCtx = any;

/** v2 renamed the built-ins; the v1 vocabulary keys on the old names. */
const V2_TO_V1: Record<string, string> = {
  shell: "bash",
  file: "write",
};

/** Best-effort text of the last user message in a v2 SessionContext. */
function lastUserText(messages: any): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "user") continue;
    const parts = Array.isArray(m.parts) ? m.parts : Array.isArray(m.content) ? m.content : [];
    const text = parts
      .map((p: any) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : ""))
      .join("\n")
      .trim();
    if (text) return text;
    if (typeof m.content === "string" && m.content.trim()) return m.content.trim();
  }
  return "";
}

const plugin = {
  id: "olympus-router",
  async setup(ctx: AnyCtx) {
    const directory = ctx?.location?.directory ?? process.cwd();
    const hooks: any = await (routerV1 as any)({ directory }, {});

    /* ── system.transform + chat.params -> session context ─────────── */
    await ctx.session.hook("context", async (sctx: AnyCtx) => {
      try {
        const before: string[] = (sctx.system ?? []).map((p: any) =>
          typeof p === "string" ? p : String(p?.text ?? ""),
        );

        const transform = hooks["experimental.chat.system.transform"];
        if (typeof transform === "function") {
          const out: any = { system: before.slice() };
          await transform({}, out);
          const beforeLast = before.length ? before[before.length - 1] : "";
          const afterLast = out.system.length ? out.system[out.system.length - 1] : "";
          if (afterLast !== beforeLast) {
            if (sctx.system.length > 0) {
              const last = sctx.system[sctx.system.length - 1];
              last.text = afterLast;
            } else {
              sctx.system.push({ type: "text", text: afterLast });
            }
          }
        }

        const chatParams = hooks["chat.params"];
        if (typeof chatParams === "function") {
          const pin: any = {
            sessionID: sctx.sessionID,
            agent: sctx.agent,
            model: sctx.model,
            message: lastUserText(sctx.messages),
          };
          const pout: any = { options: {} };
          await chatParams(pin, pout);
          if (pout.options && typeof pout.options === "object") {
            Object.assign(sctx.options, pout.options);
          }
          if (typeof pout.reasoning_effort === "string") {
            sctx.options.reasoning_effort = pout.reasoning_effort;
          }
        }
      } catch (err: any) {
        console.error(`[olympus-router:v2] context hook failed: ${err?.message || err}`);
      }
    });

    /* ── permission.ask -> permission evaluate (tier-aware MCP gate) ── */
    const permissionAsk = hooks["permission.ask"];
    if (typeof permissionAsk === "function") {
      await ctx.permission.hook("evaluate", async (ev: AnyCtx) => {
        try {
          const candidates = [ev.action, ...(Array.isArray(ev.resources) ? ev.resources : [])];
          const tool = candidates.find(
            (s: any) => typeof s === "string" && s.startsWith("mcp_"),
          );
          if (!tool) return;
          const out: any = { status: "allow" };
          await permissionAsk(tool, out);
          if (out.status === "deny") {
            ev.effect = "deny";
            ev.message = ev.message ?? `MCP ${tool} denied by the OLYMPUS tier allowlist`;
          }
        } catch (err: any) {
          console.error(`[olympus-router:v2] permission hook failed: ${err?.message || err}`);
        }
      });
    }

    /* ── tool.execute.before -> tool execute.before (instinct scope) ── */
    const toolBefore = hooks["tool.execute.before"];
    if (typeof toolBefore === "function") {
      await ctx.tool.hook("execute.before", async (ev: AnyCtx) => {
        try {
          const out: any = { args: ev.input };
          await toolBefore(
            {
              tool: V2_TO_V1[ev.tool] ?? ev.tool,
              sessionID: ev.sessionID,
              callID: ev.id,
              agent: ev.agent,
              args: ev.input,
            },
            out,
          );
          if (out.args !== ev.input) ev.input = out.args;
        } catch (err: any) {
          console.error(`[olympus-router:v2] execute.before failed: ${err?.message || err}`);
        }
      });
    }
  },
};

export = plugin;
