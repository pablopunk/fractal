import type { APIRoute } from "astro";
import { summarizePromptText } from "~/lib/server/ai-helper.js";
import { getProject, getPrompt, getSettings, updatePrompt } from "~/lib/server/store.js";
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
    const preset = settings.agentPresets.find((p) => p.id === settings.helperPresetId);
    if (!preset) return Response.json({ prompt: await withPromptStatus(prompt) });
    const summary = await summarizePromptText({ preset, cwd: project.path, text: prompt.text });
    const updated = updatePrompt(id, { summary: summary || null } as never);
    return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
