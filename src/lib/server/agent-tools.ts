import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { dynamicTool } from "ai";
import { z } from "zod";

const BASE_URL = `http://127.0.0.1:${process.env.PORT ?? "7666"}`;

async function fractalFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
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

function tool<T>(
  _name: string,
  description: string,
  schema: z.ZodType<T>,
  execute: (input: T) => Promise<unknown>,
) {
  return dynamicTool({
    description,
    inputSchema: schema,
    execute: async (input: unknown) => await execute(input as T),
  });
}

export const readState = tool(
  "readState",
  "Read the full Fractal state: all projects, all prompts (with running status), current settings, and active tmux sessions.",
  z.object({}),
  async () => {
    const state = await fractalFetch("/api/state");
    return stripSecrets(state);
  },
);

export const createProject = tool(
  "createProject",
  "Add a project to Fractal by its absolute directory path.",
  z.object({
    path: z.string().describe("Absolute path to the project directory"),
    name: z.string().optional().describe("Optional display name"),
  }),
  async (args: { path: string; name?: string }) => {
    return fractalFetch("/api/projects", { method: "POST", body: args });
  },
);

export const deleteProject = tool(
  "deleteProject",
  "Remove a project from Fractal. Does not delete files on disk.",
  z.object({
    id: z.string().describe("Project ID"),
  }),
  async (args: { id: string }) => {
    await fractalFetch(`/api/projects/${args.id}`, { method: "DELETE" });
    return { ok: true };
  },
);

export const createPrompt = tool(
  "createPrompt",
  "Create a new prompt card in the backlog of a project.",
  z.object({
    projectId: z.string(),
    text: z.string().describe("The prompt text / task description"),
    presetId: z.string().optional(),
    modelProfile: z.enum(["smart", "fast"]).optional(),
  }),
  async (args: { projectId: string; text: string; presetId?: string; modelProfile?: string }) => {
    return fractalFetch(`/api/projects/${args.projectId}/prompts`, { method: "POST", body: args });
  },
);

export const updatePrompt = tool(
  "updatePrompt",
  "Update a prompt: change text, move between columns, change preset.",
  z.object({
    id: z.string(),
    text: z.string().optional(),
    column: z.enum(["PROMPTS", "RUN_IN_PLACE", "RUN_IN_WORKTREE"]).optional(),
    presetId: z.string().optional(),
    modelProfile: z.enum(["smart", "fast"]).optional(),
  }),
  async (args: Record<string, unknown>) => {
    const { id, ...patch } = args;
    return fractalFetch(`/api/prompts/${id}`, { method: "PATCH", body: patch });
  },
);

export const deletePrompt = tool(
  "deletePrompt",
  "Delete a prompt. Use force:true to skip safety checks.",
  z.object({
    id: z.string(),
    force: z.boolean().optional().default(false),
  }),
  async (args: { id: string; force?: boolean }) => {
    return fractalFetch(`/api/prompts/${args.id}`, {
      method: "DELETE",
      body: { force: args.force },
    });
  },
);

export const launchPrompt = tool(
  "launchPrompt",
  "Launch a prompt's agent. Use RUN_IN_PLACE for the project directory, RUN_IN_WORKTREE for an isolated git worktree.",
  z.object({
    id: z.string(),
    target: z.enum(["RUN_IN_PLACE", "RUN_IN_WORKTREE"]),
  }),
  async (args: { id: string; target: string }) => {
    const endpoint =
      args.target === "RUN_IN_PLACE"
        ? `/api/prompts/${args.id}/run-in-place`
        : `/api/prompts/${args.id}/run-in-worktree`;
    return fractalFetch(endpoint, { method: "POST" });
  },
);

export const archivePrompt = tool(
  "archivePrompt",
  "Archive (mark as done) a prompt. For worktree prompts use action: 'create-pr', 'merge-main', or 'discard'.",
  z.object({
    id: z.string(),
    action: z.enum(["create-pr", "merge-main", "discard"]).optional(),
  }),
  async (args: { id: string; action?: string }) => {
    return fractalFetch(`/api/prompts/${args.id}/archive`, {
      method: "POST",
      body: args.action ? { action: args.action } : {},
    });
  },
);

export const readSettings = tool(
  "readSettings",
  "Read current Fractal app settings. API keys are never returned.",
  z.object({}),
  async () => {
    const settings = await fractalFetch("/api/settings");
    return stripSecrets(settings);
  },
);

export const updateSettings = tool(
  "updateSettings",
  "Update Fractal app settings.",
  z.object({
    defaultPresetId: z.string().optional(),
    globalAgentPresetId: z.string().optional(),
    lastProjectId: z.string().optional(),
  }),
  async (args: Record<string, unknown>) => {
    return fractalFetch("/api/settings", { method: "PATCH", body: args });
  },
);

export const captureTerminal = tool(
  "captureTerminal",
  "Read the current content of a tmux pane.",
  z.object({
    session: z.string().describe("Tmux session name"),
    lines: z.number().optional().default(200),
  }),
  async (args: { session: string; lines?: number }) => {
    return fractalFetch("/api/agent/tmux/capture", { method: "POST", body: args });
  },
);

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

export const webFetch = tool(
  "webFetch",
  "Fetch the contents of a URL. Use for reading docs, repos, etc. Only public URLs are allowed.",
  z.object({
    url: z.string().url(),
    maxLength: z.number().optional().default(50000),
  }),
  async (args: { url: string; maxLength?: number }) => {
    let parsed: URL;
    try {
      parsed = new URL(args.url);
    } catch {
      throw new Error(`Invalid URL: ${args.url}`);
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
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${args.url}`);
      const text = await res.text();
      const max = args.maxLength ?? 50000;
      return {
        url: res.url || args.url,
        status: res.status,
        content: text.slice(0, max),
        truncated: text.length > max,
      };
    }
    throw new Error("Too many redirects");
  },
);

export const webSearch = tool(
  "webSearch",
  "Search the web using DuckDuckGo.",
  z.object({
    query: z.string(),
    maxResults: z.number().optional().default(5),
  }),
  async (args: { query: string; maxResults?: number }) => {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`,
      {
        headers: { "User-Agent": "Fractal-Agent/1.0" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) throw new Error(`DuckDuckGo request failed with HTTP ${res.status}`);
    const html = await res.text();
    const links: Array<{ title: string; url: string }> = [];
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    const limit = args.maxResults ?? 5;
    for (const match of html.matchAll(linkRegex)) {
      if (links.length >= limit) break;
      links.push({ title: match[2].replace(/<[^>]*>/g, "").trim(), url: match[1] });
    }
    return { query: args.query, results: links };
  },
);
