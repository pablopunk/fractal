import type { APIRoute } from "astro";
import { deleteProject, getProject } from "~/lib/server/store.js";

export const prerender = false;

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id!;
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });
  deleteProject(id);
  return Response.json({ ok: true });
};
