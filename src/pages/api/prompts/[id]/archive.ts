import type { APIRoute } from "astro";
import { getPrompt, getProject, updatePrompt } from "~/lib/server/store.js";
import {
  getUncommittedChanges,
  hasPullRequest,
  hasUncommittedChanges,
  isBranchMerged,
  removeWorktree,
  createPullRequest,
  mergeBranchToDefault,
} from "~/lib/server/git.js";
import { killSession } from "~/lib/server/tmux.js";
import { withPromptStatus } from "~/lib/server/prompt-status.js";
import { existsSync } from "node:fs";

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

async function completeArchive(prompt: ReturnType<typeof getPrompt>, projectPath: string) {
  if (prompt!.tmuxSession) {
    try { await killSession(prompt!.tmuxSession); } catch (e) {
      console.error(`Failed to kill tmux session ${prompt!.tmuxSession}:`, e);
    }
  }

  let worktreePath = prompt!.worktreePath;
  if (prompt!.runMode === "worktree" && prompt!.worktreePath && existsSync(prompt!.worktreePath)) {
    try {
      // Check if worktree is clean before removing
      const dirty = await hasUncommittedChanges(prompt!.worktreePath);
      if (!dirty) {
        await removeWorktree(projectPath, prompt!.worktreePath);
        worktreePath = null;
      }
    } catch (e) {
      console.error(`Failed to remove worktree ${prompt!.worktreePath}:`, e);
    }
  }

  const updated = updatePrompt(prompt!.id, { isArchived: true, tmuxSession: null, worktreePath } as never);
  return updated ? await withPromptStatus(updated) : updated;
}

/**
 * Archive a prompt.
 * Optionally accepts { action } to create a PR, merge to main, or discard (force-remove worktree).
 */
export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  const prompt = getPrompt(id);
  if (!prompt) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action;

  // ── Non-worktree prompts: just archive ──
  if (prompt.runMode !== "worktree" || !prompt.branch || !prompt.projectId) {
    const updated = await completeArchive(prompt, "");
    return Response.json({ prompt: updated });
  }

  const project = getProject(prompt.projectId);
  if (!project) return Response.json({ error: "project not found" }, { status: 404 });

  const status = await buildWorktreeStatus(project.path, prompt.branch, prompt.worktreePath ?? "");

  // ── Discard: force-remove worktree, archive ──
  if (action === "discard") {
    if (prompt.tmuxSession) {
      try { await killSession(prompt.tmuxSession); } catch {}
    }
    if (prompt.worktreePath && existsSync(prompt.worktreePath)) {
      try { await removeWorktree(project.path, prompt.worktreePath, true); } catch (e) {
        console.error(`Failed to discard worktree ${prompt.worktreePath}:`, e);
      }
    }
    const updated = updatePrompt(id, { isArchived: true, tmuxSession: null, worktreePath: null } as never);
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
    } catch (e) {
      return Response.json({ error: "Merge failed", detail: (e as Error).message }, { status: 500 });
    }
    const updated = await completeArchive(prompt, project.path);
    return Response.json({ prompt: updated });
  }

  // ── Create PR ──
  if (action === "create-pr") {
    if (status.hasPr) {
      // PR already exists — just archive
      const updated = await completeArchive(prompt, project.path);
      return Response.json({ prompt: updated });
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
    } catch (e) {
      return Response.json({ error: "PR creation failed", detail: (e as Error).message }, { status: 500 });
    }
    // Archive without removing worktree (PR needs it)
    if (prompt.tmuxSession) {
      try { await killSession(prompt.tmuxSession); } catch {}
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

  // Clean: merged or has PR — complete the archive
  const updated = await completeArchive(prompt, project.path);
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
  return Response.json({ prompt: updated ? await withPromptStatus(updated) : updated });
};
