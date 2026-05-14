import type { APIRoute } from "astro";
import { getProject } from "~/lib/server/store.js";
import { ensureSession, sanitizeSessionName } from "~/lib/server/tmux.js";

export const prerender = false;

export const POST: APIRoute = async ({ params }) => {
  const id = params.id!;
  const project = getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  try {
    const session = sanitizeSessionName(project.name);
    await ensureSession(session, project.path);
    return Response.json({ session, title: project.name });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
};
