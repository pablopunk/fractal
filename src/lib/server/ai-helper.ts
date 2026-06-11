import type { AgentPreset } from "./agents.js";
import { exec } from "./exec.js";

const SUMMARY_TIMEOUT_MS = 60_000;
const MIN_SUMMARY_CHARACTERS = 96;
const MIN_SUMMARY_WORDS = 14;

function normalizePromptForSummary(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\S+\.(?:png|jpe?g|gif|webp|heic|svg)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function shouldSummarizePromptText(text: string): boolean {
  const normalized = normalizePromptForSummary(text);
  return (
    text.length >= MIN_SUMMARY_CHARACTERS ||
    wordCount(text) >= MIN_SUMMARY_WORDS ||
    normalized.length >= MIN_SUMMARY_CHARACTERS ||
    wordCount(normalized) >= MIN_SUMMARY_WORDS
  );
}

function cleanOutput(value: string): string {
  return value
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => line.replace(/^(["'`])(.*)\1$/, "$2"))
    .join("\n")
    .slice(0, 320);
}

function helperPrompt(text: string): string {
  return `Create a compact two-line Fractal card summary for this coding task.

Return exactly two lines and nothing else:
Line 1: a clear title, 4-8 words, no trailing punctuation.
Line 2: one short sentence describing the actual requested work.

Focus on the concrete product/code change, bug, investigation target, or decision the user wants.
Ignore boilerplate process instructions such as exploring the repo first, looking at screenshots, avoiding assumptions, writing tests, opening PRs, or using specific tools unless that is the actual task.
If the prompt contains both context and a requested action, summarize the requested action.

Examples:
Prompt: before any assumptions, explore this repo first and fix cmd+enter so it opens the selected file in finder
Summary:
Fix finder shortcut behavior
Make Cmd+Enter open the selected file location in Finder.

Prompt: let's review the summarize prompt feature. this was not useful at all. before any assumptions, explore this repo first
Summary:
Improve prompt summaries
Rethink the summary prompt so cards capture the real task instead of boilerplate.

Task:
${text}`;
}

export async function runPresetForText(input: {
  preset: AgentPreset;
  cwd: string;
  prompt: string;
}): Promise<string> {
  const prompt = input.preset.promptTemplate?.trim()
    ? input.preset.promptTemplate.replace(/{{\s*prompt\s*}}/g, () => input.prompt)
    : input.prompt;
  const modelArgs = input.preset.model ? ["--model", input.preset.model] : [];

  if (input.preset.binary === "pi" || input.preset.kind === "pi") {
    const { stdout } = await exec(
      input.preset.binary,
      [
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
      ],
      { cwd: input.cwd, timeoutMs: SUMMARY_TIMEOUT_MS },
    );
    return cleanOutput(stdout);
  }

  if (input.preset.binary === "opencode" || input.preset.kind === "opencode") {
    const { stdout } = await exec(input.preset.binary, ["run", "--pure", ...modelArgs, prompt], {
      cwd: input.cwd,
      timeoutMs: SUMMARY_TIMEOUT_MS,
    });
    return cleanOutput(stdout);
  }

  throw new Error(`Preset ${input.preset.name} cannot be used as a Fractal AI helper yet`);
}

export async function summarizePromptText(input: {
  preset: AgentPreset;
  cwd: string;
  text: string;
  force?: boolean;
}): Promise<string> {
  if (!input.force && !shouldSummarizePromptText(input.text)) return "";
  return runPresetForText({
    preset: input.preset,
    cwd: input.cwd,
    prompt: helperPrompt(input.text),
  });
}
