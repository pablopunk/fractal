import { exec } from "./exec.js";

export type GithubIssue = {
  number: number;
  title: string;
  url: string;
  labels: string[];
  createdAt: string;
};

type GhIssueJson = {
  number: number;
  title: string;
  url: string;
  labels: Array<{ name: string }>;
  createdAt: string;
};

let _ghConfigured: { value: boolean; checkedAt: number } | null = null;
const CONFIG_TTL_MS = 60_000;

export async function isGhConfigured(): Promise<boolean> {
  if (_ghConfigured && Date.now() - _ghConfigured.checkedAt < CONFIG_TTL_MS)
    return _ghConfigured.value;
  let value = false;
  try {
    await exec("gh", ["auth", "status"], { timeoutMs: 5000 });
    value = true;
  } catch (err) {
    console.warn("[fractal] gh not configured:", err instanceof Error ? err.message : err);
  }
  _ghConfigured = { value, checkedAt: Date.now() };
  return value;
}

export async function detectGithubRepo(projectPath: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", projectPath, "remote", "get-url", "origin"], {
      timeoutMs: 3000,
    });
    const url = stdout.trim();
    if (!url) return "";

    const sshMatch = url.match(/git@github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s*$/);
    if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

    const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?\s*$/);
    if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;

    return "";
  } catch (err) {
    console.warn("[fractal] detectGithubRepo failed:", err instanceof Error ? err.message : err);
    return "";
  }
}

export async function fetchGithubIssues(repo: string, limit = 20): Promise<GithubIssue[]> {
  if (!(await isGhConfigured())) return [];
  try {
    const { stdout } = await exec(
      "gh",
      [
        "issue",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        String(limit),
        "--json",
        "number,title,url,labels,createdAt",
      ],
      { timeoutMs: 10000 },
    );

    const parsed = JSON.parse(stdout) as GhIssueJson[];
    return parsed.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      labels: issue.labels.map((l) => l.name),
      createdAt: issue.createdAt,
    }));
  } catch (err) {
    console.warn("[fractal] fetchGithubIssues failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
