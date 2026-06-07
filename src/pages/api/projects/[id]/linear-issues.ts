import type { APIRoute } from "astro";
import { getProject } from "~/lib/server/store.js";
import { fetchLinearIssues } from "~/lib/server/linear-issues.js";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id!;
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });

  const issues = await fetchLinearIssues();
  return Response.json({ issues });
};
