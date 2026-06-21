import type { Agent } from "@earendil-works/pi-agent-core";
import type { APIRoute } from "astro";
import { withAgentToolBaseUrl } from "~/lib/server/agent-tools.js";
import {
  getOrCreateRuntime,
  markIdle,
  persistSession,
} from "~/lib/server/fractal-agent-runtime.js";

export const prerender = false;

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

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_TURNS = 25;

// ── Route handler ──────────────────────────────────────────────────────────

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export const POST: APIRoute = async ({ request }) => {
  // Parse and validate the request body up front so we can resolve
  // the session before creating the stream (needed for the response header).
  let parseError: string | null = null;
  let prompt: string | null = null;
  let incomingSessionId: string | undefined;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      prompt?: string;
    };
    incomingSessionId = body.sessionId;

    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      parseError = "Invalid request: prompt must be a non-empty string";
    } else {
      prompt = body.prompt.trim();
    }
  } catch {
    parseError = "Invalid request body";
  }

  // Resolve session before stream so we can set the response header.
  let sessionId: string | null = null;
  let agent: Agent | null = null;
  let isNew = false;
  const origin = requestOrigin(request);

  if (!parseError) {
    try {
      const runtime = await getOrCreateRuntime(incomingSessionId);
      agent = runtime.agent;
      sessionId = runtime.sessionId;
      isNew = runtime.isNew;
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  if (isNew && sessionId) {
    headers["x-fractal-agent-session-id"] = sessionId;
  }

  const finalPrompt = prompt;
  const finalSessionId = sessionId;
  const finalAgent = agent;
  const finalError = parseError;

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

      if (finalError) {
        enqueue({ type: "error", message: finalError });
        try {
          controller.close();
        } catch {
          /* may already be closed */
        }
        return;
      }

      if (!finalAgent || !finalSessionId || !finalPrompt) {
        enqueue({ type: "error", message: "Internal error: agent not initialized" });
        try {
          controller.close();
        } catch {
          /* may already be closed */
        }
        return;
      }

      const agentRef = finalAgent;
      const sid = finalSessionId;
      let unsubscribed = false;

      try {
        request.signal.addEventListener("abort", () => {
          agentRef.abort();
        });

        let turnCount = 0;

        const unsubscribe = agentRef.subscribe(async (event) => {
          if (unsubscribed) return;
          try {
            switch (event.type) {
              case "turn_start": {
                turnCount++;
                if (turnCount > MAX_TURNS) {
                  agentRef.abort();
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
                const result = event.result;
                const resultContent: unknown[] =
                  result && typeof result === "object" && "content" in result
                    ? ((result as { content: unknown[] }).content ?? [])
                    : [];
                const textItems = (Array.isArray(resultContent) ? resultContent : [])
                  .filter(
                    (c): c is { type: string; text?: string } =>
                      typeof c === "object" &&
                      c !== null &&
                      (c as { type: unknown }).type === "text",
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
            console.error("[fractal-agent] subscribe callback error:", err);
          }
        });

        await withAgentToolBaseUrl(origin, () => agentRef.prompt(finalPrompt));

        // Unsubscribe before persisting to avoid late events
        unsubscribed = true;
        unsubscribe();

        // Persist session after run completes
        try {
          await persistSession(sid);
        } catch (persistErr) {
          console.error("[fractal-agent] failed to persist session:", persistErr);
        }

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
      } finally {
        if (!unsubscribed) {
          unsubscribed = true;
        }
        if (sid) {
          markIdle(sid);
        }
      }
    },
    cancel() {
      // Client disconnected
    },
  });

  return new Response(stream, { headers });
};
