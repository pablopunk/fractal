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
