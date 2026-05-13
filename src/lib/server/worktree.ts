import { join } from "node:path";
import { existsSync } from "node:fs";
import { WORKTREES_ROOT, ensureDir } from "./paths.js";
import { createWorktree, getRepoName } from "./git.js";
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

export async function launchInPlace(opts: {
  projectPath: string;
  projectName: string;
  promptId: string;
  prompt: string;
  preset: AgentPreset;
}): Promise<LaunchInPlaceResult> {
  const session = sanitizeSessionName(canonicalRunId(opts.projectName, opts.prompt, opts.promptId.slice(0, 6)));
  await ensureSession(session, opts.projectPath);
  await spawnCommand(session, renderAgentCommand(opts.preset, opts.prompt));
  return { tmuxSession: session };
}

export async function launchInWorktree(opts: {
  projectPath: string;
  projectName: string;
  promptId: string;
  prompt: string;
  preset: AgentPreset;
}): Promise<LaunchInWorktreeResult> {
  const repoName = await getRepoName(opts.projectPath);
  const runId = sanitizeSessionName(canonicalRunId(repoName, opts.prompt, opts.promptId.slice(0, 6)));
  const branch = runId;
  const worktreePath = join(WORKTREES_ROOT, repoName, runId);
  ensureDir(join(WORKTREES_ROOT, repoName));
  if (!existsSync(worktreePath)) {
    await createWorktree(opts.projectPath, branch, worktreePath);
  }
  const session = runId;
  await ensureSession(session, worktreePath);
  await spawnCommand(session, renderAgentCommand(opts.preset, opts.prompt));
  return { branch, worktreePath, tmuxSession: session };
}
