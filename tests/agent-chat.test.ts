import { describe, expect, it } from "vitest";

// ── Test SSE event formatting ─────────────────────────────────────────────

// Replicate the safeJsonStringify and sseEvent logic from chat.ts
// to test in isolation without importing the full module (which depends on pi packages).
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
    // Should not throw, should fall back to string representation
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });

  it("handles BigInt gracefully", () => {
    const result = sseEvent({ value: BigInt(123) as unknown });
    // Should not throw
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });

  it("handles undefined gracefully", () => {
    const result = sseEvent(undefined);
    // JSON.stringify(undefined) returns undefined (not a string),
    // but our safe wrapper falls back to String(undefined)
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });

  it("handles functions gracefully", () => {
    const result = sseEvent({ fn: (() => {}) as unknown });
    expect(result).toContain("data: ");
    expect(typeof result).toBe("string");
  });
});

// ── Test message validation rules ─────────────────────────────────────────

type PriorMessage = { role: string; content: string };

function validateMessages(
  body: unknown,
): { ok: true; allMessages: PriorMessage[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const obj = body as Record<string, unknown>;
  const rawMessages = obj.messages;

  if (!Array.isArray(rawMessages)) {
    return { ok: false, error: "Invalid request: messages must be an array" };
  }

  if (rawMessages.length === 0) {
    return { ok: false, error: "No messages provided" };
  }

  const lastMsg = rawMessages[rawMessages.length - 1];
  if (
    !lastMsg ||
    typeof lastMsg !== "object" ||
    (lastMsg as PriorMessage).role !== "user" ||
    !(lastMsg as PriorMessage).content?.trim()
  ) {
    return { ok: false, error: "Last message must be a non-empty user message." };
  }

  return { ok: true, allMessages: rawMessages as PriorMessage[] };
}

describe("validateMessages", () => {
  it("accepts valid messages with user last", () => {
    const result = validateMessages({
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "do something" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.allMessages).toHaveLength(3);
  });

  it("rejects null/undefined body", () => {
    expect(validateMessages(null).ok).toBe(false);
    expect(validateMessages(undefined).ok).toBe(false);
  });

  it("rejects non-array messages", () => {
    const result = validateMessages({ messages: "not an array" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("array");
  });

  it("rejects messages as a plain object", () => {
    const result = validateMessages({ messages: { role: "user", content: "hi" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("array");
  });

  it("rejects empty messages array", () => {
    const result = validateMessages({ messages: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No messages");
  });

  it("rejects when last message is not user", () => {
    const result = validateMessages({
      messages: [{ role: "assistant", content: "hello" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("user message");
  });

  it("rejects when last message role is missing", () => {
    const result = validateMessages({
      messages: [{ content: "hello" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when last message has empty content", () => {
    const result = validateMessages({
      messages: [{ role: "user", content: "" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("non-empty");
  });

  it("rejects when last message has whitespace-only content", () => {
    const result = validateMessages({
      messages: [{ role: "user", content: "   " }],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts single valid user message", () => {
    const result = validateMessages({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(result.ok).toBe(true);
  });
});

// ── Test buildInitialMessages logic ────────────────────────────────────────

function buildInitialMessages(priorMessages: PriorMessage[]) {
  const messages: Array<{ role: string; content: string; timestamp?: number }> = [];
  for (const m of priorMessages) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content, timestamp: Date.now() });
    } else if (m.role === "assistant") {
      // In production, fauxAssistantMessage is used instead.
      // For testing, we just push a plain object to validate the filtering logic.
      messages.push({ role: "assistant", content: m.content });
    }
    // "tool" role messages are intentionally dropped — they're embedded in
    // the assistant message content by serializeMessageForRequest.
  }
  return messages;
}

describe("buildInitialMessages", () => {
  it("filters out non-user/non-assistant roles", () => {
    const result = buildInitialMessages([
      { role: "user", content: "hello" },
      { role: "tool", content: '{"result": "ok"}' },
      { role: "assistant", content: "done" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
  });

  it("only includes user timestamps", () => {
    const result = buildInitialMessages([
      { role: "user", content: "question" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "follow-up" },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBeDefined();
    expect(result[1].timestamp).toBeUndefined();
    expect(result[2].timestamp).toBeDefined();
  });

  it("handles empty array", () => {
    const result = buildInitialMessages([]);
    expect(result).toHaveLength(0);
  });

  it("drops messages with only tool roles", () => {
    const result = buildInitialMessages([
      { role: "tool", content: "result" },
      { role: "tool", content: "another" },
    ]);
    expect(result).toHaveLength(0);
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
    // null details should fall through to contentText
    expect(uiResult).toBe("text only");
  });
});
