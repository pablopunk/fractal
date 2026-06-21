import { existsSync, statSync } from "node:fs";
import { exec } from "./exec.js";

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

export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  return (await gitOutput(repoPath, ["rev-parse", "--verify", branch])) !== null;
}

export async function createWorktree(
  repoPath: string,
  branch: string,
  worktreePath: string,
): Promise<void> {
  await exec("git", ["-C", repoPath, "worktree", "add", "-b", branch, worktreePath]);
}

export async function ensureWorktree(
  repoPath: string,
  branch: string,
  worktreePath: string,
): Promise<void> {
  if (existsSync(worktreePath)) return;
  if (await branchExists(repoPath, branch)) {
    await exec("git", ["-C", repoPath, "worktree", "add", worktreePath, branch]);
    return;
  }
  await createWorktree(repoPath, branch, worktreePath);
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

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false,
): Promise<void> {
  try {
    await exec("git", [
      "-C",
      repoPath,
      "worktree",
      "remove",
      ...(force ? ["--force"] : []),
      worktreePath,
    ]);
  } catch (e) {
    // If worktree is already gone or invalid, prune stale git metadata.
    try {
      await exec("git", ["-C", repoPath, "worktree", "prune"]);
    } catch {
      // Ignore prune errors
    }
    if (existsSync(worktreePath)) throw e;
  }
}

export async function getDefaultBranch(repoPath: string): Promise<string> {
  const originHead = await gitOutput(repoPath, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
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

export async function isGhAuthenticated(): Promise<boolean> {
  try {
    await exec("gh", ["auth", "status"], { timeoutMs: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function hasPullRequest(repoPath: string, branch: string): Promise<boolean> {
  return (await getPrDetails(repoPath, branch)) !== null;
}

export async function getPrDetails(
  repoPath: string,
  branch: string,
): Promise<{ number: number; url: string } | null> {
  if (!(await isGhAuthenticated())) {
    throw new Error("GitHub CLI (gh) is not authenticated. Run 'gh auth login' to get started.");
  }

  try {
    const { stdout } = await exec(
      "gh",
      ["pr", "list", "--head", branch, "--state", "all", "--json", "number,url", "--limit", "1"],
      {
        cwd: repoPath,
        timeoutMs: 5000,
      },
    );
    const prs = JSON.parse(stdout) as Array<{ number: number; url: string }>;
    return prs.length > 0 ? { number: prs[0].number, url: prs[0].url } : null;
  } catch (err) {
    const category = classifyGhError(err);
    if (category === "pr-not-found") return null;
    throw err;
  }
}

export type PrFullStatus = {
  state: "OPEN" | "CLOSED" | "MERGED";
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  ciStatus: "pass" | "fail" | "pending" | null;
  reviewCommentCount: number;
  mergedAt: string | null;
  closedAt: string | null;
};

export type GhErrorCategory = "gh-not-installed" | "pr-not-found" | "transient" | "unknown";

export function classifyGhError(err: unknown): GhErrorCategory {
  if (!(err instanceof Error)) return "unknown";
  if ((err as NodeJS.ErrnoException).code === "ENOENT") return "gh-not-installed";
  const stderr = (err as { result?: { stderr?: string } }).result?.stderr ?? err.message;
  if (stderr.includes("no pull requests") || stderr.includes("Could not resolve")) {
    return "pr-not-found";
  }
  // Auth, network, rate-limit — retryable
  if (stderr.includes("Bad credentials") || stderr.includes("connect") || stderr.includes("429")) {
    return "transient";
  }
  return "unknown";
}

export async function getPrFullStatus(
  repoPath: string,
  prNumber: number,
): Promise<PrFullStatus | null> {
  if (!(await isGhAuthenticated())) {
    throw new Error("GitHub CLI (gh) is not authenticated. Run 'gh auth login' to get started.");
  }

  try {
    const { stdout } = await exec(
      "gh",
      [
        "pr",
        "view",
        String(prNumber),
        "--json",
        "state,mergeable,statusCheckRollup,reviewDecision,reviews,mergedAt,closedAt",
      ],
      { cwd: repoPath, timeoutMs: 10000 },
    );
    const pr = JSON.parse(stdout) as {
    state: string;
    mergeable: string;
    statusCheckRollup?: Array<{ status?: string; conclusion?: string }>;
    reviewDecision?: string | null;
    reviews?: Array<{ state?: string; body?: string }>;
    mergedAt?: string | null;
    closedAt?: string | null;
  };

  const validStates = ["OPEN", "CLOSED", "MERGED"];
  const state = validStates.includes(pr.state) ? (pr.state as PrFullStatus["state"]) : "OPEN";
  const mergeableMap: Record<string, PrFullStatus["mergeable"]> = {
    MERGEABLE: "MERGEABLE",
    CONFLICTING: "CONFLICTING",
    UNKNOWN: "UNKNOWN",
  };

  // Count review comments from reviews array
  let reviewCommentCount = 0;
  if (Array.isArray(pr.reviews)) {
    reviewCommentCount = pr.reviews.length;
  }

  // Derive CI status from statusCheckRollup
  let ciStatus: PrFullStatus["ciStatus"] = null;
  if (Array.isArray(pr.statusCheckRollup) && pr.statusCheckRollup.length > 0) {
    const hasFail = pr.statusCheckRollup.some(
      (c) => c.conclusion === "FAILURE" || c.conclusion === "ERROR" || c.conclusion === "CANCELLED",
    );
    const hasPending = pr.statusCheckRollup.some((c) => !c.conclusion && c.status !== "COMPLETED");
    if (hasFail) {
      ciStatus = "fail";
    } else if (hasPending) {
      ciStatus = "pending";
    } else {
      ciStatus = "pass";
    }
  }

    return {
      state,
      mergeable: mergeableMap[pr.mergeable] ?? "UNKNOWN",
      ciStatus,
      reviewCommentCount,
      mergedAt: pr.mergedAt ?? null,
      closedAt: pr.closedAt ?? null,
    };
  } catch (err) {
    const category = classifyGhError(err);
    if (category === "pr-not-found") return null;
    throw err;
  }
}

export async function createPullRequest(
  repoPath: string,
  branch: string,
  title: string,
  body?: string,
): Promise<{ number: number; url: string }> {
  const args = ["pr", "create", "--head", branch, "--title", title];
  if (body) {
    args.push("--body", body);
  } else {
    args.push("--fill-first");
  }
  const { stdout } = await exec("gh", args, { cwd: repoPath, timeoutMs: 30000 });
  const url = stdout.trim();
  const match = url.match(/\/pull\/(\d+)/);
  if (!match) throw new Error(`Failed to parse PR number from output: ${url}`);
  return { number: Number(match[1]), url };
}

export async function mergeBranchToDefault(repoPath: string, branch: string): Promise<string> {
  const defaultBranch = await getDefaultBranch(repoPath);
  await exec("git", ["-C", repoPath, "fetch", "origin", defaultBranch]);
  await exec("git", ["-C", repoPath, "checkout", defaultBranch]);
  await exec("git", ["-C", repoPath, "pull", "--ff-only", "origin", defaultBranch]);
  await exec("git", ["-C", repoPath, "merge", branch]);
  await exec("git", ["-C", repoPath, "push", "origin", defaultBranch]);
  return defaultBranch;
}
