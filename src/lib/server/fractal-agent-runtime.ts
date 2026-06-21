import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { type Model, streamSimple } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { FractalAgentProvider } from "../agent-providers.js";
import { AGENT_TOOLS } from "./agent-tools.js";
import {
  createSession,
  deleteSession,
  getSession,
  updateSessionMessages,
} from "./fractal-agent-session-store.js";
import { getSettings } from "./store.js";

const SYSTEM_PROMPT = `You are the Fractal global agent. Your job is to help the user manage Fractal.

You are embedded inside Fractal, a desktop application for managing AI coding agents across multiple projects.

## Core concepts
- A **project** is a directory on disk that Fractal watches. Each has a kanban board with prompt cards.
- A **prompt** is a task card with text, a column (PROMPTS, RUN_IN_PLACE, RUN_IN_WORKTREE), an agent preset, and a model profile.
- **RUN_IN_PLACE** runs the agent in the project directory. **RUN_IN_WORKTREE** runs it in an isolated git worktree.
- **Archiving** marks a prompt as done. Worktree prompts may need a PR created, merged, or discarded.

## Your tools
Use readState for an overview. Then act through the other tools to create projects, manage prompts, change settings, read terminal output, and search the web.

## Rules
- Always read state first before acting. Do not guess.
- Be concise. One action at a time unless they are independent.
- When creating a prompt, use the project's default preset if not specified.
- When archiving a worktree prompt, check what action is needed (create PR, merge, discard).
- Never expose API keys in your responses.`;

// ── Pi auth/model resolution ───────────────────────────────────────────────

const OAUTH_PROVIDER_MAP: Record<string, string> = {
  openai: "openai-codex",
};

type LocalPiRuntime = {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
};

function createLocalPiRuntime(): LocalPiRuntime {
  const authStorage = AuthStorage.create();
  return { authStorage, modelRegistry: ModelRegistry.create(authStorage) };
}

async function resolvePiApiKey(
  authStorage: AuthStorage,
  provider: string,
): Promise<string | undefined> {
  const candidates = [provider, OAUTH_PROVIDER_MAP[provider]].filter((p): p is string =>
    Boolean(p),
  );
  for (const candidate of candidates) {
    const apiKey = await authStorage.getApiKey(candidate, { includeFallback: false });
    if (apiKey?.trim()) return apiKey;
  }
  return undefined;
}

// ── Agent factory ──────────────────────────────────────────────────────────

function resolveModel(): {
  provider: string;
  modelId: string;
  piModel: Model<any>;
  localPi: LocalPiRuntime;
} {
  const settings = getSettings();
  const provider = settings.fractalAgentProvider as FractalAgentProvider | undefined;
  const modelId = settings.fractalAgentModel;

  if (!provider) {
    throw new Error(
      "No Fractal Agent provider selected. Configure one in Settings → Fractal Agent.",
    );
  }
  if (!modelId) {
    throw new Error("No Fractal Agent model selected. Configure one in Settings → Fractal Agent.");
  }

  const localPi = createLocalPiRuntime();
  const piModel = localPi.modelRegistry.find(provider, modelId);
  if (!piModel) {
    throw new Error(
      `Model "${modelId}" for provider "${provider}" is not available from local Pi. Reopen Settings → Fractal Agent and choose a model from \`pi --list-models\`.`,
    );
  }

  return { provider, modelId, piModel, localPi };
}

function createAgent(
  provider: string,
  localPi: LocalPiRuntime,
  piModel: Model<any>,
  messages: AgentMessage[] = [],
): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: piModel,
      tools: AGENT_TOOLS as AgentTool[],
      messages,
    },
    streamFn: async (model, context, options) => {
      const auth = await localPi.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) throw new Error(auth.error);
      return streamSimple(model, context, {
        ...options,
        apiKey: auth.apiKey,
        headers: { ...options?.headers, ...auth.headers },
      });
    },
    getApiKey: async (requestProvider) =>
      resolvePiApiKey(localPi.authStorage, requestProvider ?? provider),
    toolExecution: "parallel",
  });

  return agent;
}

// ── Runtime cache ──────────────────────────────────────────────────────────

interface RuntimeEntry {
  agent: Agent;
  busy: boolean;
}

const runtimeCache = new Map<string, RuntimeEntry>();

export async function getOrCreateRuntime(
  sessionId: string | undefined,
): Promise<{ agent: Agent; sessionId: string; isNew: boolean }> {
  const { provider, modelId, localPi, piModel } = resolveModel();

  // Try cache first — set busy atomically if found.
  if (sessionId) {
    const cached = runtimeCache.get(sessionId);
    if (cached) {
      if (cached.busy) {
        throw new Error("Session is already processing a prompt. Please wait.");
      }
      cached.busy = true;
      return { agent: cached.agent, sessionId, isNew: false };
    }
  }

  // Try DB — after the async gap, re-check cache (another request may have
  // rehydrated it while we were waiting on the DB).
  if (sessionId) {
    const dbSession = await getSession(sessionId);
    // Re-check cache after the await gap
    const raceEntry = runtimeCache.get(sessionId);
    if (raceEntry) {
      if (raceEntry.busy) {
        throw new Error("Session is already processing a prompt. Please wait.");
      }
      raceEntry.busy = true;
      return { agent: raceEntry.agent, sessionId, isNew: false };
    }
    if (dbSession) {
      let messages: AgentMessage[] = [];
      try {
        messages = JSON.parse(dbSession.messagesJson) as AgentMessage[];
      } catch {
        messages = [];
      }
      const agent = createAgent(provider, localPi, piModel, messages);
      runtimeCache.set(sessionId, { agent, busy: true });
      return { agent, sessionId, isNew: false };
    }
  }

  // New session — mark busy so the caller owns it immediately.
  const newSession = await createSession(provider, modelId);
  const agent = createAgent(provider, localPi, piModel);
  runtimeCache.set(newSession.id, { agent, busy: true });
  return { agent, sessionId: newSession.id, isNew: true };
}

export function markIdle(sessionId: string): void {
  const entry = runtimeCache.get(sessionId);
  if (entry) entry.busy = false;
}

export async function persistSession(sessionId: string): Promise<void> {
  const entry = runtimeCache.get(sessionId);
  if (!entry) return;
  const messages = entry.agent.state.messages;
  const messagesJson = JSON.stringify(messages);
  await updateSessionMessages(sessionId, messagesJson);
}

export async function getSessionMessages(sessionId: string): Promise<AgentMessage[] | null> {
  const cached = runtimeCache.get(sessionId);
  if (cached) {
    return cached.agent.state.messages;
  }
  const dbSession = await getSession(sessionId);
  if (!dbSession) return null;
  try {
    return JSON.parse(dbSession.messagesJson) as AgentMessage[];
  } catch {
    return [];
  }
}

export async function evictSession(sessionId: string): Promise<void> {
  const entry = runtimeCache.get(sessionId);
  if (entry) {
    try {
      entry.agent.abort();
    } catch {
      // ignore abort errors
    }
    runtimeCache.delete(sessionId);
  }
  await deleteSession(sessionId);
}
