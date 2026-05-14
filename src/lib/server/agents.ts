import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "./exec.js";

export type AgentKind = "pi" | "claude" | "opencode" | "custom";

export type AgentPreset = {
  id: string;
  name: string;
  kind: AgentKind;
  binary: string;
  argsTemplate: string;
  model?: string;
  promptTemplate?: string;
};

export const DEFAULT_AGENT_PRESETS: AgentPreset[] = [
  { id: "pi", name: "Pi", kind: "pi", binary: "pi", argsTemplate: "--model {{model}} {{prompt}}", model: "" },
  { id: "claude", name: "Claude Code", kind: "claude", binary: "claude", argsTemplate: "--model {{model}} {{prompt}}", model: "sonnet" },
  { id: "opencode", name: "OpenCode", kind: "opencode", binary: "opencode", argsTemplate: "--model {{model}} --prompt {{prompt}}", model: "" },
];

export type AgentModel = { id: string; provider: string; model: string; agent: "pi" | "claude" | "opencode" };

function findBin(name: string): string {
  const home = process.env.HOME ?? "";
  const candidates = [
    join(home, `.opencode/bin/${name}`),
    join(home, `.bun/bin/${name}`),
    join(home, `.local/share/mise/shims/${name}`),
    join(home, `.local/share/mise/installs/node/22.21.1/bin/${name}`),
    join(home, `.local/bin/${name}`),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ];
  return candidates.find(existsSync) ?? name;
}

export async function listPiModels(): Promise<AgentModel[]> {
  const { stdout, stderr } = await exec(findBin("pi"), ["--list-models"], { timeoutMs: 30000 });
  const lines = (stderr || stdout).split(/\r?\n/).filter(Boolean);
  return lines.slice(1).flatMap((line) => {
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/);
    if (!match) return [];
    const [, provider, model] = match;
    return [{ provider, model, id: `${provider}/${model}`, agent: "pi" as const }];
  });
}

export function listClaudeModels(): AgentModel[] {
  // Values accepted by `claude --model`. Aliases auto-resolve to the latest
  // recommended version; full ids use dashes (not dots, unlike pricing keys).
  const ids = [
    "default",
    "sonnet",
    "opus",
    "haiku",
    "opusplan",
    "sonnet[1m]",
    "opus[1m]",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5",
    "claude-opus-4-1",
    "claude-haiku-4-5",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
  ];
  return ids.map((model) => ({ id: model, provider: "anthropic", model, agent: "claude" as const }));
}

export async function listOpenCodeModels(): Promise<AgentModel[]> {
  const { stdout } = await exec(findBin("opencode"), ["models"], { timeoutMs: 30000 });
  return stdout.split(/\r?\n/).flatMap((line) => {
    const id = line.trim();
    if (!id || !id.includes("/")) return [];
    const slash = id.indexOf("/");
    return [{ id, provider: id.slice(0, slash), model: id.slice(slash + 1), agent: "opencode" as const }];
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => shellQuote(vars[key] ?? ""));
}

export function renderAgentCommand(preset: AgentPreset, prompt: string): string {
  const renderedPrompt = preset.promptTemplate?.trim()
    ? preset.promptTemplate.replace(/{{\s*prompt\s*}}/g, () => prompt)
    : prompt;
  const args = renderTemplate(preset.argsTemplate, { prompt: renderedPrompt, model: preset.model });
  return [preset.binary, args].filter(Boolean).join(" ");
}
