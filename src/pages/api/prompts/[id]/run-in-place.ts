import type { APIRoute } from "astro";
import { getProject, getPrompt, getSettings, updatePrompt } from "~/lib/server/store.js";
import { resolvePromptModel } from "~/lib/server/pi.js";
import { launchInPlace } from "~/lib/server/worktree.js";

export const prerender = false;

export const POST: APIRoute = async ({ params }) => {
  const id = params.id!;
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });
  const project = getProject(prompt.projectId);
  if (!project) return Response.json({ error: "project missing" }, { status: 404 });
  try {
    const model = resolvePromptModel(prompt.modelProfile ?? "smart", getSettings());
    const result = await launchInPlace({
      projectPath: project.path,
      projectName: project.name,
      promptId: prompt.id,
      prompt: prompt.text,
      model,
    });
    const updated = updatePrompt(id, {
      column: "RUN_IN_PLACE",
      runMode: "in_place",
      tmuxSession: result.tmuxSession,
      launchedAt: new Date(),
      error: null,
    } as never);
    return Response.json({ prompt: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const updated = updatePrompt(id, { error: msg } as never);
    return Response.json({ error: msg, prompt: updated }, { status: 500 });
  }
};
