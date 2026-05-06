import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export class ExecError extends Error {
  result: ExecResult;
  cmd: string;
  args: string[];
  constructor(cmd: string, args: string[], result: ExecResult) {
    super(`${cmd} ${args.join(" ")} exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
    this.cmd = cmd;
    this.args = args;
    this.result = result;
  }
}

function buildExecEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  const home = next.HOME ?? "";
  const pathEntries = new Set((next.PATH ?? "").split(delimiter).filter(Boolean));
  const candidates = [
    join(home, ".pi/agent/bin"),
    join(home, ".bun/bin"),
    join(home, ".local/bin"),
    join(home, ".local/share/mise/shims"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];

  const miseNodeRoot = join(home, ".local/share/mise/installs/node");
  if (existsSync(miseNodeRoot)) {
    for (const version of readdirSync(miseNodeRoot)) {
      candidates.push(join(miseNodeRoot, version, "bin"));
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) pathEntries.add(candidate);
  }

  next.PATH = Array.from(pathEntries).join(delimiter);
  return next;
}

export function exec(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: buildExecEnv(opts.env ?? process.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    let timer: NodeJS.Timeout | null = null;
    if (opts.timeoutMs) {
      timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    }
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const result: ExecResult = { stdout, stderr, code: code ?? -1 };
      if (code === 0) resolve(result);
      else reject(new ExecError(cmd, args, result));
    });
  });
}
