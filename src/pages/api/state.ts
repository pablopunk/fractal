import type { APIRoute } from "astro";
import { getSettings, listProjects, listPrompts } from "~/lib/server/store.js";
import { HOME } from "~/lib/server/fs.js";
import { withPromptsStatus } from "~/lib/server/prompt-status.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.json({
    home: HOME,
    projects: listProjects(),
    prompts: await withPromptsStatus(listPrompts()),
    settings: getSettings(),
  });
};
