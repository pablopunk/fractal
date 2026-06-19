import type { APIRoute } from "astro";
import { listPiModels } from "~/lib/server/agents.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const models = await listPiModels();
    return Response.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
};
