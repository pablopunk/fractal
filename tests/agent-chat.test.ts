import { describe, expect, it } from "vitest";

// ── Test SSE event formatting ─────────────────────────────────────────────

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

function parseSseEvent(line: string): unknown | null {
  if (!line.startsWith("data: ")) return null;
  try {
    return JSON.parse(line.slice(6));
  } catch {
    return null;
  }
}

describe("sseEvent", () => {
  it("formats a simple object as an SSE data line", () => {
    const result = sseEvent({ type: "done" });
    expect(result).toBe('data: {"type":"done"}\n\n');
  });

  it("formats an error object", () => {
    const result = sseEvent({ type: "error", message: "test error" });
    const parsed = parseSseEvent(result);
    expect(parsed).toEqual({ type: "error", message: "test error" });
  });

  it("handles circular references gracefully", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = sseEvent(obj);
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });

  it("handles BigInt gracefully", () => {
    const result = sseEvent({ value: BigInt(123) as unknown });
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });

  it("handles undefined gracefully", () => {
    const result = sseEvent(undefined);
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });

  it("handles functions gracefully", () => {
    const result = sseEvent({ fn: (() => {}) as unknown });
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });
});

// ── Test message validation rules (session-based contract) ─────────────────

function validateChatBody(
  body: unknown,
): { ok: true; sessionId: string | undefined; prompt: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const obj = body as Record<string, unknown>;

  const prompt = obj.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return { ok: false, error: "Invalid request: prompt must be a non-empty string" };
  }

  const sessionId = typeof obj.sessionId === "string" && obj.sessionId ? obj.sessionId : undefined;
  return { ok: true, sessionId, prompt: prompt.trim() };
}

describe("validateChatBody (session-based)", () => {
  it("accepts valid body with sessionId and prompt", () => {
    const result = validateChatBody({
      sessionId: "abc-123",
      prompt: "hello",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessionId).toBe("abc-123");
      expect(result.prompt).toBe("hello");
    }
  });

  it("accepts body without sessionId (new session)", () => {
    const result = validateChatBody({ prompt: "hello" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessionId).toBeUndefined();
      expect(result.prompt).toBe("hello");
    }
  });

  it("rejects missing prompt", () => {
    const result = validateChatBody({ sessionId: "abc-123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("prompt");
  });

  it("rejects empty prompt string", () => {
    const result = validateChatBody({ prompt: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only prompt", () => {
    const result = validateChatBody({ prompt: "   " });
    expect(result.ok).toBe(false);
  });

  it("rejects null body", () => {
    const result = validateChatBody(null);
    expect(result.ok).toBe(false);
  });

  it("rejects undefined body", () => {
    const result = validateChatBody(undefined);
    expect(result.ok).toBe(false);
  });

  it("strips empty string sessionId to undefined", () => {
    const result = validateChatBody({ sessionId: "", prompt: "hello" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessionId).toBeUndefined();
  });
});

// ── Test tool_execution_end result parsing ─────────────────────────────────

type ToolResult = { content: unknown; details?: unknown };

function parseToolUiResult(
  result: ToolResult | null | undefined,
  isError: boolean,
): { uiResult: unknown; isError: boolean } {
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
  if (isError && contentText) uiResult = contentText;
  if (uiResult == null) uiResult = isError ? "Tool execution failed" : null;

  return { uiResult, isError };
}

describe("parseToolUiResult", () => {
  it("extracts text content from result", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Hello world" }],
    };
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toBe("Hello world");
  });

  it("joins multiple text blocks", () => {
    const result: ToolResult = {
      content: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
    };
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toBe("Line 1\nLine 2");
  });

  it("returns details when present", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "some text" }],
      details: { projects: 3, prompts: 5 },
    };
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toEqual({ projects: 3, prompts: 5 });
  });

  it("returns text when details is an empty object", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "result text" }],
      details: {},
    };
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toBe("result text");
  });

  it("returns null for empty result with no text", () => {
    const result: ToolResult = {
      content: [],
      details: {},
    };
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toBeNull();
  });

  it("returns error message on error with text", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Something went wrong" }],
    };
    const { uiResult } = parseToolUiResult(result, true);
    expect(uiResult).toBe("Something went wrong");
  });

  it("returns fallback on error without text", () => {
    const result: ToolResult = {
      content: [],
    };
    const { uiResult } = parseToolUiResult(result, true);
    expect(uiResult).toBe("Tool execution failed");
  });

  it("handles null result gracefully", () => {
    const { uiResult } = parseToolUiResult(null, false);
    expect(uiResult).toBeNull();
  });

  it("handles undefined result gracefully", () => {
    const { uiResult } = parseToolUiResult(undefined, false);
    expect(uiResult).toBeNull();
  });

  it("handles result without content property", () => {
    const result = { details: { ok: true } } as unknown as ToolResult;
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toEqual({ ok: true });
  });

  it("handles result where content is not an array", () => {
    const result = { content: "not an array" } as unknown as ToolResult;
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toBeNull();
  });

  it("handles result with non-text content items", () => {
    const result: ToolResult = {
      content: [
        { type: "image", url: "https://example.com/img.png" },
        { type: "text", text: "valid text" },
      ],
    };
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toBe("valid text");
  });

  it("handles details that is null", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "text only" }],
      details: null,
    };
    const { uiResult } = parseToolUiResult(result, false);
    expect(uiResult).toBe("text only");
  });
});

