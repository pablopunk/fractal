import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export const FRACTAL_HOME = process.env.FRACTAL_HOME ?? join(homedir(), ".fractal");
export const FRACTAL_DB_PATH = process.env.FRACTAL_DB_PATH ?? join(FRACTAL_HOME, "fractal.db");
export const WORKTREES_ROOT = process.env.FRACTAL_WORKTREES ?? join(homedir(), ".worktrees", "fractal");

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

ensureDir(FRACTAL_HOME);
