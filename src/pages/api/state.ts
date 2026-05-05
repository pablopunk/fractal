import type { APIRoute } from "astro";
import { listProjects, listPrompts } from "~/lib/server/store.js";
import { HOME } from "~/lib/server/fs.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.json({
    home: HOME,
    projects: listProjects(),
    prompts: listPrompts(),
  });
};
