import { Bot, ChevronDown, ChevronRight, Key, Loader2, Send, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FractalAgentProvider } from "~/lib/agent-providers.js";
import { createFractalAgentChatStream, getFractalAgentSession } from "~/lib/client/api.js";
import {
  clearFractalAgentSessionId,
  getFractalAgentSessionId,
  setFractalAgentSessionId,
} from "~/lib/client/persistence.js";
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

// ── Hydration: convert persisted AgentMessage[] to ChatMessage[] ───────────

interface AgentMessageShape {
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  timestamp?: number;
}

function hydrateMessages(raw: unknown[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as AgentMessageShape;

    if (m.role === "user") {
      const text = extractTextContent(m.content);
      result.push({
        id: crypto.randomUUID(),
        role: "user",
        textParts: text ? [text] : [],
        toolInvocations: [],
      });
    } else if (m.role === "assistant") {
      const blocks = Array.isArray(m.content) ? m.content : [];
      const textParts: string[] = [];
      const toolInvocations: ToolInvocation[] = [];
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as { type: string; text?: string; id?: string; name?: string; input?: unknown };
        if (b.type === "text" && typeof b.text === "string") {
          textParts.push(b.text);
        } else if (b.type === "toolCall") {
          toolInvocations.push({
            toolCallId: b.id ?? crypto.randomUUID(),
            toolName: b.name ?? "unknown",
            args: b.input ?? {},
            state: "done",
          });
        }
      }
      result.push({
        id: crypto.randomUUID(),
        role: "assistant",
        textParts,
        toolInvocations,
      });
    } else if (m.role === "toolResult") {
      const text = extractTextContent(m.content);
      result.push({
        id: crypto.randomUUID(),
        role: "tool",
        textParts: text ? [text] : [],
        toolInvocations: [
          {
            toolCallId: m.toolCallId ?? "",
            toolName: m.toolName ?? "unknown",
            args: {},
            result: text,
            isError: m.isError ?? false,
            state: "done",
          },
        ],
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
  const [sessionId, setSessionId] = useState<string | null>(() => getFractalAgentSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  // On mount, hydrate prior messages from the backend if we have a session
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const sid = getFractalAgentSessionId();
    if (!sid) return;

    getFractalAgentSession(sid)
      .then((session) => {
        if (Array.isArray(session.messages)) {
          setMessages(hydrateMessages(session.messages));
        }
      })
      .catch(() => {
        // Session may be expired or deleted; clear stale id
        clearFractalAgentSessionId();
        setSessionId(null);
      });
  }, []);

  const sendMessage = useCallback(
    async (text: string, skipUserMessage = false) => {
      if (!text.trim()) return;

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

      if (!skipUserMessage) {
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          textParts: [text.trim()],
          toolInvocations: [],
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
      } else {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      try {
        const { stream, sessionId: newSid } = await createFractalAgentChatStream({
          sessionId,
          prompt: text.trim(),
          signal: abortController.signal,
        });

        // Persist session ID if this is the first turn
        if (newSid && newSid !== sessionId) {
          setFractalAgentSessionId(newSid);
          setSessionId(newSid);
        }

        const reader = stream.getReader();
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
    },
    [sessionId],
  );

  const regenerate = useCallback(() => {
    setMessages((prev) => {
      // Drop the last assistant message so we have the user prompt as last
      const withoutLastAssistant = prev.filter(
        (m, i) => i !== prev.length - 1 || m.role !== "assistant",
      );
      // Re-send the last user message
      const lastUser = withoutLastAssistant.filter((m) => m.role === "user").pop();
      if (lastUser?.textParts[0]) {
        setTimeout(() => sendMessage(lastUser.textParts[0], true), 0);
      }
      return withoutLastAssistant;
    });
  }, [sendMessage]);

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
  const chat = useFractalAgentChat();
  const [input, setInput] = useState("");

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
            {hasProvider ? (
              <AgentChat chat={chat} input={input} onInputChange={setInput} open={open} />
            ) : (
              <AgentGatekeeper onOpenSettings={onOpenSettings} />
            )}
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

type FractalAgentChat = ReturnType<typeof useFractalAgentChat>;

function AgentChat({
  chat,
  input,
  onInputChange,
  open,
}: {
  chat: FractalAgentChat;
  input: string;
  onInputChange: (value: string) => void;
  open: boolean;
}) {
  const { messages, sendMessage, isLoading, error, regenerate, abort } = chat;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    onInputChange("");
    await sendMessage(text);
  }

  return (
    <div className="agent-chat">
      <AgentMessageStream messages={messages} bottomRef={bottomRef} />
      {error && (
        <div className="agent-error">
          <p>{error}</p>
          <button className="btn ghost sm" onClick={() => regenerate()}>
            Retry
          </button>
        </div>
      )}
      <AgentComposer
        input={input}
        onChange={(e) => onInputChange(e.target.value)}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onStop={abort}
        autoFocusSignal={open}
      />
    </div>
  );
}

function AgentMessageStream({
  messages,
  bottomRef,
}: {
  messages: ChatMessage[];
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (messages.length === 0) {
    return (
      <div className="agent-empty">
        <Bot size={24} strokeWidth={1.5} />
        <p>
          Ask me anything about Fractal. I can create prompts, launch agents, manage projects, and
          more.
        </p>
        <div ref={bottomRef} />
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
          {msg.role === "tool" &&
            msg.textParts.map((text, i) => (
              <div key={`tool-${i}`} className="agent-text agent-text-tool">
                {text}
              </div>
            ))}
        </div>
      ))}
      <div ref={bottomRef} />
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
  autoFocusSignal,
}: {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onStop: () => void;
  autoFocusSignal: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusSignal || isLoading) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [autoFocusSignal, isLoading]);
  return (
    <form className="agent-composer" onSubmit={onSubmit}>
      <input
        ref={inputRef}
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
