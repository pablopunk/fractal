import { defineConfig } from "drizzle-kit";
import { homedir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/server/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.FRACTAL_DB_PATH ?? join(homedir(), ".fractal", "fractal.db"),
  },
  verbose: true,
  strict: true,
});
