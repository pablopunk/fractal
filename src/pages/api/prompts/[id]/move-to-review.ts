import { existsSync } from "node:fs";
import type { APIRoute } from "astro";
import { generatePrDescription } from "~/lib/server/ai-helper.js";
import { classifyError } from "~/lib/server/api-errors.js";
import { exec } from "~/lib/server/exec.js";
import {
  createPullRequest,
  getUncommittedChanges,
  hasUncommittedChanges,
} from "~/lib/server/git.js";
import { withPromptStatus } from "~/lib/server/prompt-status.js";
import { getProject, getPrompt, getSettings, updatePrompt } from "~/lib/server/store.js";

export const prerender = false;

/**
 * Move a prompt into the REVIEW column.
 * Creates a PR if one doesn't exist (AI-generated title/body).
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

    // Check for uncommitted changes
    if (existsSync(prompt.worktreePath)) {
      const hasChanges = await hasUncommittedChanges(prompt.worktreePath);
      if (hasChanges) {
        const changes = await getUncommittedChanges(prompt.worktreePath);
        return Response.json(
          {
            error: "Commit or stash uncommitted changes before creating a PR.",
            hasUncommitted: true,
            changes,
          },
          { status: 409 },
        );
      }
    }

    let prUrl = prompt.prUrl;

    // Create PR if none exists
    if (!prUrl) {
      // Generate AI description
      const settings = getSettings();
      const aiPreset =
        settings.agentPresets.find((p) => p.id === settings.helperPresetId) ??
        settings.agentPresets[0];
      if (!aiPreset) throw new Error("No agent preset configured");

      let title: string;
      let body: string;
      try {
        const desc = await generatePrDescription({
          preset: aiPreset,
          worktreePath: prompt.worktreePath,
          promptText: prompt.text,
          projectPath: project.path,
          branch: prompt.branch,
          tmuxSession: prompt.tmuxSession,
        });
        title = desc.title;
        body = desc.body;
      } catch {
        // Fallback: use first line of prompt as title
        title = prompt.text.slice(0, 240).split("\n")[0].trim() || prompt.branch;
        body = "";
      }

      // Push branch to origin first — PR creation requires the branch on the remote
      await exec("git", ["-C", project.path, "push", "-u", "origin", prompt.branch], {
        timeoutMs: 30000,
      });
      const pr = await createPullRequest(project.path, prompt.branch, title, body || undefined);
      prUrl = pr.url;
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
