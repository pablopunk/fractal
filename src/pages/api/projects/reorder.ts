import type { APIRoute } from "astro";
import { reorderProjects } from "~/lib/server/store.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(body.ids)) return Response.json({ error: "ids required" }, { status: 400 });
  return Response.json({ projects: reorderProjects(body.ids) });
};
