import { basename } from "node:path";
import type { Prompt } from "./db/schema.js";
import { listSessions } from "./tmux.js";

export type PromptWithStatus = Prompt & { isRunning: boolean };

function promptSessionCandidates(prompt: Prompt): string[] {
  return [prompt.tmuxSession, prompt.worktreePath ? basename(prompt.worktreePath) : null]
    .filter((value): value is string => !!value);
}

function hasMatchingSession(prompt: Prompt, sessions: string[]): boolean {
  const candidates = promptSessionCandidates(prompt);
  return candidates.some((candidate) => sessions.includes(candidate));
}

export async function withPromptStatus(prompt: Prompt): Promise<PromptWithStatus> {
  return {
    ...prompt,
    isRunning: hasMatchingSession(prompt, await listSessions()),
  };
}

export async function withPromptsStatus(prompts: Prompt[]): Promise<PromptWithStatus[]> {
  const sessions = await listSessions();
  return prompts.map((prompt) => ({ ...prompt, isRunning: hasMatchingSession(prompt, sessions) }));
}
