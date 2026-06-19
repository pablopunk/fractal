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
  thinking?: string;
  promptTemplate?: string;
};

export const DEFAULT_AGENT_PRESETS: AgentPreset[] = [
  {
    id: "pi",
    name: "Pi",
    kind: "pi",
    binary: "pi",
    argsTemplate: "--model {{model}} {{prompt}}",
    model: "",
  },
  {
    id: "claude",
    name: "Claude Code",
    kind: "claude",
    binary: "claude",
    argsTemplate: "--model {{model}} {{prompt}}",
    model: "sonnet",
  },
  {
    id: "opencode",
    name: "OpenCode",
    kind: "opencode",
    binary: "opencode",
    argsTemplate: "--model {{model}} --prompt {{prompt}}",
    model: "",
  },
];

export type AgentModel = {
  id: string;
  provider: string;
  model: string;
  agent: "pi" | "claude" | "opencode";
};

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

function parsePiListModels(output: string): AgentModel[] {
  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).flatMap((line) => {
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/);
    if (!match) return [];
    const [, provider, model] = match;
    return [{ provider, model, id: `${provider}/${model}`, agent: "pi" as const }];
  });
}

export async function listPiModels(): Promise<AgentModel[]> {
  const { stdout, stderr } = await exec(findBin("pi"), ["--list-models"], { timeoutMs: 30000 });
  const models = parsePiListModels(stdout);
  if (models.length > 0) return models;
  return parsePiListModels(stderr);
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
  return ids.map((model) => ({
    id: model,
    provider: "anthropic",
    model,
    agent: "claude" as const,
  }));
}

export async function listOpenCodeModels(): Promise<AgentModel[]> {
  const { stdout } = await exec(findBin("opencode"), ["models"], { timeoutMs: 30000 });
  return stdout.split(/\r?\n/).flatMap((line) => {
    const id = line.trim();
    if (!id?.includes("/")) return [];
    const slash = id.indexOf("/");
    return [
      { id, provider: id.slice(0, slash), model: id.slice(slash + 1), agent: "opencode" as const },
    ];
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function heredocDelimiter(value: string): string {
  let delimiter = "EOF";
  let i = 0;
  while (value.split(/\r?\n/).includes(delimiter)) {
    i += 1;
    delimiter = `EOF_${i}`;
  }
  return delimiter;
}

function shellPrompt(value: string): string {
  const delimiter = heredocDelimiter(value);
  return `"$(cat <<'${delimiter}'\n${value}\n${delimiter}\n)"`;
}

function isPiPreset(preset: Pick<AgentPreset, "kind" | "binary">): boolean {
  return preset.kind === "pi" || preset.binary === "pi";
}

function promptArgForPreset(preset: Pick<AgentPreset, "kind" | "binary">, value: string): string {
  if (isPiPreset(preset) && (value.startsWith("@") || value.startsWith("-"))) return ` ${value}`;
  return value;
}

function renderTemplate(
  template: string,
  vars: Record<string, string | undefined>,
  preset: Pick<AgentPreset, "kind" | "binary">,
): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => {
    const value = vars[key] ?? "";
    return key === "prompt" ? shellPrompt(promptArgForPreset(preset, value)) : shellQuote(value);
  });
}

export function thinkingArgsForPreset(
  preset: Pick<AgentPreset, "kind" | "binary" | "thinking">,
): string[] {
  if (!preset.thinking) return [];
  if (preset.kind === "pi" || preset.binary === "pi") return ["--thinking", preset.thinking];
  if (preset.kind === "claude" || preset.binary === "claude") return ["--effort", preset.thinking];
  if (preset.kind === "opencode" || preset.binary === "opencode")
    return ["--variant", preset.thinking];
  return [];
}

export function renderAgentCommand(preset: AgentPreset, prompt: string): string {
  const renderedPrompt = preset.promptTemplate?.trim()
    ? preset.promptTemplate.replace(/{{\s*prompt\s*}}/g, () => prompt)
    : prompt;
  const thinkingArgs = thinkingArgsForPreset(preset).map(shellQuote).join(" ");
  const args = renderTemplate(
    preset.argsTemplate,
    { prompt: renderedPrompt, model: preset.model },
    preset,
  );
  return [preset.binary, thinkingArgs, args].filter(Boolean).join(" ");
}
