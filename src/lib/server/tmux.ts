import { exec, ExecError } from "./exec.js";

/** tmux session names cannot contain `.` or `:`. */
export function sanitizeSessionName(name: string): string {
  return name.replace(/[.:\s]/g, "-").replace(/-+/g, "-").slice(0, 80);
}

export async function hasSession(name: string): Promise<boolean> {
  try {
    await exec("tmux", ["has-session", "-t", name]);
    return true;
  } catch (e) {
    if (e instanceof ExecError) return false;
    throw e;
  }
}

export async function listSessions(): Promise<string[]> {
  try {
    const { stdout } = await exec("tmux", ["list-sessions", "-F", "#{session_name}"]);
    return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    if (e instanceof ExecError) return [];
    throw e;
  }
}

export async function killSession(name: string): Promise<void> {
  try {
    if (await hasSession(name)) {
      await exec("tmux", ["kill-session", "-t", name]);
    }
  } catch (e) {
    if (e instanceof ExecError) return; // Session already gone
    throw e;
  }
}

export async function newSession(name: string, cwd: string): Promise<void> {
  await exec("tmux", ["new-session", "-d", "-s", name, "-c", cwd]);
}

export async function ensureSession(name: string, cwd: string): Promise<void> {
  if (!(await hasSession(name))) await newSession(name, cwd);
}

export async function sendKeys(name: string, command: string): Promise<void> {
  await exec("tmux", ["send-keys", "-t", name, command, "Enter"]);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Spawn `pi` with a single-arg prompt. Quotes args safely for the shell. */
export async function spawnPi(sessionName: string, prompt: string, model?: string): Promise<void> {
  const parts = ["pi"];
  if (model) parts.push("--model", shellQuote(model));
  parts.push(shellQuote(prompt));
  await sendKeys(sessionName, parts.join(" "));
}
