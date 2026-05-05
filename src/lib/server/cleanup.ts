import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { deletePrompt, getPrompt, listPrompts, getProject, updatePrompt } from "./store.js";
import { killSession } from "./tmux.js";
import { removeWorktree, getRepoName } from "./git.js";
import type { Prompt } from "./db/schema.js";

/**
 * Clean up a prompt and all its associated resources:
 * - Kill any tmux session
 * - Remove worktree if it exists
 * - Delete the prompt from database
 */
export async function cleanupPrompt(prompt: Prompt): Promise<void> {
  // Kill tmux session if it exists
  if (prompt.tmuxSession) {
    await killSession(prompt.tmuxSession).catch((e) => {
      console.error(`Failed to kill session ${prompt.tmuxSession}:`, e);
    });
  }

  // Remove worktree if it exists
  if (prompt.worktreePath && prompt.projectId) {
    const project = getProject(prompt.projectId);
    if (project) {
      try {
        // Check if worktree dir exists before trying to remove
        if (existsSync(prompt.worktreePath)) {
          const repoPath = project.path;
          await removeWorktree(repoPath, prompt.worktreePath);
        }
      } catch (e) {
        console.error(`Failed to remove worktree ${prompt.worktreePath}:`, e);
        // Continue with deletion even if worktree removal fails
      }
    }
  }

  // Delete from database
  deletePrompt(prompt.id);
}

/**
 * Clean up by prompt ID
 */
export async function cleanupPromptById(id: string): Promise<void> {
  const prompt = getPrompt(id);
  if (prompt) {
    await cleanupPrompt(prompt);
  }
}

/**
 * Detect and clean up orphaned prompts:
 * - Prompts with worktreePath that no longer exists on disk
 * - Archive them or delete depending on flag
 */
export async function detectAndCleanupOrphans(options: { delete?: boolean; archive?: boolean } = {}): Promise<{
  cleaned: Prompt[];
  archived: Prompt[];
}> {
  const allPrompts = listPrompts();
  const cleaned: Prompt[] = [];
  const archived: Prompt[] = [];

  for (const prompt of allPrompts) {
    // Only check prompts that have a worktree path
    if (!prompt.worktreePath || !existsSync(prompt.worktreePath)) {
      continue;
    }

    // If worktree path exists but directory is gone, it's orphaned
    if (!existsSync(prompt.worktreePath)) {
      if (options.delete) {
        await cleanupPrompt(prompt);
        cleaned.push(prompt);
      } else if (options.archive) {
        updatePrompt(prompt.id, { isArchived: true } as never);
        archived.push(prompt);
      }
    }
  }

  return { cleaned, archived };
}

/**
 * Validate a prompt's resources:
 * - Check if worktree exists
 * - Check if tmux session exists
 * Returns true if prompt's resources are healthy
 */
export async function validatePromptHealth(prompt: Prompt): Promise<boolean> {
  // If no worktree/tmux, it's not launched yet - consider it healthy
  if (!prompt.worktreePath && !prompt.tmuxSession) {
    return true;
  }

  // Worktree should exist if path is recorded
  if (prompt.worktreePath && !existsSync(prompt.worktreePath)) {
    return false;
  }

  return true;
}

/**
 * Scan all prompts and archive those with missing worktrees
 */
export async function autoArchiveOrphans(): Promise<Prompt[]> {
  const allPrompts = listPrompts();
  const archived: Prompt[] = [];

  for (const prompt of allPrompts) {
    if (prompt.isArchived) continue;
    if (!prompt.worktreePath) continue;

    const isHealthy = await validatePromptHealth(prompt);
    if (!isHealthy) {
      // Archive orphaned prompt
      const updated = updatePrompt(prompt.id, { isArchived: true } as never);
      if (updated) archived.push(updated);
    }
  }

  return archived;
}
