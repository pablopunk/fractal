import type { APIRoute } from "astro";
import { deleteProject, getProject, updateProject } from "~/lib/server/store.js";

export const prerender = false;

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id!;
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });
  deleteProject(id);
  return Response.json({ ok: true });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  if (!getProject(id)) return Response.json({ error: "not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("icon");
  if (!(file instanceof File)) return Response.json({ error: "icon file required" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "icon must be an image" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const project = updateProject(id, {
    icon: bytes.toString("base64"),
    iconMime: file.type || "application/octet-stream",
  });
  return Response.json({ project });
};
