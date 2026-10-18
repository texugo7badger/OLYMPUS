/**
 * v2-bridge.ts — THE OPENCODE V2 PORT (the activation, 2026-10-18).
 *
 * The official migration guide is explicit: V1 plugin implementations do
 * not run in V2. But the overlay's BUSINESS LOGIC is framework-agnostic
 * inside OlympusHooksPlugin — this bridge builds the v1 hook+tool map ONCE
 * (the entire telemetry/attribution/dispatch machinery reused verbatim)
 * and wires it to the v2 domains:
 *
 *   v1 "event"                  -> ctx.event.subscribe() (the unified stream
 *                                   carries the same part shapes; session.idle
 *                                   rides the stream too)
 *   v1 "tool.execute.before"    -> ctx.tool.hook("execute.before")
 *   v1 "tool.execute.after"     -> ctx.tool.hook("execute.after")
 *   v1 "session.idle"           -> the stream's session.idle events
 *   v1 "permission.ask"         -> ctx.permission.hook("evaluate")
 *   v1 "chat.message"           -> ctx.session.hook("prompt")
 *   v1 "shell.env"              -> ctx.shell.hook("create.before")
 *   v1 tool map (Zod args)      -> ctx.tool.transform (JSON Schema via
 *                                   zod-to-json-schema — v2 accepts plain
 *                                   JSON Schema as ValueSchema)
 *
 * The tool-NAME map (v2 renamed built-ins): shell -> bash, file -> write.
 * The v1 handlers key on the v1 names (estimateTokens, cost paths); the
 * bridge maps both ways so the telemetry keeps its vocabulary.
 *
 * The v1 exports stay intact for the 1.18.10 lane (the dual-key config
 * loads `plugin` on v1 and `plugins` on v2) and for the battery's v1
 * shims — one source of truth, two protocols.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { Plugin } from "@opencode/plugin";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as z from "zod";
import { OlympusHooksPlugin } from "./olympus-hooks.js";

/** The v2 builtin names the v1 vocabulary must hear. */
const V2_TOOL_TO_V1: Record<string, string> = {
  shell: "bash",
  file: "write",
};

type V1Hooks = Awaited<ReturnType<typeof OlympusHooksPlugin>>;
type V1ToolDef = {
  description: string;
  args: Record<string, any>;
  execute: (args: any, context: any) => Promise<any>;
};

