import type { AgentPreset } from "./agents.js";
import { exec } from "./exec.js";
import { capturePane } from "./tmux.js";

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

function prDescriptionPrompt(
  diffStat: string,
  gitLog: string,
  paneContent: string,
  taskText: string,
): string {
  const contextParts = [
    `## Task description

${taskText}`,
  ];
  if (diffStat.trim())
    contextParts.push(`## Changes (git diff --stat)

\`\`\`
${diffStat}
\`\`\``);
  if (gitLog.trim())
    contextParts.push(`## Recent commits

\`\`\`
${gitLog}
\`\`\``);
  if (paneContent.trim()) {
    const truncated = paneContent.slice(-4000);
    contextParts.push(`## Recent terminal output (last 4000 chars)

\`\`\`
${truncated}
\`\`\``);
  }

  return `${contextParts.join("\n\n")}

---

Write a GitHub pull request title and description for this work.

Return exactly two sections separated by "---":
first line: PR title (concise, 8-15 words)
then "---"
then: PR body (2-4 paragraphs, describe what changed and why, in plain English, no markdown tables, no lists of files)

Do not include any other text. Do not wrap the output in code fences.`;
}

function parsePrDescription(output: string): { title: string; body: string } {
  // Strip ANSI, trim
  const cleaned = output.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").trim();

  const sepIndex = cleaned.indexOf("---");
  if (sepIndex === -1) {
    // Fallback: treat first line as title, rest as body
    const lines = cleaned.split("\n");
    const title = lines[0].trim() || "Update";
    const body = lines.slice(1).join("\n").trim() || title;
    return { title, body };
  }
  const title = cleaned.slice(0, sepIndex).trim() || "Update";
  const body = cleaned.slice(sepIndex + 3).trim() || title;
  return { title, body };
}

export async function generatePrDescription(opts: {
  preset: AgentPreset;
  worktreePath: string;
  promptText: string;
  projectPath: string;
  tmuxSession?: string | null;
}): Promise<{ title: string; body: string }> {
  // Gather context: git diff, git log, optional tmux pane
  const [diffResult, logResult, paneContent] = await Promise.all([
    exec("git", ["-C", opts.worktreePath, "diff", "--stat"], {
      cwd: opts.worktreePath,
      timeoutMs: 10000,
    }).catch(() => ({ stdout: "", stderr: "", code: 0 })),
    exec("git", ["-C", opts.worktreePath, "log", "--oneline", "-5"], {
      cwd: opts.worktreePath,
      timeoutMs: 10000,
    }).catch(() => ({ stdout: "", stderr: "", code: 0 })),
    opts.tmuxSession
      ? capturePane(opts.tmuxSession, undefined, 200).catch(() => "")
      : Promise.resolve(""),
  ]);

  const prompt = prDescriptionPrompt(
    diffResult.stdout,
    logResult.stdout,
    typeof paneContent === "string" ? paneContent : "",
    opts.promptText,
  );

  const raw = await runPresetForText({
    preset: opts.preset,
    cwd: opts.projectPath,
    prompt,
  });
  return parsePrDescription(raw);
}
