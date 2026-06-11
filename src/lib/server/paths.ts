import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const FRACTAL_HOME = process.env.FRACTAL_HOME ?? join(homedir(), ".fractal");
export const FRACTAL_DB_PATH = process.env.FRACTAL_DB_PATH ?? join(FRACTAL_HOME, "fractal.db");
export const WORKTREES_ROOT =
  process.env.FRACTAL_WORKTREES ?? join(homedir(), ".worktrees", "fractal");

if (process.env.FRACTAL_BOOT) {
  console.log(`[fractal-paths] FRACTAL_HOME=${FRACTAL_HOME}`);
  console.log(`[fractal-paths] FRACTAL_DB_PATH=${FRACTAL_DB_PATH}`);
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

ensureDir(FRACTAL_HOME);
