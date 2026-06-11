import type { APIRoute } from "astro";
import { fetchGithubIssues } from "~/lib/server/github-issues.js";
import { getProject } from "~/lib/server/store.js";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id!;
  const project = getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  if (!project.githubRepo) return Response.json({ issues: [] });

  const issues = await fetchGithubIssues(project.githubRepo);
  return Response.json({ issues });
};
