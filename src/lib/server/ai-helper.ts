import { exec } from "./exec.js";
import { type AgentPreset } from "./agents.js";

const SUMMARY_TIMEOUT_MS = 60_000;

function cleanOutput(value: string): string {
  return value
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/^(["'`])(.*)\1$/, "$2")
    .slice(0, 240);
}

function helperPrompt(text: string): string {
  return `Summarize this coding task as a short Fractal card label. Return only the label, no quotes, no punctuation, no word count, no explanation. Aim for 4-8 words.\n\nTask:\n${text}`;
}

export async function runPresetForText(input: { preset: AgentPreset; cwd: string; prompt: string }): Promise<string> {
  const prompt = input.preset.promptTemplate?.trim()
    ? input.preset.promptTemplate.replace(/{{\s*prompt\s*}}/g, () => input.prompt)
    : input.prompt;
  const modelArgs = input.preset.model ? ["--model", input.preset.model] : [];

  if (input.preset.binary === "pi" || input.preset.kind === "pi") {
    const { stdout } = await exec(input.preset.binary, [
      "-p",
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-session",
      "--thinking",
      "off",
      ...modelArgs,
      prompt,
    ], { cwd: input.cwd, timeoutMs: SUMMARY_TIMEOUT_MS });
    return cleanOutput(stdout);
  }

  if (input.preset.binary === "opencode" || input.preset.kind === "opencode") {
    const { stdout } = await exec(input.preset.binary, ["run", "--pure", ...modelArgs, prompt], { cwd: input.cwd, timeoutMs: SUMMARY_TIMEOUT_MS });
    return cleanOutput(stdout);
  }

  throw new Error(`Preset ${input.preset.name} cannot be used as a Fractal AI helper yet`);
}

export async function summarizePromptText(input: { preset: AgentPreset; cwd: string; text: string }): Promise<string> {
  return runPresetForText({ preset: input.preset, cwd: input.cwd, prompt: helperPrompt(input.text) });
}
