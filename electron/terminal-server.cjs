const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { WebSocketServer } = require("ws");
const pty = require("node-pty");

function buildTerminalEnv() {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  // LaunchServices (Finder launch) doesn't load shell init, so LANG/LC_* may be
  // unset or "C" — that makes tmux/zsh/etc transliterate Unicode glyphs to ASCII
  // (underscores). Force a UTF-8 locale so Nerd Font / Powerline / box-drawing
  // characters survive the pipeline.
  const hasUtf8Lang =
    /UTF-?8/i.test(String(env.LANG || "")) ||
    /UTF-?8/i.test(String(env.LC_ALL || "")) ||
    /UTF-?8/i.test(String(env.LC_CTYPE || ""));
  if (!hasUtf8Lang) {
    env.LANG = "en_US.UTF-8";
    env.LC_ALL = "en_US.UTF-8";
    env.LC_CTYPE = "en_US.UTF-8";
  }
  const entries = new Set(
    String(env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean),
  );
  for (const candidate of [
    path.join(os.homedir(), ".pi/agent/bin"),
    path.join(os.homedir(), ".bun/bin"),
    path.join(os.homedir(), ".cargo/bin"),
    path.join(os.homedir(), ".local/bin"),
    path.join(os.homedir(), ".local/share/mise/shims"),
    path.join(os.homedir(), ".nix-profile/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/usr/sbin",
    "/bin",
    "/sbin",
    "/snap/bin",
  ]) {
    if (fs.existsSync(candidate)) entries.add(candidate);
  }
  env.PATH = Array.from(entries).join(path.delimiter);
  return env;
}

function sanitizeSessionName(name) {
  return String(name || "")
    .replace(/[.:\s]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

const TMUX_MISSING_MESSAGE =
  "tmux is required to run agents and open terminals. Please install tmux and restart Fractal.";

function hasTmuxSession(name) {
  if (!name || sanitizeSessionName(name) !== name) return { ok: false };
  const res = spawnSync("tmux", ["has-session", "-t", name], {
    stdio: "ignore",
    env: buildTerminalEnv(),
  });
  if (res.error && res.error.code === "ENOENT") return { ok: false, error: TMUX_MISSING_MESSAGE };
  return { ok: res.status === 0 };
}

function ensureTmuxSession(name, cwd) {
  const existing = hasTmuxSession(name);
  if (existing.ok || existing.error) return existing;
  if (!cwd || !path.isAbsolute(cwd) || !fs.existsSync(cwd)) return { ok: false };
  const res = spawnSync("tmux", ["new-session", "-d", "-s", name, "-c", cwd], {
    stdio: "ignore",
    env: buildTerminalEnv(),
  });
  if (res.error && res.error.code === "ENOENT") return { ok: false, error: TMUX_MISSING_MESSAGE };
  return { ok: res.status === 0 };
}

function ensureNodePtySpawnHelperExecutable() {
  try {
    let pkgRoot = path.dirname(require.resolve("node-pty/package.json"));
    if (pkgRoot.includes("app.asar")) pkgRoot = pkgRoot.replace("app.asar", "app.asar.unpacked");
    const prebuilds = path.join(pkgRoot, "prebuilds");
    for (const platformDir of fs.readdirSync(prebuilds)) {
      const helper = path.join(prebuilds, platformDir, "spawn-helper");
      if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
    }
  } catch (error) {
    console.error("[fractal-terminal] failed to chmod node-pty spawn-helper:", error);
  }
}

function attachTerminalWSServer() {
  ensureNodePtySpawnHelperExecutable();
  const wss = new WebSocketServer({ noServer: true, path: "/api/terminal/ws" });
  const connectionCleanups = new Set();

  function closeAllConnections() {
    for (const cleanup of Array.from(connectionCleanups)) cleanup();
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {}
    }
    try {
      wss.close();
    } catch {}
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const session = url.searchParams.get("session") || "";
    const cwd = url.searchParams.get("cwd") || "";

    const tmuxSession = ensureTmuxSession(session, cwd);
    if (!tmuxSession.ok) {
      const message = tmuxSession.error || `tmux session not found: ${session}`;
      console.error(`[fractal-terminal] ${message}`);
      ws.send(JSON.stringify({ type: "error", message }));
      ws.close(1008, message);
      return;
    }

    let term;
    let dataDisposable = { dispose() {} };
    let exitDisposable = { dispose() {} };
    let child = null;
    let cleanedUp = false;
    let write = () => {};
    let resize = () => {};
    let kill = () => {};

    function cleanupConnection() {
      if (cleanedUp) return;
      cleanedUp = true;
      connectionCleanups.delete(cleanupConnection);
      dataDisposable.dispose();
      exitDisposable.dispose();
      try {
        kill();
      } catch {}
    }

    connectionCleanups.add(cleanupConnection);

    try {
      term = pty.spawn("tmux", ["attach-session", "-t", session], {
        name: "xterm-256color",
        cols: 120,
        rows: 34,
        cwd: os.homedir(),
        env: { ...buildTerminalEnv(), TERM: "xterm-256color" },
      });
      dataDisposable = term.onData((data) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "data", data }));
      });
      exitDisposable = term.onExit(({ exitCode }) => {
        if (cleanedUp) return;
        cleanedUp = true;
        connectionCleanups.delete(cleanupConnection);
        dataDisposable.dispose();
        exitDisposable.dispose();
        if (ws.readyState === ws.OPEN) ws.close(1000, `terminal exited ${exitCode}`);
      });
      write = (data) => term.write(data);
      resize = (cols, rows) => term.resize(cols, rows);
      kill = () => term.kill();
    } catch (error) {
      console.error("[fractal-terminal] node-pty failed, falling back to script(1):", error);
      const scriptArgs =
        process.platform === "linux"
          ? ["-q", "-c", `tmux attach-session -t ${session}`, "/dev/null"]
          : ["-q", "/dev/null", "tmux", "attach-session", "-t", session];
      child = spawn("script", scriptArgs, {
        cwd: os.homedir(),
        env: { ...buildTerminalEnv(), TERM: "xterm-256color" },
        stdio: "pipe",
      });
      child.stdout.on("data", (data) => {
        if (ws.readyState === ws.OPEN)
          ws.send(JSON.stringify({ type: "data", data: data.toString("utf8") }));
      });
      child.stderr.on("data", (data) => {
        if (ws.readyState === ws.OPEN)
          ws.send(JSON.stringify({ type: "data", data: data.toString("utf8") }));
      });
      child.on("exit", (exitCode) => {
        if (ws.readyState === ws.OPEN) ws.close(1000, `terminal exited ${exitCode}`);
      });
      child.on("error", (childError) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: childError instanceof Error ? childError.message : String(childError),
            }),
          );
          ws.close(1011, "failed to attach");
        }
      });
      write = (data) => child.stdin.write(data);
      kill = () => child.kill();
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === "data" && typeof msg.data === "string") write(msg.data);
        if (msg.type === "resize" && Number.isFinite(msg.cols) && Number.isFinite(msg.rows)) {
          resize(Math.max(2, msg.cols), Math.max(2, msg.rows));
        }
      } catch (err) {
        console.error("[fractal-terminal] failed to parse client message:", err);
      }
    });

    ws.on("close", cleanupConnection);
  });

  function handleUpgrade(req, socket, head) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }

  return { cleanup: closeAllConnections, handleUpgrade };
}

module.exports = { attachTerminalWSServer };
