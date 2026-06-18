import type { APIRoute } from "astro";
import { withPromptStatus, withPromptsStatus } from "~/lib/server/prompt-status.js";
import { createPrompt, getProject, listPrompts } from "~/lib/server/store.js";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "not found" }, { status: 404 });
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ prompts: await withPromptsStatus(listPrompts(id)) });
};

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "not found" }, { status: 404 });
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    imagePaths?: string[];
    modelProfile?: "fast" | "smart";
    presetId?: string;
    issueRef?: string;
  };
  const text = body.text?.trim();
  const imagePaths = Array.isArray(body.imagePaths)
    ? body.imagePaths.filter((p) => typeof p === "string" && p.trim())
    : [];
  if (!text && imagePaths.length === 0)
    return Response.json({ error: "text or image required" }, { status: 400 });
  const prompt = createPrompt({
    projectId: id,
    text: text ?? "",
    imagePaths,
    modelProfile: body.modelProfile,
    presetId: body.presetId,
    issueRef: body.issueRef,
  });
  return Response.json({ prompt: await withPromptStatus(prompt) });
};
