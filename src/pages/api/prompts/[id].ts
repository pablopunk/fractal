import type { APIRoute } from "astro";
import { getPrompt, updatePrompt } from "~/lib/server/store.js";
import { cleanupPromptById, checkCleanupSafety } from "~/lib/server/cleanup.js";
import { withPromptStatus } from "~/lib/server/prompt-status.js";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  if (!getPrompt(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { text?: string; isArchived?: boolean; modelProfile?: "fast" | "smart"; presetId?: string; column?: "PROMPTS" | "RUN_IN_PLACE" | "RUN_IN_WORKTREE" };
  const patch: Record<string, unknown> = {};
  if (typeof body.text === "string") {
    patch.text = body.text;
    patch.summary = null;
  }
  if (typeof body.isArchived === "boolean") patch.isArchived = body.isArchived;
  if (body.modelProfile === "fast" || body.modelProfile === "smart") patch.modelProfile = body.modelProfile;
  if (typeof body.presetId === "string") patch.presetId = body.presetId;
  if (body.column === "PROMPTS" || body.column === "RUN_IN_PLACE" || body.column === "RUN_IN_WORKTREE") patch.column = body.column;
  const prompt = updatePrompt(id, patch as never);
  return Response.json({ prompt: prompt ? await withPromptStatus(prompt) : prompt });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });
  
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const force = body.force === true;

  try {
    // Check for uncommitted changes first
    if (!force) {
      const safety = await checkCleanupSafety(prompt);
      if (!safety.canDelete) {
        return Response.json(
          { 
            error: "Worktree has uncommitted changes",
            hasUncommitted: safety.hasUncommitted,
            changes: safety.changes,
          },
          { status: 409 }
        );
      }
    }

    await cleanupPromptById(id, force);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
