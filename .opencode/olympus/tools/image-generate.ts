/**
 * olympus-image Tool — v0.0.32: the background image lane for agents.
 *
 * The Atelier is no longer a left-menu surface: it is an API. A god that
 * needs a hero image, an icon or a texture calls this tool; the app's
 * `/api/olympus/atelier/generate` runs the provider ladder and stores the
 * result in the Media Vault. With `projectPath`, the asset is also injected
 * into `<project>/public/assets/` (the check-9 contract) and the returned
 * reference is root-relative.
 *
 * Providers (availability is decided by the keys in hand, never guessed):
 *   - pollinations/flux        free, always on
 *   - byok/sdxl-turbo          FAL_KEY, ~$0.0002/img (draft)
 *   - byok/flux-schnell        FAL_KEY, ~$0.003/img  (draft)
 *   - byok/nano-banana-edit    FAL_KEY, ~$0.02/img   (edit)
 *   - byok/nano-banana         GOOGLE_AI_KEY, ~$0.02/img (final)
 *
 * A locked lane is refused by name (the key), never silently downgraded.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";

const APP = process.env.OLYMPUS_APP_URL || "http://127.0.0.1:3737";
const TIMEOUT_MS = 190_000;

interface GenResponse {
  ok?: boolean;
  asset?: { id?: string; path?: string; url?: string; mime?: string };
  model?: string;
  provider?: string;
  error?: string;
  needsKey?: string | null;
}

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${APP}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 300) }; }
}

const IMAGE_TOOL: ToolDefinition = tool({
  description:
    "Generate an image with the OLYMPUS background image lane (free Pollinations by default; BYOK fal/Google lanes when the key is configured). Optionally injects the asset into a project's public/assets. Use it for hero images, icons, textures and empty-state art when the design calls for a generated visual.",
  args: {
    prompt: tool.schema.string().describe("The image prompt — subject, style, lighting, composition. Be concrete; the lane does not infer the project's design tokens."),
    model: tool.schema.string().optional().describe("Lane id from the catalog (e.g. pollinations/flux, byok/flux-schnell, byok/nano-banana). Omit for the best available draft."),
    width: tool.schema.number().int().optional().describe("Width in pixels (default 1024)"),
    height: tool.schema.number().int().optional().describe("Height in pixels (default 1024)"),
    seed: tool.schema.number().int().optional().describe("Seed for reproducibility"),
    projectPath: tool.schema.string().optional().describe("Absolute project path — inject the asset into <project>/public/assets and return the root-relative reference"),
    name: tool.schema.string().optional().describe("Kebab-case asset name when injecting (default: the asset id)"),
  },
  execute: async (args) => {
    try {
      const gen: GenResponse = await postJson("/api/olympus/atelier/generate", {
        prompt: args.prompt,
        ...(args.model ? { model: args.model } : {}),
        ...(args.width ? { width: args.width } : {}),
        ...(args.height ? { height: args.height } : {}),
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
      });
      if (!gen?.ok) {
        return {
          output: JSON.stringify({
            ok: false,
            error: gen?.error ?? "generation failed",
            ...(gen?.needsKey ? { needsKey: gen.needsKey, hint: "Add the key in the API Keys dialog; the free lane stays available." } : {}),
          }, null, 2),
        };
      }
      const assetId = gen.asset?.id ?? null;
      let injected: { ok?: boolean; ref?: string; path?: string; error?: string } | null = null;
      if (assetId && args.projectPath) {
        injected = await postJson("/api/olympus/atelier/inject", {
          assetId,
          projectPath: args.projectPath,
          ...(args.name ? { name: args.name } : {}),
        });
      }
      return {
        output: JSON.stringify({
          ok: true,
          assetId,
          path: gen.asset?.path ?? gen.asset?.url ?? null,
          model: gen.model ?? args.model ?? null,
          provider: gen.provider ?? null,
          ...(injected ? { injected } : {}),
          message: injected?.ok
            ? `Image generated and injected as ${injected.ref}. Cite the root-relative reference in the page.`
            : "Image generated in the Media Vault. Pass projectPath to inject it into the project.",
        }, null, 2),
      };
    } catch (err: any) {
      const offline = /ECONNREFUSED|fetch failed|timed out|aborted/i.test(String(err?.message));
      return {
        output: JSON.stringify({
          ok: false,
          error: offline
            ? `The OLYMPUS app is not answering at ${APP} — start it (olympus dev) or run the art-generate skill instead.`
            : (err?.message || String(err)),
        }, null, 2),
      };
    }
  },
});

export default IMAGE_TOOL;
