import { ExecError, exec } from "./exec.js";

const TMUX_MISSING_MESSAGE =
  "tmux is required to run agents and open terminals. Please install tmux and restart Fractal.";

function isMissingTmuxError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function rethrowMissingTmux(error: unknown): never {
  if (isMissingTmuxError(error)) throw new Error(TMUX_MISSING_MESSAGE);
  throw error;
}

function tmuxEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

/** tmux session names cannot contain `.` or `:`. */
export function sanitizeSessionName(name: string): string {
  return name
    .replace(/[.:\s]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function hasSession(name: string): Promise<boolean> {
  try {
    await exec("tmux", ["has-session", "-t", name], { env: tmuxEnv() });
    return true;
  } catch (e) {
    if (e instanceof ExecError) return false;
    rethrowMissingTmux(e);
  }
}

export async function listSessions(): Promise<string[]> {
  try {
    const { stdout } = await exec("tmux", ["list-sessions", "-F", "#{session_name}"], {
      env: tmuxEnv(),
    });
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (e) {
    if (e instanceof ExecError) return [];
    rethrowMissingTmux(e);
  }
}

export async function killSession(name: string): Promise<void> {
  try {
    if (await hasSession(name)) {
      await exec("tmux", ["kill-session", "-t", name], { env: tmuxEnv() });
    }
  } catch (e) {
    if (e instanceof ExecError) return; // Session already gone
    rethrowMissingTmux(e);
  }
}

export async function newSession(name: string, cwd: string): Promise<void> {
  try {
    await exec("tmux", ["new-session", "-d", "-s", name, "-c", cwd], { env: tmuxEnv() });
  } catch (e) {
    rethrowMissingTmux(e);
  }
}

export async function ensureSession(name: string, cwd: string): Promise<void> {
  if (!(await hasSession(name))) await newSession(name, cwd);
}

export async function sendKeys(name: string, command: string): Promise<void> {
  try {
    const env = tmuxEnv();
    await exec("tmux", ["send-keys", "-l", "-t", name, command], { env });
    await exec("tmux", ["send-keys", "-t", name, "Enter"], { env });
  } catch (e) {
    rethrowMissingTmux(e);
  }
}

export async function spawnCommand(sessionName: string, command: string): Promise<void> {
  await sendKeys(sessionName, command);
}
