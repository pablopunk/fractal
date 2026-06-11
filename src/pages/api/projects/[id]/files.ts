import type { APIRoute } from "astro";
import { listProjectFiles } from "~/lib/server/project-files.js";
import { getProject } from "~/lib/server/store.js";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const id = params.id!;
  const project = getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  const requestedLimit = Number(url.searchParams.get("limit") ?? 1000);
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 1000, 1),
    5000,
  );
  const files = await listProjectFiles(project.path, limit);
  return Response.json({ files });
};