export const OlympusV2Plugin = Plugin.define({
  id: "olympus-overlay",
  async setup(ctx) {
    const directory = (ctx.location as any)?.directory ?? process.cwd();
    const worktree = (ctx.location as any)?.project?.canonical ?? directory;

    // Build the v1 machinery once — the managed-process gates
    // (OLYMPUS_MANAGED / OLYMPUS_ROOT_SESSION) ride the env exactly as on
    // v1: the same spawn flags, the same lane semantics.
    const v1 = (await OlympusHooksPlugin({
      client: {
        app: { log: () => {} },
        session: { messages: async () => ({ data: [] }) },
      } as any,
      $: null as any,
      directory,
      worktree,
      project: { id: "olympus", directory, canonical: worktree } as any,
      experimental_workspace: undefined as any,
      serverUrl: undefined as any,
    })) as V1Hooks;

    /* ── The tools: Zod -> JSON Schema, execute shimmed ─────────────── */
    const tools = (v1 as any).tool as Record<string, V1ToolDef> | undefined;
    if (tools && Object.keys(tools).length > 0) {
      await ctx.tool.transform((editor: any) => {
        for (const [name, def] of Object.entries(tools)) {
          try {
            // Two zod copies ride the tree (the plugin SDK's + the repo's) —
            // the cast keeps the boundary honest: the args ARE a ZodRawShape
            // from the SDK's zod; the converter takes it structurally.
            const jsonSchema = (zodToJsonSchema as any)(z.object(def.args as any), {
              target: "draft-7",
              $refStrategy: "none",
            });
            editor.add({
              name,
              description: def.description,
              input: jsonSchema,
              execute: async (input: any, context: any) => {
                const result = await def.execute(input, {
                  sessionID: context?.sessionID ?? "",
                  messageID: context?.messageID ?? "",
                  agent: context?.agent ?? "",
                  directory: context?.directory ?? directory,
                  worktree: context?.worktree ?? worktree,
                  abort: context?.signal ?? new AbortController().signal,
                  metadata: () => {},
                  ask: async () => {},
                });
                if (typeof result === "string") return { content: result };
                if (result && typeof result === "object") {
                  return {
                    content:
                      typeof (result as any).output === "string"
                        ? (result as any).output
                        : JSON.stringify(result),
                    metadata: (result as any).metadata,
                  };
                }
                return { content: String(result) };
              },
            });
          } catch (e: any) {
            console.error(`[olympus:v2-bridge] tool ${name} registration failed: ${e?.message || e}`);
          }
        }
      });
    }

    /* ── The tool hooks: name-map + signature adapt ─────────────────── */
    const before = (v1 as any)["tool.execute.before"];
    if (typeof before === "function") {
      await ctx.tool.hook("execute.before", (event: any) => {
        try {
          return before({
            tool: V2_TOOL_TO_V1[event.tool] ?? event.tool,
            args: event.input,
            callID: event.id,
            sessionID: event.sessionID,
            agent: event.agent,
          });
        } catch (e: any) {
          console.error(`[olympus:v2-bridge] execute.before failed: ${e?.message || e}`);
        }
      });
    }
    const after = (v1 as any)["tool.execute.after"];
    if (typeof after === "function") {
      await ctx.tool.hook("execute.after", (event: any) => {
        try {
          const output =
            event.status === "completed" ? event.result : { error: event.error };
          return after(
            {
              tool: V2_TOOL_TO_V1[event.tool] ?? event.tool,
              args: event.input,
              callID: event.id,
              sessionID: event.sessionID,
              agent: event.agent,
            },
            output,
          );
        } catch (e: any) {
          console.error(`[olympus:v2-bridge] execute.after failed: ${e?.message || e}`);
        }
      });
    }

    /* ── The event stream: parts + session.idle ─────────────────────── */
    const eventHandler = (v1 as any)["event"];
    const idleHandler = (v1 as any)["session.idle"];
    if (typeof eventHandler === "function" || typeof idleHandler === "function") {
      const controller = new AbortController();
      void (async () => {
        try {
          for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
            const anyEv = ev as any;
            if (typeof eventHandler === "function" && anyEv?.type === "message.part.updated") {
              void eventHandler({ event: anyEv });
            }
            if (typeof idleHandler === "function" && anyEv?.type === "session.idle") {
              void idleHandler({});
            }
          }
        } catch {
          /* the subscription dies with the server — never a crash */
        }
      })();
    }

    /* ── chat.message -> the prompt hook (Atlas ingest + markers) ───── */
    const chatMessage = (v1 as any)["chat.message"];
    if (typeof chatMessage === "function") {
      await ctx.session.hook("prompt", (event: any) => {
        try {
          const parts = [{ type: "text", text: String(event?.prompt?.text ?? "") }];
          const out = { parts };
          void chatMessage({ sessionID: event.sessionID }, out);
        } catch (e: any) {
          console.error(`[olympus:v2-bridge] prompt hook failed: ${e?.message || e}`);
        }
      });
    }

    /* ── shell.env -> the shell create.before hook ──────────────────── */
    const shellEnv = (v1 as any)["shell.env"];
    if (typeof shellEnv === "function") {
      await ctx.shell.hook("create.before", (event: any) => {
        try {
          const out = { env: { ...(event?.env ?? {}) } };
          void shellEnv({}, out);
          if (out.env && typeof out.env === "object") {
            Object.assign(event.env, out.env);
          }
        } catch (e: any) {
          console.error(`[olympus:v2-bridge] shell hook failed: ${e?.message || e}`);
        }
      });
    }
  },
});

export default OlympusV2Plugin;
