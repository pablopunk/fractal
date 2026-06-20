import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function isLocalAddr(addr) {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function readSettings() {
  try {
    const { readRemoteAccessSettings } = require("./remote-config.cjs");
    return readRemoteAccessSettings();
  } catch {
    return { enabled: false, token: "" };
  }
}

export function terminalWsPlugin() {
  let wss = null;

  return {
    name: "fractal-terminal-ws",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const mod = require("./terminal-server.cjs");
        wss = mod.attachTerminalWSServer();
        server.httpServer?.on("upgrade", (req, socket, head) => {
          const url = new URL(req.url || "/", "http://127.0.0.1");
          const match = url.pathname.match(/^\/api\/terminal\/ws(\/([^/]+))?$/);
          if (match) {
            const settings = readSettings();
            if (!isLocalAddr(socket.remoteAddress)) {
              if (!settings.enabled) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
              }
              const token = match[2];
              if (!token || token !== settings.token) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
              }
            }
            wss.handleUpgrade(req, socket, head);
          }
        });
      });
    },
    buildEnd() {
      try {
        wss?.cleanup?.();
      } catch {}
    },
  };
}
