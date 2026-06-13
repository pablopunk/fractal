import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
          if (url.pathname === "/api/terminal/ws") {
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
