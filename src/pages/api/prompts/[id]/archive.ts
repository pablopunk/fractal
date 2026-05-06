import type { APIRoute } from "astro";
import { getPrompt, getProject, updatePrompt } from "~/lib/server/store.js";
import { hasPullRequest, isBranchMerged, removeWorktree } from "~/lib/server/git.js";
import { killSession } from "~/lib/server/tmux.js";
import { existsSync } from "node:fs";

export const prerender = false;

/**
 * Archive a prompt without deleting it.
 * This is useful for keeping history while cleaning up the board.
 */
export const POST: APIRoute = async ({ params }) => {
  const id = params.id!;
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });

  let merged = false;
  let hasPr = false;

  if (prompt.runMode === "worktree" && prompt.branch && prompt.projectId) {
    const project = getProject(prompt.projectId);
    if (project) {
      [merged, hasPr] = await Promise.all([
        isBranchMerged(project.path, prompt.branch),
        hasPullRequest(project.path, prompt.branch),
      ]);

      if (!merged && !hasPr) {
        return Response.json(
          {
            error: "This worktree can't be marked as done yet.",
            detail: "Merge it into the default branch or create a GitHub PR first.",
          },
          { status: 409 },
        );
      }
    }
  }

  // Close tmux session for any task type once all requirements are met
  if (prompt.tmuxSession) {
    try {
      await killSession(prompt.tmuxSession);
    } catch (e) {
      // Log but don't fail if session killing fails
      console.error(`Failed to kill tmux session ${prompt.tmuxSession}:`, e);
    }
  }

  // Clean up worktree if branch has been merged
  if (prompt.runMode === "worktree" && prompt.worktreePath && prompt.projectId && merged) {
    const project = getProject(prompt.projectId);
    if (project && existsSync(prompt.worktreePath)) {
      try {
        await removeWorktree(project.path, prompt.worktreePath);
      } catch (e) {
        // Log but don't fail if worktree removal fails
        console.error(`Failed to remove worktree ${prompt.worktreePath}:`, e);
      }
    }
  }

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
