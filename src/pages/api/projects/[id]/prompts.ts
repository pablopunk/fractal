import type { APIRoute } from "astro";
import { createPrompt, getProject, listPrompts } from "~/lib/server/store.js";
import { withPromptStatus, withPromptsStatus } from "~/lib/server/prompt-status.js";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id!;
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ prompts: await withPromptsStatus(listPrompts(id)) });
};

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { text?: string; modelProfile?: "fast" | "smart"; presetId?: string };
  const text = body.text?.trim();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const prompt = createPrompt({ projectId: id, text, modelProfile: body.modelProfile, presetId: body.presetId });
  return Response.json({ prompt: await withPromptStatus(prompt) });
};
