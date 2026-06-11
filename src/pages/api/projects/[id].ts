import type { APIRoute } from "astro";
import { detectGithubRepo } from "~/lib/server/github-issues.js";
import { deleteProject, getProject, updateProject } from "~/lib/server/store.js";

export const prerender = false;

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id!;
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });
  deleteProject(id);
  return Response.json({ ok: true });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  const existing = getProject(id);
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("icon");
    if (!(file instanceof File))
      return Response.json({ error: "icon file required" }, { status: 400 });
    if (!file.type.startsWith("image/"))
      return Response.json({ error: "icon must be an image" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const project = updateProject(id, {
      icon: bytes.toString("base64"),
      iconMime: file.type || "application/octet-stream",
    });
    return Response.json({ project });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    defaultPresetId?: string | null;
    githubRepo?: string | null;
    showGithubIssues?: boolean;
    showLinearIssues?: boolean;
    detectGithub?: boolean;
  };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.defaultPresetId !== undefined) patch.defaultPresetId = body.defaultPresetId || null;
  if (body.githubRepo !== undefined) patch.githubRepo = body.githubRepo || null;
  if (body.showGithubIssues !== undefined) patch.showGithubIssues = body.showGithubIssues ? 1 : 0;
  if (body.showLinearIssues !== undefined) patch.showLinearIssues = body.showLinearIssues ? 1 : 0;

  if (body.detectGithub) {
    const repo = await detectGithubRepo(existing.path);
    patch.githubRepo = repo || existing.githubRepo;
  }

  const project = updateProject(id, patch);
  return Response.json({ project });
};
