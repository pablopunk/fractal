import { spawn } from "node:child_process";

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

export function exec(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
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
