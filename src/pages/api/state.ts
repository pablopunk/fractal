import type { APIRoute } from "astro";
import { listProjects, listPrompts } from "~/lib/server/store.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.json({
    projects: listProjects(),
    prompts: listPrompts(),
  });
};
