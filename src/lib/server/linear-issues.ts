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

let _linearConfigured: { value: boolean; checkedAt: number } | null = null;
const CONFIG_TTL_MS = 60_000;

export async function isLinearConfigured(): Promise<boolean> {
  if (_linearConfigured && Date.now() - _linearConfigured.checkedAt < CONFIG_TTL_MS)
    return _linearConfigured.value;
  let value = false;
  try {
    await exec("linear", ["--version"], { timeoutMs: 5000 });
    value = true;
  } catch (err) {
    console.warn("[fractal] linear not configured:", err instanceof Error ? err.message : err);
  }
  _linearConfigured = { value, checkedAt: Date.now() };
  return value;
}

export async function fetchLinearIssues(limit = 20): Promise<LinearIssue[]> {
  if (!(await isLinearConfigured())) return [];
  try {
    const { stdout } = await exec("linear", ["api", "--variable", `limit=${limit}`], {
      timeoutMs: 15000,
      input: `query($limit: Int!) {
  issues(
    first: $limit
    filter: { assignee: { isMe: { eq: true } }, state: { type: { eq: "started" } } }
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
  } catch (err) {
    console.warn("[fractal] fetchLinearIssues failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
