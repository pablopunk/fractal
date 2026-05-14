import type { APIRoute } from "astro";
import { listClaudeModels, listOpenCodeModels, listPiModels } from "~/lib/server/agents.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const piModels = await listPiModels().catch(() => []);
    const claudeModels = listClaudeModels();
    const opencodeModels = await listOpenCodeModels().catch(() => []);
    return Response.json({ models: piModels, claudeModels, opencodeModels, allModels: [...piModels, ...claudeModels, ...opencodeModels] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
};
