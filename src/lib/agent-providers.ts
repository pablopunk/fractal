export const FRACTAL_AGENT_PROVIDERS = [
  {
    id: "anthropic" as const,
    label: "Anthropic",
    keyLabel: "Anthropic API Key",
    keyHint: "Used for Claude models (claude-sonnet-4-5, etc.)",
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "google" as const,
    label: "Google",
    keyLabel: "Google API Key",
    keyHint: "Used for Gemini models (gemini-2.5-pro, etc.)",
    keyPlaceholder: "...",
  },
  {
    id: "openai" as const,
    label: "OpenAI",
    keyLabel: "OpenAI API Key",
    keyHint: "Used for GPT models (gpt-4o, etc.)",
    keyPlaceholder: "sk-...",
  },
  {
    id: "openrouter" as const,
    label: "OpenRouter",
    keyLabel: "OpenRouter API Key",
    keyHint: "Multi-provider access to many models",
    keyPlaceholder: "sk-or-...",
  },
  {
    id: "opencode-go" as const,
    label: "OpenCode Go",
    keyLabel: "OpenCode Go API Key",
    keyHint: "OpenCode Go API (deepseek, kimi, glm, mimo models)",
    keyPlaceholder: "...",
  },
] as const;

export type FractalAgentProvider = (typeof FRACTAL_AGENT_PROVIDERS)[number]["id"];

/** Models available for the Fractal Agent, keyed by provider. */
export const FRACTAL_AGENT_MODELS: Record<
  FractalAgentProvider,
  Array<{ id: string; label: string }>
> = {
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { id: "claude-haiku-4-5-20250501", label: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  ],
  google: [
    { id: "gemini-2.5-pro-exp-03-25", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-5", label: "GPT-5" },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5 (via OpenRouter)" },
    { id: "anthropic/claude-opus-4-5", label: "Claude Opus 4.5 (via OpenRouter)" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (via OpenRouter)" },
    { id: "openai/gpt-4o", label: "GPT-4o (via OpenRouter)" },
    { id: "deepseek/deepseek-chat", label: "DeepSeek V3 (via OpenRouter)" },
  ],
  "opencode-go": [
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    { id: "glm-5.2", label: "GLM 5.2" },
    { id: "glm-5.1", label: "GLM 5.1" },
    { id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
    { id: "kimi-k2.6", label: "Kimi K2.6" },
    { id: "mimo-v2.5", label: "MiMo V2.5" },
    { id: "mimo-v2.5-pro", label: "MiMo V2.5 Pro" },
  ],
};

export function providerLabel(id: FractalAgentProvider): string {
  return FRACTAL_AGENT_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

export function modelLabel(provider: FractalAgentProvider, modelId: string): string {
  return FRACTAL_AGENT_MODELS[provider]?.find((m) => m.id === modelId)?.label ?? modelId;
}
