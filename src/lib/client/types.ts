export type Column =
  | "PROMPTS"
  | "RUN_IN_PLACE"
  | "RUN_IN_WORKTREE"
  | "GITHUB"
  | "LINEAR"
  | "ARCHIVED";

export type Project = {
  id: string;
  name: string;
  path: string;
  icon?: string | null;
  iconMime?: string | null;
  defaultPresetId?: string | null;
  githubRepo?: string | null;
  showGithubIssues?: number | boolean | null;
  showLinearIssues?: number | boolean | null;
  sortOrder?: number;
};
export type ModelProfile = "fast" | "smart";
export type AgentPreset = {
  id: string;
  name: string;
  kind: "pi" | "claude" | "opencode" | "custom";
  binary: string;
  argsTemplate: string;
  model?: string;
  thinking?: string;
  promptTemplate?: string;
};
export type Prompt = {
  id: string;
  projectId: string;
  text: string;
  summary?: string | null;
  imagePaths: string;
  modelProfile: ModelProfile;
  presetId: string;
  column: Column;
  runMode?: "in_place" | "worktree" | null;
  branch?: string | null;
  worktreePath?: string | null;
  tmuxSession?: string | null;
  error?: string | null;
  isArchived?: boolean | null;
  issueRef?: string | null;
  launchedAt?: number | null;
  isRunning?: boolean;
};

import type { FractalAgentProvider } from "~/lib/agent-providers.js";

type ApiProvider = "anthropic" | "google" | "openai" | "openrouter" | "opencode-go";
export type AppSettings = {
  fastModel: string;
  smartModel: string;
  agentPresets: AgentPreset[];
  defaultPresetId: string;
  helperPresetId: string;
  lastProjectId: string;
  globalAgentPresetId: string;
  apiKeys?: Partial<Record<ApiProvider, string>>;
  fractalAgentProvider?: FractalAgentProvider | "";
  fractalAgentModel?: string;
};
export type PiModel = {
  id: string;
  provider: string;
  model: string;
  agent?: "pi" | "claude" | "opencode";
};
export type UrlPreview = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
  favicon: string;
};
export type TerminalTab = {
  id: string;
  promptId: string;
  projectId?: string;
  session: string;
  title: string;
  cwd?: string;
};
export type TerminalTabAccent = "in-place" | "worktree";
export type DecoratedTerminalTab = TerminalTab & { accent?: TerminalTabAccent };
export type GithubIssue = {
  number: number;
  title: string;
  url: string;
  labels: string[];
  createdAt: string;
};
export type LinearIssue = {
  identifier: string;
  title: string;
  url: string;
  state: string;
  priority: string;
};
