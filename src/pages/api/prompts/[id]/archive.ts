import { existsSync } from "node:fs";
import type { APIRoute } from "astro";
import { classifyError } from "~/lib/server/api-errors.js";
import type { Prompt } from "~/lib/server/db/schema.js";
import {
  createPullRequest,
  getUncommittedChanges,
  hasPullRequest,
  hasUncommittedChanges,
  isBranchMerged,
  mergeBranchToDefault,
  removeWorktree,
} from "~/lib/server/git.js";
import { withPromptStatus } from "~/lib/server/prompt-status.js";
import { getProject, getPrompt, updatePrompt } from "~/lib/server/store.js";
import { killSession } from "~/lib/server/tmux.js";

export const prerender = false;

async function buildWorktreeStatus(projectPath: string, branch: string, worktreePath: string) {
  const [hasUncommitted, merged, hasPr, changes] = await Promise.all([
    existsSync(worktreePath) ? hasUncommittedChanges(worktreePath) : Promise.resolve(false),
    isBranchMerged(projectPath, branch),
    hasPullRequest(projectPath, branch),
    existsSync(worktreePath) ? getUncommittedChanges(worktreePath) : Promise.resolve([]),
  ]);
  return { hasUncommitted, merged, hasPr, changes };
}

function archiveError(detail: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: "Cannot mark as done", detail, ...extra }, { status });
}

async function completeArchive(prompt: Prompt, projectPath: string) {
  const warnings: Array<{ resource: string; id: string; error: string }> = [];

  if (prompt?.tmuxSession) {
    try {
      await killSession(prompt?.tmuxSession);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push({ resource: "tmux-session", id: prompt.tmuxSession, error: msg });
    }
  }

  let worktreePath = prompt?.worktreePath;
  if (prompt?.runMode === "worktree" && prompt?.worktreePath && existsSync(prompt?.worktreePath)) {
    try {
      const dirty = await hasUncommittedChanges(prompt?.worktreePath);
      if (!dirty) {
        await removeWorktree(projectPath, prompt?.worktreePath);
        worktreePath = null;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push({ resource: "worktree", id: prompt.worktreePath, error: msg });
    }
  }

  const updated = updatePrompt(prompt?.id, {
    isArchived: true,
    tmuxSession: null,
    worktreePath,
  } as never);
  if (!updated) return { prompt: updated, warnings: warnings.length ? warnings : undefined };
  return {
    prompt: await withPromptStatus(updated),
    warnings: warnings.length ? warnings : undefined,
  };
}

/**
 * Archive a prompt.
 * Optionally accepts { action } to create a PR, merge to main, or discard (force-remove worktree).
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return Response.json({ error: "not found" }, { status: 404 });
    const prompt = getPrompt(id);
    if (!prompt) return Response.json({ error: "not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = body.action;

    // ── Non-worktree prompts: just archive ──
    if (prompt.runMode !== "worktree" || !prompt.branch || !prompt.projectId) {
      const result = await completeArchive(prompt, "");
      return Response.json(result);
    }

    const project = getProject(prompt.projectId);
    if (!project) return Response.json({ error: "project not found" }, { status: 404 });

    const status = await buildWorktreeStatus(
      project.path,
      prompt.branch,
      prompt.worktreePath ?? "",
    );

    // ── Discard: force-remove worktree, archive ──
    if (action === "discard") {
      if (prompt.tmuxSession) {
        try {
          await killSession(prompt.tmuxSession);
        } catch {}
      }
      if (prompt.worktreePath && existsSync(prompt.worktreePath)) {
        try {
          await removeWorktree(project.path, prompt.worktreePath, true);
        } catch (discardErr) {
          console.error(`Failed to discard worktree ${prompt.worktreePath}:`, discardErr);
        }
      }
      const updated = updatePrompt(id, {
        isArchived: true,
        tmuxSession: null,
        worktreePath: null,
      } as never);
      return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
    }

    // ── Merge to main ──
    if (action === "merge-main") {
      if (status.hasUncommitted) {
        return archiveError("Commit or stash uncommitted changes first.", 409, {
          branch: prompt.branch,
          hasUncommitted: true,
          changes: status.changes,
          hasPr: status.hasPr,
          isMerged: status.merged,
        });
      }
      try {
        await mergeBranchToDefault(project.path, prompt.branch);
      } catch (mergeErr) {
        return Response.json(
          { error: "Merge failed", detail: (mergeErr as Error).message },
          { status: 500 },
        );
      }
      const result = await completeArchive(prompt, project.path);
      return Response.json(result);
    }

    // ── Create PR ──
    if (action === "create-pr") {
      if (status.hasPr) {
        const result = await completeArchive(prompt, project.path);
        return Response.json(result);
      }
      if (status.hasUncommitted) {
        return archiveError("Commit or stash uncommitted changes before creating a PR.", 409, {
          branch: prompt.branch,
          hasUncommitted: true,
          changes: status.changes,
          hasPr: false,
          isMerged: status.merged,
        });
      }
      try {
        const title = prompt.text.slice(0, 240).split("\n")[0].trim() || prompt.branch;
        await createPullRequest(project.path, prompt.branch, title);
      } catch (prErr) {
        return Response.json(
          { error: "PR creation failed", detail: (prErr as Error).message },
          { status: 500 },
        );
      }
      if (prompt.tmuxSession) {
        try {
          await killSession(prompt.tmuxSession);
        } catch {}
      }
      const updated = updatePrompt(id, { isArchived: true, tmuxSession: null } as never);
      return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
    }

    // ── No action (existing flow) ──
    if (status.hasUncommitted) {
      return archiveError("Commit, stash, or discard the uncommitted changes first.", 409, {
        branch: prompt.branch,
        hasUncommitted: true,
        changes: status.changes,
        hasPr: status.hasPr,
        isMerged: status.merged,
      });
    }

    if (!status.merged && !status.hasPr) {
      return archiveError("Create a PR or merge into the default branch first.", 409, {
        branch: prompt.branch,
        hasUncommitted: false,
        hasPr: false,
        isMerged: false,
      });
    }

    const result = await completeArchive(prompt, project.path);
    return Response.json(result);
  } catch (e) {
    const { status, error, retryable } = classifyError(e);
    return Response.json({ error, ...(retryable ? { retryable } : {}) }, { status });
  }
};

/**
 * Unarchive a prompt
 */
export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "not found" }, { status: 404 });
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });

  const updated = updatePrompt(id, { isArchived: false } as never);
  return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
};
