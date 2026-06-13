import type { APIRoute } from "astro";
import { withPromptStatus } from "~/lib/server/prompt-status.js";
import { getProject, getPrompt, getSettings, updatePrompt } from "~/lib/server/store.js";
import { hasSession, isMissingTmuxError, TMUX_MISSING_MESSAGE } from "~/lib/server/tmux.js";
import { launchInPlace } from "~/lib/server/worktree.js";

export const prerender = false;

function classifyError(e: unknown): { status: number; error: string; retryable?: boolean } {
  if (e instanceof Error && e.message.includes("SQLITE_BUSY")) {
    return { status: 503, error: "database is locked", retryable: true };
  }
  if (isMissingTmuxError(e)) {
    return { status: 500, error: TMUX_MISSING_MESSAGE };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 500, error: msg };
}

export const POST: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "not found" }, { status: 404 });
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });
  const project = getProject(prompt.projectId);
  if (!project) return Response.json({ error: "project missing" }, { status: 404 });
  try {
    // Idempotency: if already running with a live session, return current state
    if (prompt.tmuxSession && (await hasSession(prompt.tmuxSession))) {
      return Response.json({ prompt: await withPromptStatus(prompt) });
    }

    const settings = getSettings();
    const preset =
      settings.agentPresets.find((p) => p.id === prompt.presetId) ?? settings.agentPresets[0];
    if (!preset) throw new Error("No agent preset configured");

    const result = await launchInPlace({
      projectPath: project.path,
      projectName: project.name,
      promptId: prompt.id,
      prompt: prompt.text,
      imagePaths: prompt.imagePaths,
      preset,
      spawnAgent: true,
    });
    const updated = updatePrompt(id, {
      column: "RUN_IN_PLACE",
      runMode: "in_place",
      tmuxSession: result.tmuxSession,
      launchedAt: new Date(),
      error: null,
      isArchived: false,
    } as never);
    return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
  } catch (e) {
    const { status, error, retryable } = classifyError(e);
    const updated = updatePrompt(id, { error } as never);
    const promptResult = updated ? await withPromptStatus(updated) : updated;
    return Response.json(
      { error, prompt: promptResult, ...(retryable ? { retryable } : {}) },
      { status },
    );
  }
};
