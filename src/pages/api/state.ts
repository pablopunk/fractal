import type { APIRoute } from "astro";
import { HOME } from "~/lib/server/fs.js";
import { getPrDetails } from "~/lib/server/git.js";
import { withPromptsStatus } from "~/lib/server/prompt-status.js";
import {
  getSettings,
  getUiState,
  listProjects,
  listPrompts,
  updatePrompt,
} from "~/lib/server/store.js";
import { listSessions } from "~/lib/server/tmux.js";

export const prerender = false;

async function resolvePrUrls() {
  const allPrompts = listPrompts();
  const worktreePrompts = allPrompts.filter(
    (p) => p.runMode === "worktree" && p.branch && !p.prUrl && !p.isArchived,
  );
  if (worktreePrompts.length === 0) return;

  const projects = listProjects();
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  await Promise.allSettled(
    worktreePrompts.map(async (prompt) => {
      const project = projectMap.get(prompt.projectId);
      if (!project) return;
      const branch = prompt.branch;
      if (!branch) return;
      const details = await getPrDetails(project.path, branch);
      if (details?.url) {
        updatePrompt(prompt.id, { prUrl: details.url } as never);
      }
    }),
  );
}

export const GET: APIRoute = async () => {
  const terminalSessions = await listSessions().catch(() => null);

  // Resolve PR URLs for worktree prompts (fire-and-forget, best-effort)
  resolvePrUrls().catch(() => {});

  return Response.json({
    home: HOME,
    projects: listProjects(),
    prompts: await withPromptsStatus(listPrompts()),
    settings: getSettings(),
    uiState: getUiState(),
    terminalSessions,
  });
};
