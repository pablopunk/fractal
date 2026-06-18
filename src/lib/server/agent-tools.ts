import { AsyncLocalStorage } from "node:async_hooks";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

const DEFAULT_BASE_URL = `http://127.0.0.1:${process.env.PORT ?? "7666"}`;
const baseUrlStorage = new AsyncLocalStorage<string>();

export function withAgentToolBaseUrl<T>(baseUrl: string, fn: () => Promise<T>): Promise<T> {
  return baseUrlStorage.run(baseUrl, fn);
}

function getBaseUrl(): string {
  return baseUrlStorage.getStore() ?? DEFAULT_BASE_URL;
}

async function fractalFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        `Fractal API error ${res.status}: ${(data as { error?: string }).error ?? res.statusText}`,
      );
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

function stripSecrets(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripSecrets);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "apiKeys" || key === "remoteAccessToken" || key === "remoteAccessEnabled") continue;
    out[key] = stripSecrets(value);
  }
  return out;
}

function textContent(text: string) {
  return [{ type: "text" as const, text }];
}

export const readState: AgentTool = {
  name: "readState",
  label: "Read State",
  description:
    "Read the full Fractal state: all projects, all prompts (with running status), current settings, and active tmux sessions.",
  parameters: Type.Object({}),
  execute: async () => {
    const state = await fractalFetch("/api/state");
    const safe = stripSecrets(state);
    return { content: textContent(JSON.stringify(safe)), details: safe };
  },
};

