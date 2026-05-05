import type { APIRoute } from "astro";
import { listPiModels } from "~/lib/server/pi.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const models = await listPiModels();
    return Response.json({ models });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
};
