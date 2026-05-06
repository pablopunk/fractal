import type { APIRoute } from "astro";
import { resolve } from "node:path";
import { createProject, getProjectByPath, listProjects } from "~/lib/server/store.js";
import { getRepoName } from "~/lib/server/git.js";

export const prerender = false;

export const GET: APIRoute = async () => Response.json({ projects: listProjects() });

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { path?: string; name?: string };
  if (!body.path) return Response.json({ error: "path required" }, { status: 400 });
  const abs = resolve(body.path.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  const existing = getProjectByPath(abs);
  if (existing) return Response.json({ project: existing });
  const name = body.name?.trim() || (await getRepoName(abs));
  const project = createProject({ name, path: abs });
  return Response.json({ project });
};
