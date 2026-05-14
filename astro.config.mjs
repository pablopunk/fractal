import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  server: { port: 7666, host: "127.0.0.1" },
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  vite: {
    ssr: {
      external: ["better-sqlite3"],
    },
  },
});
