import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  server: { port: 7666, host: "127.0.0.1" },
  devToolbar: { enabled: false },
  vite: {
    ssr: {
      external: ["better-sqlite3"],
    },
  },
});
