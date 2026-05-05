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

export async function newSession(name: string, cwd: string): Promise<void> {
  await exec("tmux", ["new-session", "-d", "-s", name, "-c", cwd]);
}

export async function ensureSession(name: string, cwd: string): Promise<void> {
  if (!(await hasSession(name))) await newSession(name, cwd);
}

export async function sendKeys(name: string, command: string): Promise<void> {
  await exec("tmux", ["send-keys", "-t", name, command, "Enter"]);
}

/** Spawn `pi` with a single-arg prompt. Quotes the prompt safely for the shell. */
export async function spawnPi(sessionName: string, prompt: string): Promise<void> {
  const quoted = `'${prompt.replace(/'/g, `'\\''`)}'`;
  await sendKeys(sessionName, `pi ${quoted}`);
}
