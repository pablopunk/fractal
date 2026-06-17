import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ChevronDown,
  ChevronRight,
  Key,
  Loader2,
  Minimize2,
  Send,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Portal from "./Portal.js";

type AgentPanelProps = {
  open: boolean;
  onClose: () => void;
  apiKeys: Record<string, string> | undefined;
  onOpenSettings: () => void;
};

export default function AgentPanel({ open, onClose, apiKeys, onOpenSettings }: AgentPanelProps) {
  const [minimized, setMinimized] = useState(false);

  const hasKeys = apiKeys && Object.keys(apiKeys).some((k) => apiKeys[k]);

  return (
    <AnimatePresence>
      {open && (
        <Portal>
          <motion.div
            className="agent-panel"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              height: minimized ? "auto" : undefined,
            }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          >
            {minimized ? (
              <AgentHeader onMaximize={() => setMinimized(false)} onClose={onClose} minimized />
            ) : (
              <>
                <AgentHeader onMinimize={() => setMinimized(true)} onClose={onClose} />
                {hasKeys ? <AgentChat /> : <AgentGatekeeper onOpenSettings={onOpenSettings} />}
              </>
            )}
          </motion.div>
        </Portal>
      )}
    </AnimatePresence>
  );
}

function AgentHeader({
  onMinimize,
  onMaximize,
  onClose,
  minimized,
}: {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose: () => void;
  minimized?: boolean;
}) {
  return (
    <div className="agent-panel-header">
      <div className="agent-panel-title">
        <Sparkles size={16} strokeWidth={2.2} />
        <span>Fractal Agent</span>
      </div>
      <div className="agent-panel-actions">
        {minimized ? (
          <button
            className="icon-btn agent-panel-btn"
            onClick={onMaximize}
            aria-label="Maximize"
            title="Maximize"
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            className="icon-btn agent-panel-btn"
            onClick={onMinimize}
            aria-label="Minimize"
            title="Minimize"
          >
            <Minimize2 size={14} />
          </button>
        )}
        <button
          className="icon-btn agent-panel-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X size={14} />
        </button>
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
        <Sparkles size={24} strokeWidth={1.5} />
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
