import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { WORKTREES_ROOT, ensureDir } from "./paths.js";
import { ensureWorktree, getRepoName } from "./git.js";
import { canonicalRunId } from "./branch-name.js";
import { ensureSession, sanitizeSessionName, spawnCommand } from "./tmux.js";
import { renderAgentCommand, type AgentPreset } from "./agents.js";

export type LaunchInPlaceResult = {
  tmuxSession: string;
};

export type LaunchInWorktreeResult = {
  branch: string;
  worktreePath: string;
  tmuxSession: string;
};

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

function parseImagePaths(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((path): path is string => {
      if (typeof path !== "string" || path.trim().length === 0) return false;
      if (!path.startsWith("/")) return false;
      if (!IMAGE_EXT_RE.test(path)) return false;
      try { return existsSync(path) && statSync(path).isFile(); } catch { return false; }
    });
  } catch {
    return [];
  }
}

function promptWithImages(preset: AgentPreset, prompt: string, imagePathsJson?: string | null): string {
  const imagePaths = parseImagePaths(imagePathsJson);
  if (imagePaths.length === 0) return prompt;
  const refs = preset.kind === "claude" ? imagePaths.map((path) => `@${path}`) : imagePaths;
  return `${prompt.trim()}\n\nAttached images:\n${refs.join("\n")}`.trim();
}

export async function launchInPlace(opts: {
  projectPath: string;
  projectName: string;
  promptId: string;
  prompt: string;
  imagePaths?: string | null;
  preset: AgentPreset;
  spawnAgent?: boolean;
}): Promise<LaunchInPlaceResult> {
  const session = sanitizeSessionName(canonicalRunId(opts.projectName, opts.prompt, opts.promptId.slice(0, 6)));
  await ensureSession(session, opts.projectPath);
  if (opts.spawnAgent !== false) {
    await spawnCommand(session, renderAgentCommand(opts.preset, promptWithImages(opts.preset, opts.prompt, opts.imagePaths)));
  }
  return { tmuxSession: session };
}

export async function launchInWorktree(opts: {
  projectPath: string;
  projectName: string;
  promptId: string;
  prompt: string;
  imagePaths?: string | null;
  preset: AgentPreset;
  branch?: string | null;
  worktreePath?: string | null;
  tmuxSession?: string | null;
  spawnAgent?: boolean;
}): Promise<LaunchInWorktreeResult> {
  const repoName = await getRepoName(opts.projectPath);
  const runId = sanitizeSessionName(canonicalRunId(repoName, opts.prompt, opts.promptId.slice(0, 6)));
  const branch = opts.branch ?? runId;
  const worktreePath = opts.worktreePath ?? join(WORKTREES_ROOT, repoName, runId);
  ensureDir(join(WORKTREES_ROOT, repoName));
  await ensureWorktree(opts.projectPath, branch, worktreePath);
  const session = opts.tmuxSession ?? runId;
  await ensureSession(session, worktreePath);
  if (opts.spawnAgent !== false) {
    await spawnCommand(session, renderAgentCommand(opts.preset, promptWithImages(opts.preset, opts.prompt, opts.imagePaths)));
  }
  return { branch, worktreePath, tmuxSession: session };
}
