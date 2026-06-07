import { execFileSync, spawn } from "node:child_process";
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

let secretsEnv: NodeJS.ProcessEnv | null = null;

function getSecretsEnv(): NodeJS.ProcessEnv {
  if (secretsEnv) return secretsEnv;
  secretsEnv = {};
  const home = process.env.HOME ?? "";
  const secretsPath = join(home, ".zshrc.d", "01-secrets.sh");
  if (!existsSync(secretsPath)) return secretsEnv;

  try {
    const output = execFileSync("/bin/zsh", ["-c", "source $HOME/.zshrc.d/01-secrets.sh >/dev/null 2>&1; /usr/bin/env -0"], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
    for (const entry of output.split("\0")) {
      const eq = entry.indexOf("=");
      if (eq <= 0) continue;
      const key = entry.slice(0, eq);
      if (["_", "PWD", "OLDPWD", "SHLVL"].includes(key)) continue;
      secretsEnv[key] = entry.slice(eq + 1);
    }
  } catch (err) {
    console.error("[fractal-exec] failed to load secrets env:", err);
  }

  return secretsEnv;
}

function buildExecEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...getSecretsEnv(), ...env };
  const home = next.HOME ?? "";
  const pathEntries = new Set((next.PATH ?? "").split(delimiter).filter(Boolean));
  const candidates = [
    join(home, ".pi/agent/bin"),
    join(home, ".opencode/bin"),
    join(home, ".bun/bin"),
    join(home, ".cargo/bin"),
    join(home, ".local/bin"),
    join(home, ".local/share/mise/shims"),
    join(home, ".nix-profile/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/usr/sbin",
    "/bin",
    "/sbin",
    "/snap/bin",
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
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; input?: string } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: buildExecEnv(opts.env ?? process.env),
      stdio: [opts.input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout!.on("data", (d) => (stdout += d.toString()));
    child.stderr!.on("data", (d) => (stderr += d.toString()));
    if (opts.input && child.stdin) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
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
