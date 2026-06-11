import type { APIRoute } from "astro";
import { HOME } from "~/lib/server/fs.js";
import { withPromptsStatus } from "~/lib/server/prompt-status.js";
import { getSettings, getUiState, listProjects, listPrompts } from "~/lib/server/store.js";
import { listSessions } from "~/lib/server/tmux.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  const terminalSessions = await listSessions().catch(() => null);
  return Response.json({
    home: HOME,
    projects: listProjects(),
    prompts: await withPromptsStatus(listPrompts()),
    settings: getSettings(),
    uiState: getUiState(),
    terminalSessions,
  });
};
