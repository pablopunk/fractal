import type { APIRoute } from "astro";
import { deletePrompt, getPrompt, updatePrompt } from "~/lib/server/store.js";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  if (!getPrompt(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const patch: Record<string, unknown> = {};
  if (typeof body.text === "string") patch.text = body.text;
  const prompt = updatePrompt(id, patch as never);
  return Response.json({ prompt });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id!;
  if (!getPrompt(id)) return Response.json({ error: "not found" }, { status: 404 });
  deletePrompt(id);
  return Response.json({ ok: true });
};
