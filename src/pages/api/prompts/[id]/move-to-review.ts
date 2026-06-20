import type { APIRoute } from "astro";
import { classifyError } from "~/lib/server/api-errors.js";
import { getPrDetails } from "~/lib/server/git.js";
import { withPromptStatus } from "~/lib/server/prompt-status.js";
import { getProject, getPrompt, updatePrompt } from "~/lib/server/store.js";

export const prerender = false;

/**
 * Move a prompt into the REVIEW column.
 * Only succeeds if a PR already exists on the branch.
 * Fractal does NOT create PRs — they must be created externally (by the agent or user).
 * Does NOT kill the tmux session — the agent stays alive during review.
 */
export const POST: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return Response.json({ error: "not found" }, { status: 404 });
    const prompt = getPrompt(id);
    if (!prompt) return Response.json({ error: "not found" }, { status: 404 });

    // V1: worktree only
    if (prompt.runMode !== "worktree" || !prompt.branch || !prompt.worktreePath) {
      return Response.json(
        { error: "REVIEW requires a worktree — launch in worktree first" },
        { status: 400 },
      );
    }

    const project = getProject(prompt.projectId);
    if (!project) return Response.json({ error: "project not found" }, { status: 404 });

    // Check if a PR already exists on this branch
    let prUrl = prompt.prUrl;
    if (!prUrl) {
      const prDetails = await getPrDetails(project.path, prompt.branch);
      if (!prDetails) {
        return Response.json(
          { error: "No PR found — create a PR on this branch first (gh pr create)" },
          { status: 409 },
        );
      }
      prUrl = prDetails.url;
    }

    // Store prUrl and set column to REVIEW atomically
    const updated = updatePrompt(id, {
      column: "REVIEW",
      prUrl,
      prCiStatus: null,
      prReviewCount: null,
      prHasConflicts: null,
    } as never);

    return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
  } catch (e) {
    const { status, error, retryable } = classifyError(e);
    return Response.json({ error, ...(retryable ? { retryable } : {}) }, { status });
  }
};
