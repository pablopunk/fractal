import { exec } from "./exec.js";

export type LinearIssue = {
  identifier: string;
  title: string;
  url: string;
  state: string;
  priority: string;
};

type LinearIssueNode = {
  identifier: string;
  title: string;
  url: string;
  state?: { name?: string };
  priority?: string | number | null;
};

let _linearConfigured: boolean | null = null;

export async function isLinearConfigured(): Promise<boolean> {
  if (_linearConfigured !== null) return _linearConfigured;
  try {
    await exec("linear", ["--version"], { timeoutMs: 5000 });
    _linearConfigured = true;
  } catch {
    _linearConfigured = false;
  }
  return _linearConfigured;
}

export async function fetchLinearIssues(limit = 20): Promise<LinearIssue[]> {
  if (!(await isLinearConfigured())) return [];
  try {
    const { stdout } = await exec("linear", [
      "api",
      "--variable", `limit=${limit}`,
    ], {
      timeoutMs: 15000,
      input: `query($limit: Int!) {
  issues(
    first: $limit
    filter: { assignee: { isMe: { eq: true } }, state: { type: { nin: ["completed", "canceled"] } } }
    orderBy: updatedAt
  ) {
    nodes {
      identifier
      title
      url
      state { name }
      priority
    }
  }
}`,
    });

    const parsed = JSON.parse(stdout) as { data?: { issues?: { nodes?: LinearIssueNode[] } } };
    return (parsed.data?.issues?.nodes ?? []).map((issue) => ({
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      state: issue.state?.name ?? "",
      priority: issue.priority == null ? "" : String(issue.priority),
    }));
  } catch {
    return [];
  }
}