export const createProject: AgentTool = {
  name: "createProject",
  label: "Create Project",
  description: "Add a project to Fractal by its absolute directory path.",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute path to the project directory" }),
    name: Type.Optional(Type.String({ description: "Optional display name" })),
  }),
  execute: async (_id, params) => {
    const p = params as { path: string; name?: string };
    const result = await fractalFetch("/api/projects", { method: "POST", body: p });
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

export const deleteProject: AgentTool = {
  name: "deleteProject",
  label: "Delete Project",
  description: "Remove a project from Fractal. Does not delete files on disk.",
  parameters: Type.Object({
    id: Type.String({ description: "Project ID" }),
  }),
  execute: async (_id, params) => {
    const p = params as { id: string };
    await fractalFetch(`/api/projects/${p.id}`, { method: "DELETE" });
    return { content: textContent(JSON.stringify({ ok: true })), details: { ok: true } };
  },
};

const CreatePromptSchema = Type.Object({
  projectId: Type.String(),
  text: Type.String({ description: "The prompt text / task description" }),
  presetId: Type.Optional(Type.String()),
  modelProfile: Type.Optional(Type.Union([Type.Literal("smart"), Type.Literal("fast")])),
});

export const createPrompt: AgentTool<typeof CreatePromptSchema> = {
  name: "createPrompt",
  label: "Create Prompt",
  description: "Create a new prompt card in the backlog of a project.",
  parameters: CreatePromptSchema,
  execute: async (_id, params) => {
    const result = await fractalFetch(`/api/projects/${params.projectId}/prompts`, {
      method: "POST",
      body: params,
    });
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

const UpdatePromptSchema = Type.Object({
  id: Type.String(),
  text: Type.Optional(Type.String()),
  column: Type.Optional(
    Type.Union([
      Type.Literal("PROMPTS"),
      Type.Literal("RUN_IN_PLACE"),
      Type.Literal("RUN_IN_WORKTREE"),
    ]),
  ),
  presetId: Type.Optional(Type.String()),
  modelProfile: Type.Optional(Type.Union([Type.Literal("smart"), Type.Literal("fast")])),
});

export const updatePrompt: AgentTool<typeof UpdatePromptSchema> = {
  name: "updatePrompt",
  label: "Update Prompt",
  description: "Update a prompt: change text, move between columns, change preset.",
  parameters: UpdatePromptSchema,
  execute: async (_id, params) => {
    const { id, ...patch } = params;
    const result = await fractalFetch(`/api/prompts/${id}`, { method: "PATCH", body: patch });
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

const DeletePromptSchema = Type.Object({
  id: Type.String(),
  force: Type.Optional(Type.Boolean({ default: false })),
});

export const deletePrompt: AgentTool<typeof DeletePromptSchema> = {
  name: "deletePrompt",
  label: "Delete Prompt",
  description: "Delete a prompt. Use force:true to skip safety checks.",
  parameters: DeletePromptSchema,
  execute: async (_id, params) => {
    const result = await fractalFetch(`/api/prompts/${params.id}`, {
      method: "DELETE",
      body: { force: params.force },
    });
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

const LaunchPromptSchema = Type.Object({
  id: Type.String(),
  target: Type.Union([Type.Literal("RUN_IN_PLACE"), Type.Literal("RUN_IN_WORKTREE")]),
});

export const launchPrompt: AgentTool<typeof LaunchPromptSchema> = {
  name: "launchPrompt",
  label: "Launch Prompt",
  description:
    "Launch a prompt's agent. Use RUN_IN_PLACE for the project directory, RUN_IN_WORKTREE for an isolated git worktree.",
  parameters: LaunchPromptSchema,
  execute: async (_id, params) => {
    const endpoint =
      params.target === "RUN_IN_PLACE"
        ? `/api/prompts/${params.id}/run-in-place`
        : `/api/prompts/${params.id}/run-in-worktree`;
    const result = await fractalFetch(endpoint, { method: "POST" });
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

const ArchivePromptSchema = Type.Object({
  id: Type.String(),
  action: Type.Optional(
    Type.Union([Type.Literal("create-pr"), Type.Literal("merge-main"), Type.Literal("discard")]),
  ),
});

export const archivePrompt: AgentTool<typeof ArchivePromptSchema> = {
  name: "archivePrompt",
  label: "Archive Prompt",
  description:
    "Archive (mark as done) a prompt. For worktree prompts use action: 'create-pr', 'merge-main', or 'discard'.",
  parameters: ArchivePromptSchema,
  execute: async (_id, params) => {
    const result = await fractalFetch(`/api/prompts/${params.id}/archive`, {
      method: "POST",
      body: params.action ? { action: params.action } : {},
    });
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

export const readSettings: AgentTool = {
  name: "readSettings",
  label: "Read Settings",
  description: "Read current Fractal app settings. Secrets are never returned.",
  parameters: Type.Object({}),
  execute: async () => {
    const settings = await fractalFetch("/api/settings");
    const safe = stripSecrets(settings);
    return { content: textContent(JSON.stringify(safe)), details: safe };
  },
};

const UpdateSettingsSchema = Type.Object({
  defaultPresetId: Type.Optional(Type.String()),
  globalAgentPresetId: Type.Optional(Type.String()),
  lastProjectId: Type.Optional(Type.String()),
});

export const updateSettings: AgentTool<typeof UpdateSettingsSchema> = {
  name: "updateSettings",
  label: "Update Settings",
  description: "Update Fractal app settings.",
  parameters: UpdateSettingsSchema,
  execute: async (_id, params) => {
    const result = await fractalFetch("/api/settings", { method: "PATCH", body: params });
    const safe = stripSecrets(result);
    return { content: textContent(JSON.stringify(safe)), details: safe };
  },
};

const CaptureTerminalSchema = Type.Object({
  session: Type.String({ description: "Tmux session name" }),
  lines: Type.Optional(Type.Number({ default: 200 })),
});

export const captureTerminal: AgentTool<typeof CaptureTerminalSchema> = {
  name: "captureTerminal",
  label: "Capture Terminal",
  description: "Read the current content of a tmux pane.",
  parameters: CaptureTerminalSchema,
  execute: async (_id, params) => {
    const result = await fractalFetch("/api/agent/tmux/capture", { method: "POST", body: params });
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]"]);

function isPrivateAddress(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (ipVersion === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(normalized) ||
    normalized.endsWith(".local") ||
    isPrivateAddress(hostname)
  ) {
    throw new Error(`Cannot fetch private/internal host: ${hostname}`);
  }
  if (isIP(hostname.replace(/^\[|\]$/g, ""))) return;
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new Error(`Cannot fetch private/internal host: ${hostname}`);
  }
}

const WebFetchSchema = Type.Object({
  url: Type.String(),
  maxLength: Type.Optional(Type.Number({ default: 50000 })),
});

export const webFetch: AgentTool<typeof WebFetchSchema> = {
  name: "webFetch",
  label: "Web Fetch",
  description:
    "Fetch the contents of a URL. Use for reading docs, repos, etc. Only public URLs are allowed.",
  parameters: WebFetchSchema,
  execute: async (_id, params) => {
    let parsed: URL;
    try {
      parsed = new URL(params.url);
    } catch {
      throw new Error(`Invalid URL: ${params.url}`);
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }

    let current = parsed.toString();
    for (let i = 0; i <= 5; i++) {
      parsed = new URL(current);
      await assertPublicHost(parsed.hostname);
      const res = await fetch(current, {
        headers: {
          "User-Agent": "Fractal-Agent/1.0",
          Accept: "text/html, text/plain, application/json",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error("Redirect without Location header");
        const next = new URL(location, parsed);
        if (!["http:", "https:"].includes(next.protocol)) {
          throw new Error(`Blocked redirect to unsupported protocol: ${next.protocol}`);
        }
        current = next.toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${params.url}`);
      const text = await res.text();
      const max = params.maxLength ?? 50000;
      const truncated = text.length > max;
      const result = {
        url: res.url || params.url,
        status: res.status,
        content: text.slice(0, max),
        truncated,
      };
      return {
        content: textContent(JSON.stringify(result)),
        details: { url: result.url, status: result.status, truncated, text: result.content },
      };
    }
    throw new Error("Too many redirects");
  },
};

const WebSearchSchema = Type.Object({
  query: Type.String(),
  maxResults: Type.Optional(Type.Number({ default: 5 })),
});

export const webSearch: AgentTool<typeof WebSearchSchema> = {
  name: "webSearch",
  label: "Web Search",
  description: "Search the web using DuckDuckGo.",
  parameters: WebSearchSchema,
  execute: async (_id, params) => {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`,
      {
        headers: { "User-Agent": "Fractal-Agent/1.0" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) throw new Error(`DuckDuckGo request failed with HTTP ${res.status}`);
    const html = await res.text();
    const links: Array<{ title: string; url: string }> = [];
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    const limit = params.maxResults ?? 5;
    for (const match of html.matchAll(linkRegex)) {
      if (links.length >= limit) break;
      links.push({ title: match[2].replace(/<[^>]*>/g, "").trim(), url: match[1] });
    }
    const result = { query: params.query, results: links };
    return { content: textContent(JSON.stringify(result)), details: result };
  },
};

/** All Fractal Agent tools as an array. */
export const AGENT_TOOLS: AgentTool[] = [
  readState,
  createProject,
  deleteProject,
  createPrompt,
  updatePrompt,
  deletePrompt,
  launchPrompt,
  archivePrompt,
  readSettings,
  updateSettings,
  captureTerminal,
  webFetch,
  webSearch,
];
