import type { APIRoute } from "astro";
import { getProject, getPrompt, getSettings, updatePrompt } from "~/lib/server/store.js";
import { launchInWorktree } from "~/lib/server/worktree.js";
import { withPromptStatus } from "~/lib/server/prompt-status.js";

export const prerender = false;

export const POST: APIRoute = async ({ params }) => {
  const id = params.id!;
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });
  const project = getProject(prompt.projectId);
  if (!project) return Response.json({ error: "project missing" }, { status: 404 });
  try {
    const settings = getSettings();
    const preset = settings.agentPresets.find((p) => p.id === prompt.presetId) ?? settings.agentPresets[0];
    if (!preset) throw new Error("No agent preset configured");
    const result = await launchInWorktree({
      projectPath: project.path,
      projectName: project.name,
      promptId: prompt.id,
      prompt: prompt.text,
      preset,
    });
    const updated = updatePrompt(id, {
      column: "RUN_IN_WORKTREE",
      runMode: "worktree",
      branch: result.branch,
      worktreePath: result.worktreePath,
      tmuxSession: result.tmuxSession,
      launchedAt: new Date(),
      error: null,
    } as never);
    return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const updated = updatePrompt(id, { error: msg } as never);
    return Response.json({ error: msg, prompt: updated ? await withPromptStatus(updated) : updated }, { status: 500 });
  }
};
