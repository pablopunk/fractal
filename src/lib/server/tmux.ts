import { ExecError, exec } from "./exec.js";

const TMUX_MISSING_MESSAGE =
  "tmux is required to run agents and open terminals. Please install tmux and restart Fractal.";

export { isMissingTmuxError, TMUX_MISSING_MESSAGE };

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

export async function capturePane(
  session: string,
  target?: string,
  lines?: number,
): Promise<string> {
  try {
    const paneTarget = target ? `${session}.${target}` : session;
    const args = ["capture-pane", "-t", paneTarget, "-p"];
    if (lines) {
      args.push("-S", `-${lines}`);
      args.push("-E", "-");
    }
    const { stdout } = await exec("tmux", args);
    return stdout;
  } catch (e) {
    if (e instanceof ExecError) throw new Error(`session not found: ${session}`);
    rethrowMissingTmux(e);
  }
}

export async function listPanes(
  session: string,
): Promise<Array<{ index: number; title: string; active: boolean; currentPath: string }>> {
  try {
    const { stdout } = await exec("tmux", [
      "list-panes",
      "-t",
      session,
      "-F",
      "#{pane_index}\t#{pane_title}\t#{pane_active}\t#{pane_current_path}",
    ]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [index, title, active, currentPath] = line.split("\t");
        return { index: Number(index), title, active: active === "1", currentPath };
      });
  } catch (e) {
    if (e instanceof ExecError) throw new Error(`session not found: ${session}`);
    rethrowMissingTmux(e);
  }
}
