import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { terminalWsPlugin } from "./electron/terminal-ws-plugin.mjs";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  server: { port: 7666, host: "127.0.0.1", allowedHosts: true },
  devToolbar: { enabled: false },
  vite: {
    plugins: [terminalWsPlugin()],
    ssr: {
      external: ["better-sqlite3"],
    },
  },
});
