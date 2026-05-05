import { exec } from "./exec.js";
import { existsSync, statSync } from "node:fs";

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
