import type { APIRoute } from "astro";
import { cleanupPrompt } from "~/lib/server/cleanup.js";
import { getProject, listPrompts } from "~/lib/server/store.js";

export const prerender = false;

export const DELETE: APIRoute = async ({ params }) => {
  const projectId = params.id!;
  if (!getProject(projectId)) return Response.json({ error: "not found" }, { status: 404 });

  const donePrompts = listPrompts(projectId).filter((prompt) => prompt.isArchived);
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const prompt of donePrompts) {
    try {
      await cleanupPrompt(prompt, true);
      deleted.push(prompt.id);
    } catch (e) {
      failed.push({ id: prompt.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({ deleted, failed });
};
