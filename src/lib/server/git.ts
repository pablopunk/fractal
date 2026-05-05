import { exec } from "./exec.js";
import { existsSync, statSync } from "node:fs";

async function gitOutput(path: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", path, ...args]);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function isGitRepo(path: string): Promise<boolean> {
  if (!existsSync(path) || !statSync(path).isDirectory()) return false;
  try {
    const { stdout } = await exec("git", ["-C", path, "rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function getRepoName(path: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", path, "rev-parse", "--show-toplevel"]);
    const top = stdout.trim();
    return top.split("/").pop() ?? "repo";
  } catch {
    return path.split("/").pop() ?? "repo";
  }
}

export async function createWorktree(repoPath: string, branch: string, worktreePath: string): Promise<void> {
  await exec("git", ["-C", repoPath, "worktree", "add", "-b", branch, worktreePath]);
}

export async function listWorktrees(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["-C", repoPath, "worktree", "list", "--porcelain"]);
    return stdout
      .split("\n")
      .filter((l) => l.startsWith("worktree "))
      .map((l) => l.slice("worktree ".length).trim());
  } catch {
    return [];
  }
}

export async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["-C", worktreePath, "status", "--porcelain"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function getUncommittedChanges(worktreePath: string): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["-C", worktreePath, "status", "--porcelain"]);
    return stdout
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  try {
    await exec("git", ["-C", repoPath, "worktree", "remove", worktreePath]);
  } catch (e) {
    // If worktree is already gone or invalid, try to prune
    try {
      await exec("git", ["-C", repoPath, "worktree", "prune"]);
    } catch {
      // Ignore prune errors
    }
  }
}

export async function getDefaultBranch(repoPath: string): Promise<string> {
  const originHead = await gitOutput(repoPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (originHead?.startsWith("origin/")) return originHead.slice("origin/".length);

  const mainRef = await gitOutput(repoPath, ["rev-parse", "--verify", "main"]);
  if (mainRef) return "main";

  const masterRef = await gitOutput(repoPath, ["rev-parse", "--verify", "master"]);
  if (masterRef) return "master";

  return "main";
}

export async function isBranchMerged(repoPath: string, branch: string): Promise<boolean> {
  const defaultBranch = await getDefaultBranch(repoPath);
  try {
    await exec("git", ["-C", repoPath, "merge-base", "--is-ancestor", branch, defaultBranch]);
    return true;
  } catch {
    return false;
  }
}

export async function hasPullRequest(repoPath: string, branch: string): Promise<boolean> {
  try {
    const { stdout } = await exec("gh", ["pr", "list", "--head", branch, "--state", "all", "--json", "number"], {
      cwd: repoPath,
      timeoutMs: 5000,
    });
    const prs = JSON.parse(stdout) as Array<{ number: number }>;
    return prs.length > 0;
  } catch {
    return false;
  }
}
