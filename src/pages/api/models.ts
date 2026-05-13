import type { APIRoute } from "astro";
import { listClaudeModels, listPiModels } from "~/lib/server/agents.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const piModels = await listPiModels().catch(() => []);
    const claudeModels = listClaudeModels();
    return Response.json({ models: piModels, claudeModels, allModels: [...piModels, ...claudeModels] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
};
