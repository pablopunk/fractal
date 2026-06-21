import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, streamSimple } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { APIRoute } from "astro";
import type { FractalAgentProvider } from "~/lib/agent-providers.js";
import { AGENT_TOOLS, withAgentToolBaseUrl } from "~/lib/server/agent-tools.js";
import { getSettings } from "~/lib/server/store.js";

export const prerender = false;

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

// ── SSE helpers ───────────────────────────────────────────────────────────

function safeJsonStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    try {
      return JSON.stringify(String(data));
    } catch {
      return '"<unserializable>"';
    }
  }
}

function sseEvent(data: unknown): string {
  return `data: ${safeJsonStringify(data)}\n\n`;
}

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

/**
 * Build a user-friendly error message suggesting Pi auth for providers that
 * support it via OAuth.
 */
function authErrorMessage(provider: string): string {
  const oauthName = OAUTH_PROVIDER_MAP[provider] ?? provider;
  return (
    `No local Pi credentials found for ${provider}. ` +
    `Fractal Agent uses local Pi auth only. Open Pi locally, log in to ${oauthName}, ` +
    `then restart or reopen Fractal Agent.`
  );
}

// ── Agent setup ────────────────────────────────────────────────────────────

const MAX_TURNS = 25;

interface PriorMessage {
  role: string;
  content: string;
}

function buildInitialMessages(priorMessages: PriorMessage[]) {
  const messages: Array<
    ReturnType<typeof fauxAssistantMessage> | { role: "user"; content: string; timestamp: number }
  > = [];
  for (const m of priorMessages) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content, timestamp: Date.now() });
    } else if (m.role === "assistant") {
      // Use fauxAssistantMessage to produce a valid AssistantMessage with
      // required metadata (api, provider, model, usage, stopReason) so
      // pi-agent-core's convertToLlm can process it without type errors.
      messages.push(fauxAssistantMessage(m.content));
    }
  }
  return messages;
}

async function prepareAgent(
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController<Uint8Array>,
  priorMessages: PriorMessage[] = [],
) {
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

  const initialAuth = await localPi.modelRegistry.getApiKeyAndHeaders(piModel);
  if (!initialAuth.ok) {
    throw new Error(authErrorMessage(provider));
  }

  const initialMessages = buildInitialMessages(priorMessages);

  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: piModel,
      tools: AGENT_TOOLS as AgentTool[],
      messages: initialMessages,
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

  const enqueue = (data: unknown) => {
    try {
      controller.enqueue(encoder.encode(sseEvent(data)));
    } catch {
      // Stream may have closed
    }
  };

  let turnCount = 0;

  agent.subscribe(async (event) => {
    try {
      switch (event.type) {
        case "turn_start": {
          turnCount++;
          if (turnCount > MAX_TURNS) {
            agent.abort();
            enqueue({
              type: "error",
              message: `Agent reached the maximum number of turns (${MAX_TURNS}).`,
            });
          }
          break;
        }
        case "message_update": {
          const rawEvent = event.assistantMessageEvent;
          if (rawEvent?.type === "text_delta") {
            enqueue({ type: "text_delta", content: rawEvent.delta });
          }
          break;
        }
        case "tool_execution_start": {
          enqueue({
            type: "tool_start",
            toolCallId: event.toolCallId,
            name: event.toolName,
            args: event.args,
          });
          break;
        }
        case "tool_execution_end": {
          // Combine content and details into a single UI result.
          // Some tools put useful data in content, others only in details.
          const result = event.result;
          const resultContent: unknown[] =
            result && typeof result === "object" && "content" in result
              ? ((result as { content: unknown[] }).content ?? [])
              : [];
          const textItems = (Array.isArray(resultContent) ? resultContent : [])
            .filter(
              (c): c is { type: string; text?: string } =>
                typeof c === "object" && c !== null && (c as { type: unknown }).type === "text",
            )
            .map((c) => (typeof c.text === "string" ? c.text : ""))
            .filter(Boolean);
          const contentText = textItems.length > 0 ? textItems.join("\n") : null;
          const details =
            result && typeof result === "object" && "details" in result
              ? (result as { details: unknown }).details
              : undefined;
          const hasUsefulDetails =
            details != null &&
            !(typeof details === "object" && Object.keys(details as object).length === 0);

          let uiResult: unknown = hasUsefulDetails ? details : contentText;
          if (event.isError && contentText) uiResult = contentText;
          if (uiResult == null) uiResult = event.isError ? "Tool execution failed" : null;

          enqueue({
            type: "tool_end",
            toolCallId: event.toolCallId,
            name: event.toolName,
            result: uiResult,
            isError: event.isError,
          });
          break;
        }
        case "agent_end": {
          enqueue({ type: "done" });
          break;
        }
      }
    } catch (err) {
      // Prevent unhandled promise rejections from crashing the agent loop.
      // The agent library does not wrap listener calls in try/catch.
      console.error("[fractal-agent] subscribe callback error:", err);
    }
  });

  return agent;
}

// ── Route handler ──────────────────────────────────────────────────────────

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export const POST: APIRoute = async ({ request }) => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(data)));
        } catch {
          // ignore closed stream
        }
      };

      let agent: Agent | null = null;

      try {
        const body = (await request.json().catch(() => ({}))) as {
          messages?: PriorMessage[];
        };

        const rawMessages = body.messages;
        if (!Array.isArray(rawMessages)) {
          enqueue({ type: "error", message: "Invalid request: messages must be an array" });
          try {
            controller.close();
          } catch {
            /* may already be closed */
          }
          return;
        }
        const allMessages = rawMessages as PriorMessage[];
        if (allMessages.length === 0) {
          enqueue({ type: "error", message: "No messages provided" });
          try {
            controller.close();
          } catch {
            /* may already be closed */
          }
          return;
        }

        const lastMsg = allMessages[allMessages.length - 1];
        if (
          !lastMsg ||
          typeof lastMsg !== "object" ||
          lastMsg.role !== "user" ||
          !lastMsg.content?.trim()
        ) {
          enqueue({ type: "error", message: "Last message must be a non-empty user message." });
          try {
            controller.close();
          } catch {
            /* may already be closed */
          }
          return;
        }

        const priorMessages = allMessages.slice(0, -1);

        agent = await prepareAgent(encoder, controller, priorMessages);
        const activeAgent = agent;

        request.signal.addEventListener("abort", () => {
          activeAgent.abort();
        });

        await withAgentToolBaseUrl(requestOrigin(request), () =>
          activeAgent.prompt(lastMsg.content),
        );

        controller.close();
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : String(e);
        enqueue({ type: "error", message: msg });
        try {
          controller.close();
        } catch {
          /* may already be closed */
        }
      }
    },
    cancel() {
      // Client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
