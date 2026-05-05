import type { APIRoute } from "astro";
import { getPrompt, updatePrompt } from "~/lib/server/store.js";

export const prerender = false;

/**
 * Archive a prompt without deleting it.
 * This is useful for keeping history while cleaning up the board.
 */
export const POST: APIRoute = async ({ params }) => {
  const id = params.id!;
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });

  const updated = updatePrompt(id, { isArchived: true } as never);
  return Response.json({ prompt: updated });
};

/**
 * Unarchive a prompt
 */
export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id!;
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });

  const updated = updatePrompt(id, { isArchived: false } as never);
  return Response.json({ prompt: updated });
};
