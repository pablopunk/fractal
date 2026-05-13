import type { Prompt } from "./db/schema.js";
import { listSessions } from "./tmux.js";

export type PromptWithStatus = Prompt & { isRunning: boolean };

function hasPromptSession(prompt: Prompt, sessions: string[]): boolean {
  return !!prompt.tmuxSession && sessions.includes(prompt.tmuxSession);
}

export async function withPromptStatus(prompt: Prompt): Promise<PromptWithStatus> {
  return {
    ...prompt,
    isRunning: hasPromptSession(prompt, await listSessions()),
  };
}

export async function withPromptsStatus(prompts: Prompt[]): Promise<PromptWithStatus[]> {
  const sessions = await listSessions();
  return prompts.map((prompt) => ({ ...prompt, isRunning: hasPromptSession(prompt, sessions) }));
}
