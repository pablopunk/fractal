import { Bot, ChevronDown, ChevronRight, Key, Loader2, Send, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FractalAgentProvider } from "~/lib/agent-providers.js";
import MarkdownText from "./MarkdownText.js";
import Portal from "./Portal.js";

// ── Types ──────────────────────────────────────────────────────────────────

type ToolInvocation = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  state: "running" | "done";
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  textParts: string[];
  toolInvocations: ToolInvocation[];
};

type RequestMessage = {
  role: string;
  content: string;
};

function stringifyForContext(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateForContext(value: string): string {
  if (value.length <= 4000) return value;
  return `${value.slice(0, 4000)}… [truncated]`;
}

function serializeMessageForRequest(message: ChatMessage): RequestMessage {
  const text = message.textParts.join(" ").trim();
  if (message.role !== "assistant" || message.toolInvocations.length === 0) {
    return { role: message.role, content: text };
  }

  const toolSummary = message.toolInvocations.map((tool) => ({
    tool: tool.toolName,
    input: tool.args,
    result: tool.result,
    isError: tool.isError ?? false,
  }));
  const content = [
    text,
    `Tool activity from this assistant turn:\n${truncateForContext(stringifyForContext(toolSummary))}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { role: message.role, content };
}

// ── SSE Event Types ────────────────────────────────────────────────────────

type SseEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_start"; toolCallId: string; name: string; args: unknown }
  | { type: "tool_end"; toolCallId: string; name: string; result: unknown; isError?: boolean }
  | { type: "done" }
  | { type: "error"; message: string };

// ── Custom hook ────────────────────────────────────────────────────────────

function useFractalAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  /** Shared streaming fetch — used by both send and regenerate. */
  const doSend = useCallback(async (bodyMessages: RequestMessage[], addUserToState: boolean) => {
    abortRef.current?.abort();
    setIsLoading(true);
    setError(null);

    const abortController = new AbortController();
    abortRef.current = abortController;

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      textParts: [],
      toolInvocations: [],
    };
    if (addUserToState) {
      const lastMsg = bodyMessages[bodyMessages.length - 1];
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        textParts: [lastMsg.content],
        toolInvocations: [],
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
    } else {
      setMessages((prev) => [...prev, assistantMsg]);
    }

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: bodyMessages }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as SseEvent;
            setMessages((prev) => {
              const next = prev.map((m) => ({ ...m }));
              const assistant = next[next.length - 1];
              if (assistant?.role !== "assistant") return next;

              switch (event.type) {
                case "text_delta":
                  if (assistant.textParts.length === 0) {
                    assistant.textParts = [event.content];
                  } else {
                    assistant.textParts = [assistant.textParts[0] + event.content];
                  }
                  break;
                case "tool_start": {
                  const existing = assistant.toolInvocations.find(
                    (t) => t.toolCallId === event.toolCallId,
                  );
                  if (!existing) {
                    assistant.toolInvocations = [
                      ...assistant.toolInvocations,
                      {
                        toolCallId: event.toolCallId,
                        toolName: event.name,
                        args: event.args,
                        state: "running" as const,
                      },
                    ];
                  }
                  break;
                }
                case "tool_end": {
                  assistant.toolInvocations = assistant.toolInvocations.map((t) =>
                    t.toolCallId === event.toolCallId
                      ? {
                          ...t,
                          result: event.result,
                          isError: event.isError,
                          state: "done" as const,
                        }
                      : t,
                  );
                  break;
                }
                case "done":
                  break;
                case "error":
                  setError(event.message);
                  break;
              }
              return next;
            });
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      // Build full message history: all prior messages + the new user message
      const prior = messagesRef.current.map(serializeMessageForRequest);
      const fullMessages = [...prior, { role: "user", content: text }];
      await doSend(fullMessages, true);
    },
    [doSend],
  );

  const regenerate = useCallback(() => {
    setMessages((prev) => {
      // Drop the last assistant message so the last entry is the user prompt
      const withoutLastAssistant = prev.filter(
        (m, i) => i !== prev.length - 1 || m.role !== "assistant",
      );
      const contextMsgs = withoutLastAssistant.map(serializeMessageForRequest);
      // Re-send the existing context (last message is the user prompt)
      if (contextMsgs.length > 0 && contextMsgs[contextMsgs.length - 1].role === "user") {
        setTimeout(() => doSend(contextMsgs, false), 0);
      }
      return withoutLastAssistant;
    });
  }, [doSend]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, sendMessage, isLoading, error, regenerate, abort };
}

// ── Component ──────────────────────────────────────────────────────────────

type AgentPanelProps = {
  open: boolean;
  onToggle?: () => void;
  fractalAgentProvider: FractalAgentProvider | "";
  fractalAgentModel: string;
  onOpenSettings: () => void;
  mobile?: boolean;
};

export default function AgentPanel({
  open,
  onToggle,
  fractalAgentProvider,
  fractalAgentModel,
  onOpenSettings,
  mobile,
}: AgentPanelProps) {
  const hasProvider = Boolean(fractalAgentProvider) && Boolean(fractalAgentModel);

  return (
    <Portal>
      {mobile && !open && onToggle && <MobileFab onToggle={onToggle} />}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`agent-panel ${mobile ? "agent-panel-mobile" : ""}`}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            style={{ transformOrigin: "bottom left" }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          >
            <AgentHeader />
            {hasProvider ? <AgentChat /> : <AgentGatekeeper onOpenSettings={onOpenSettings} />}
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function MobileFab({ onToggle }: { onToggle: () => void }) {
  const [pos, setPos] = useState({ x: window.innerWidth - 64, y: window.innerHeight - 120 });
  const dragging = useRef(false);
  const origin = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !origin.current) return;
      moved.current = true;
      const nx = Math.max(
        0,
        Math.min(window.innerWidth - 56, origin.current.sx + e.clientX - origin.current.x),
      );
      const ny = Math.max(
        0,
        Math.min(window.innerHeight - 56, origin.current.sy + e.clientY - origin.current.y),
      );
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <button
      type="button"
      className="agent-mobile-fab"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => {
        moved.current = false;
        origin.current = { x: e.clientX, y: e.clientY, sx: pos.x, sy: pos.y };
        dragging.current = true;
      }}
      onClick={() => {
        if (moved.current) return;
        onToggle();
      }}
      aria-label="Toggle Fractal Agent"
    >
      <Bot size={22} strokeWidth={2} />
    </button>
  );
}

function AgentHeader() {
  return (
    <div className="agent-panel-header">
      <div className="agent-panel-title">
        <Bot size={16} strokeWidth={2.1} />
        <span>Fractal Agent</span>
      </div>
    </div>
  );
}

function AgentGatekeeper({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="agent-gatekeeper">
      <Key size={32} strokeWidth={1.5} className="agent-gatekeeper-icon" />
      <p>Fractal Agent not configured.</p>
      <p className="agent-gatekeeper-hint">
        Choose a provider and model in Settings → Fractal Agent. Fractal Agent requires local Pi
        with Pi auth already configured.
      </p>
      <button className="btn primary sm" onClick={onOpenSettings}>
        Open Settings
      </button>
    </div>
  );
}

function AgentChat() {
  const { messages, sendMessage, isLoading, error, regenerate, abort } = useFractalAgentChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage(text);
  }

  return (
    <div className="agent-chat">
      <AgentMessageStream messages={messages} />
      {error && (
        <div className="agent-error">
          <p>{error}</p>
          <button className="btn ghost sm" onClick={() => regenerate()}>
            Retry
          </button>
        </div>
      )}
      <div ref={bottomRef} />
      <AgentComposer
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onStop={abort}
      />
    </div>
  );
}

function AgentMessageStream({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="agent-empty">
        <Bot size={24} strokeWidth={1.5} />
        <p>
          Ask me anything about Fractal. I can create prompts, launch agents, manage projects, and
          more.
        </p>
      </div>
    );
  }

  return (
    <div className="agent-messages">
      {messages.map((msg) => (
        <div key={msg.id} className={`agent-message agent-message-${msg.role}`}>
          {msg.role === "assistant" && (
            <>
              {msg.textParts.map((text, i) =>
                text ? (
                  <div key={`text-${i}`} className="agent-text markdown-text">
                    <MarkdownText text={text} />
                  </div>
                ) : null,
              )}
              {msg.toolInvocations.map((inv) => (
                <ToolCallCard key={inv.toolCallId} invocation={inv} />
              ))}
            </>
          )}
          {msg.role === "user" &&
            msg.textParts.map((text, i) => (
              <div key={`user-${i}`} className="agent-text">
                {text}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function ToolCallCard({ invocation }: { invocation: ToolInvocation }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = invocation.state === "running";
  const isDone = invocation.state === "done";

  return (
    <div
      className={`agent-tool-card ${isRunning ? "tool-running" : ""} ${isDone ? "tool-done" : ""}`}
    >
      <button className="agent-tool-header" onClick={() => setExpanded(!expanded)} type="button">
        {isRunning ? <Loader2 size={12} className="agent-spin" /> : <Wrench size={12} />}
        <span>{invocation.toolName ?? "tool"}</span>
        {isDone && (
          <span className="agent-tool-status">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>
      {expanded && isDone && (
        <div className="agent-tool-detail">
          {invocation.args !== undefined && (
            <div className="agent-tool-section">
              <div className="agent-tool-label">Input</div>
              <pre>{JSON.stringify(invocation.args, null, 2)}</pre>
            </div>
          )}
          {invocation.result !== undefined && (
            <div className="agent-tool-section">
              <div className="agent-tool-label">Result</div>
              <pre>{JSON.stringify(invocation.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentComposer({
  input,
  onChange,
  onSubmit,
  isLoading,
  onStop,
}: {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onStop: () => void;
}) {
  return (
    <form className="agent-composer" onSubmit={onSubmit}>
      <input
        className="agent-composer-input"
        value={input}
        onChange={onChange}
        placeholder={isLoading ? "Fractal Agent is thinking..." : "Ask Fractal Agent..."}
        disabled={isLoading}
      />
      {isLoading ? (
        <button
          type="button"
          className="icon-btn agent-stop-btn"
          onClick={onStop}
          aria-label="Stop"
        >
          <Loader2 size={16} className="agent-spin" />
        </button>
      ) : (
        <button
          type="submit"
          className="icon-btn agent-send-btn"
          disabled={!input.trim()}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      )}
    </form>
  );
}
