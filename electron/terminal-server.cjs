const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { WebSocketServer } = require("ws");
const pty = require("node-pty");

function sanitizeSessionName(name) {
  return String(name || "").replace(/[.:\s]/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function hasTmuxSession(name) {
  if (!name || sanitizeSessionName(name) !== name) return false;
  const res = spawnSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
  return res.status === 0;
}

function ensureNodePtySpawnHelperExecutable() {
  try {
    const pkgRoot = path.dirname(require.resolve("node-pty/package.json"));
    const prebuilds = path.join(pkgRoot, "prebuilds");
    for (const platformDir of fs.readdirSync(prebuilds)) {
      const helper = path.join(prebuilds, platformDir, "spawn-helper");
      if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
    }
  } catch (error) {
    console.error("[fractal-terminal] failed to chmod node-pty spawn-helper:", error);
  }
}

function createTerminalServer() {
  ensureNodePtySpawnHelperExecutable();
  const server = http.createServer((_, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const wss = new WebSocketServer({ server, path: "/terminal" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const session = url.searchParams.get("session") || "";

    if (!hasTmuxSession(session)) {
      ws.send(JSON.stringify({ type: "error", message: `tmux session not found: ${session}` }));
      ws.close(1008, "tmux session not found");
      return;
    }

    let term;
    let disposable = { dispose() {} };
    let write = () => {};
    let resize = () => {};
    let kill = () => {};

    try {
      term = pty.spawn("tmux", ["attach-session", "-t", session], {
        name: "xterm-256color",
        cols: 120,
        rows: 34,
        cwd: os.homedir(),
        env: { ...process.env, TERM: "xterm-256color" },
      });
      disposable = term.onData((data) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "data", data }));
      });
      term.onExit(({ exitCode }) => {
        if (ws.readyState === ws.OPEN) ws.close(1000, `terminal exited ${exitCode}`);
      });
      write = (data) => term.write(data);
      resize = (cols, rows) => term.resize(cols, rows);
      kill = () => term.kill();
    } catch (error) {
      console.error("[fractal-terminal] node-pty failed, falling back to script(1):", error);
      const child = spawn("script", ["-q", "/dev/null", "tmux", "attach-session", "-t", session], {
        cwd: os.homedir(),
        env: { ...process.env, TERM: "xterm-256color" },
        stdio: "pipe",
      });
      child.stdout.on("data", (data) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "data", data: data.toString("utf8") }));
      });
      child.stderr.on("data", (data) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "data", data: data.toString("utf8") }));
      });
      child.on("exit", (exitCode) => {
        if (ws.readyState === ws.OPEN) ws.close(1000, `terminal exited ${exitCode}`);
      });
      child.on("error", (childError) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: childError instanceof Error ? childError.message : String(childError) }));
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

    ws.on("close", () => {
      disposable.dispose();
      try { kill(); } catch {}
    });
  });

  return server;
}

module.exports = { createTerminalServer };