// ── Test hydration of persisted AgentMessage[] to ChatMessage[] ────────────

interface AgentMessageShape {
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  timestamp?: number;
}

function hydrateMessages(raw: unknown[]): unknown[] {
  const result: unknown[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as AgentMessageShape;

    if (m.role === "user") {
      const text = extractTextContent(m.content);
      result.push({
        id: expect.any(String) as unknown,
        role: "user",
        textParts: text ? [text] : [],
        toolInvocations: [],
      });
    } else if (m.role === "assistant") {
      const blocks = Array.isArray(m.content) ? m.content : [];
      const textParts: string[] = [];
      const toolInvocations: unknown[] = [];
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as {
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        };
        if (b.type === "text" && typeof b.text === "string") {
          textParts.push(b.text);
        } else if (b.type === "toolCall") {
          toolInvocations.push({
            toolCallId: b.id ?? expect.any(String),
            toolName: b.name ?? "unknown",
            args: b.input ?? {},
            state: "done",
          });
        }
      }
      result.push({
        id: expect.any(String) as unknown,
        role: "assistant",
        textParts,
        toolInvocations,
      });
    }
  }
  return result;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type: string; text?: string } =>
          typeof c === "object" && c !== null && (c as { type: string }).type === "text",
      )
      .map((c) => (typeof c.text === "string" ? c.text : ""))
      .join("\n");
  }
  return "";
}

describe("hydrateMessages", () => {
  it("converts user messages with string content", () => {
    const raw = [{ role: "user", content: "hello world", timestamp: 123 }];
    const result = hydrateMessages(raw) as Array<{ role: string; textParts: string[] }>;
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].textParts).toEqual(["hello world"]);
  });

  it("converts user messages with content blocks", () => {
    const raw = [
      {
        role: "user",
        content: [
          { type: "text", text: "line 1" },
          { type: "text", text: "line 2" },
        ],
      },
    ];
    const result = hydrateMessages(raw) as Array<{ role: string; textParts: string[] }>;
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].textParts).toEqual(["line 1\nline 2"]);
  });

  it("converts assistant messages with text and tool calls", () => {
    const raw = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "toolCall", id: "call-1", name: "readState", input: {} },
          { type: "text", text: "Done." },
        ],
      },
    ];
    const result = hydrateMessages(raw) as Array<{
      role: string;
      textParts: string[];
      toolInvocations: unknown[];
    }>;
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].textParts).toEqual(["Let me check.", "Done."]);
    expect(result[0].toolInvocations).toHaveLength(1);
    expect((result[0].toolInvocations[0] as { toolName: string }).toolName).toBe("readState");
  });

  it("skips unknown message types", () => {
    const raw = [{ role: "custom", content: "ignored" }];
    const result = hydrateMessages(raw);
    expect(result).toHaveLength(0);
  });

  it("handles empty array", () => {
    expect(hydrateMessages([])).toHaveLength(0);
  });

  it("handles non-array content on user message", () => {
    const raw = [{ role: "user", content: undefined }];
    const result = hydrateMessages(raw) as Array<{ role: string; textParts: string[] }>;
    expect(result).toHaveLength(1);
    expect(result[0].textParts).toEqual([]);
  });

  it("handles assistant with empty content", () => {
    const raw = [{ role: "assistant", content: [] }];
    const result = hydrateMessages(raw) as Array<{
      role: string;
      textParts: string[];
      toolInvocations: unknown[];
    }>;
    expect(result).toHaveLength(1);
    expect(result[0].textParts).toEqual([]);
    expect(result[0].toolInvocations).toEqual([]);
  });
});
