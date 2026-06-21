import { existsSync } from "node:fs";
import type { Prompt } from "./db/schema.js";
import {
  classifyGhError,
  type GhErrorCategory,
  getPrDetails,
  getPrFullStatus,
  hasUncommittedChanges,
  removeWorktree,
} from "./git.js";
import { getProject, listPrompts, updatePrompt } from "./store.js";
import { killSession } from "./tmux.js";

const FRACTAL_PR_POLL_MS = Number(process.env.FRACTAL_PR_POLL_MS) || 30_000;

let started = false;
let nextTimeout: ReturnType<typeof setTimeout> | null = null;
let ghMissingLogged = false;

export function startPrReviewPoll() {
  if (started) return;
  started = true;

  async function poll() {
    try {
      await autoDetectPRs();
      await pollReviewCards();
    } catch (err) {
      console.error("[fractal:review-poll]", err);
    }
    nextTimeout = setTimeout(poll, FRACTAL_PR_POLL_MS);
    nextTimeout.unref();
  }
  nextTimeout = setTimeout(poll, FRACTAL_PR_POLL_MS);
  nextTimeout.unref();
}

export function stopPrReviewPoll() {
  started = false;
  if (nextTimeout) {
    clearTimeout(nextTimeout);
    nextTimeout = null;
  }
}

/**
 * Auto-detect PRs on RUN_IN_WORKTREE cards and move them to REVIEW.
 */
async function autoDetectPRs() {
  const allPrompts = listPrompts();
  const worktreeCards = allPrompts.filter(
    (p: Prompt) =>
      p.column === "RUN_IN_WORKTREE" &&
      p.runMode === "worktree" &&
      p.branch &&
      !p.isArchived &&
      !p.prUrl,
  );
  if (worktreeCards.length === 0) return;

  for (const prompt of worktreeCards) {
    if (!prompt.branch) continue;
    const project = getProject(prompt.projectId);
    if (!project) continue;
    try {
      const prDetails = await getPrDetails(project.path, prompt.branch);
      if (prDetails) {
        updatePrompt(prompt.id, {
          column: "REVIEW",
          prUrl: prDetails.url,
          prCiStatus: null,
          prReviewCount: null,
          prHasConflicts: null,
        } as never);
      }
    } catch {
      // Best-effort — transient gh failures are retried next cycle
    }
  }
}

async function pollReviewCards() {
  // Find all REVIEW cards with PR URLs
  const allPrompts = listPrompts();
  const reviewCards = allPrompts.filter(
    (p: Prompt) => p.column === "REVIEW" && p.prUrl && !p.isArchived,
  );
  if (reviewCards.length === 0) return;

  // Dedup by prUrl
  const prUrlMap = new Map<string, { prompt: Prompt; projectPath: string; prNumber: number }[]>();
  for (const p of reviewCards) {
    if (!p.prUrl) continue;
    const project = getProject(p.projectId);
    if (!project) continue;
    // Extract PR number from URL (e.g., https://github.com/owner/repo/pull/42)
    const match = p.prUrl.match(/\/pull\/(\d+)/);
    if (!match) continue;
    const prNumber = Number(match[1]);
    if (Number.isNaN(prNumber)) continue;
    const group = prUrlMap.get(p.prUrl) ?? [];
    group.push({ prompt: p, projectPath: project.path, prNumber });
    prUrlMap.set(p.prUrl, group);
  }

  for (const [, group] of prUrlMap) {
    const { projectPath, prNumber } = group[0];
    try {
      const status = await getPrFullStatus(projectPath, prNumber);

      if (!status) {
        // PR not found — move back to RUN_IN_WORKTREE
        for (const { prompt } of group) {
          updatePrompt(prompt.id, {
            column: "RUN_IN_WORKTREE",
            prCiStatus: null,
            prReviewCount: null,
            prHasConflicts: null,
            prUrl: null,
          } as never);
        }
        continue;
      }

      // Handle transitions
      if (status.state === "MERGED") {
        for (const { prompt } of group) {
          await autoArchiveToDone(prompt, projectPath);
        }
        continue;
      }

      if (status.state === "CLOSED" && !status.mergedAt) {
        // Closed without merge — back to RUN_IN_WORKTREE
        for (const { prompt } of group) {
          updatePrompt(prompt.id, {
            column: "RUN_IN_WORKTREE",
            prCiStatus: null,
            prReviewCount: null,
            prHasConflicts: null,
            prUrl: null,
          } as never);
        }
        continue;
      }

      // Update status badges
      const conflictVal =
        status.mergeable === "CONFLICTING" ? true : status.mergeable === "MERGEABLE" ? false : null;
      for (const { prompt } of group) {
        updatePrompt(prompt.id, {
          prCiStatus: status.ciStatus,
          prReviewCount: status.unresolvedReviewCommentCount,
          prHasConflicts: conflictVal,
        } as never);
      }
    } catch (err) {
      const category: GhErrorCategory = classifyGhError(err);
      if (category === "gh-not-installed") {
        if (!ghMissingLogged) {
          console.warn("[fractal:review-poll] gh CLI not available — PR status unavailable");
          ghMissingLogged = true;
        }
        // Mark all cards as unavailable (set null status)
        for (const { prompt } of group) {
          updatePrompt(prompt.id, {
            prCiStatus: null,
            prReviewCount: null,
            prHasConflicts: null,
          } as never);
        }
        return; // Skip entire cycle if gh is missing
      }
      if (category === "pr-not-found") {
        // PR deleted — move back to RUN_IN_WORKTREE
        for (const { prompt } of group) {
          updatePrompt(prompt.id, {
            column: "RUN_IN_WORKTREE",
            prCiStatus: null,
            prReviewCount: null,
            prHasConflicts: null,
            prUrl: null,
          } as never);
        }
        continue;
      }
      // Transient / unknown — retain last-known status, retry next cycle
      console.warn("[fractal:review-poll] transient gh error, retrying next cycle:", err);
    }
  }
}

async function autoArchiveToDone(prompt: Prompt, projectPath: string) {
  // Kill tmux session if running
  if (prompt.tmuxSession) {
    try {
      await killSession(prompt.tmuxSession);
    } catch {
      // session may already be dead
    }
  }

  // Try to remove worktree if clean
  if (prompt.worktreePath && existsSync(prompt.worktreePath)) {
    try {
      const dirty = await hasUncommittedChanges(prompt.worktreePath);
      if (!dirty) {
        await removeWorktree(projectPath, prompt.worktreePath);
        updatePrompt(prompt.id, { worktreePath: null } as never);
      }
    } catch {
      // worktree removal is best-effort
    }
  }

  updatePrompt(prompt.id, {
    isArchived: true,
    tmuxSession: null,
    prCiStatus: null,
    prReviewCount: null,
    prHasConflicts: null,
  } as never);
}
