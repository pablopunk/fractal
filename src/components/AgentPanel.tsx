import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, ChevronDown, ChevronRight, Key, Loader2, Send, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Portal from "./Portal.js";

type AgentPanelProps = {
  open: boolean;
  onToggle?: () => void;
  apiKeys: Record<string, string> | undefined;
  onOpenSettings: () => void;
  mobile?: boolean;
};

export default function AgentPanel({
  open,
  onToggle,
  apiKeys,
  onOpenSettings,
  mobile,
}: AgentPanelProps) {
  const hasKeys = apiKeys && Object.keys(apiKeys).some((k) => apiKeys[k]);

  return (
    <Portal>
      {mobile && onToggle && <MobileFab onToggle={onToggle} />}
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
            {hasKeys ? <AgentChat /> : <AgentGatekeeper onOpenSettings={onOpenSettings} />}
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
      <p>No API key configured.</p>
      <p className="agent-gatekeeper-hint">
        Add an Anthropic, Google, OpenAI, or OpenRouter API key in Settings → AI Provider.
      </p>
      <button className="btn primary sm" onClick={onOpenSettings}>
        Open Settings
      </button>
    </div>
  );
}

function AgentChat() {
  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent/chat" }),
  });

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [messages.length]);

  const isLoading = status === "submitted" || status === "streaming";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className="agent-chat">
      <AgentMessageStream messages={messages} />
      {error && (
        <div className="agent-error">
          <p>{error.message || "Something went wrong"}</p>
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
      />
    </div>
  );
}

type UIMessage = {
  id: string;
  role: string;
  parts: Array<{
    type: string;
    text?: string;
    toolInvocation?: {
      toolName?: string;
      args?: unknown;
      result?: unknown;
      state?: string;
    };
  }>;
};

function AgentMessageStream({ messages }: { messages: UIMessage[] }) {
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
          {msg.parts?.map((part, i) => {
            if (part.type === "text" && part.text) {
              return (
                <div key={i} className="agent-text">
                  {part.text}
                </div>
              );
            }
            if (part.type === "tool-invocation" && part.toolInvocation) {
              return <ToolCallCard key={i} invocation={part.toolInvocation} />;
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}

function ToolCallCard({
  invocation,
}: {
  invocation: {
    toolName?: string;
    args?: unknown;
    result?: unknown;
    state?: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = invocation.state === "call";
  const isDone = invocation.state === "result";

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
}: {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
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
      <button
        type="submit"
        className="icon-btn agent-send-btn"
        disabled={!input.trim() || isLoading}
        aria-label="Send"
      >
        {isLoading ? <Loader2 size={16} className="agent-spin" /> : <Send size={16} />}
      </button>
    </form>
  );
}
