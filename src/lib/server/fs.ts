import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const HOME = homedir();

/** Directories whose immediate subdirectories are offered as project suggestions. */
export const SUGGESTION_ROOTS: string[] = (
  process.env.FRACTAL_SUGGEST_ROOTS
    ? process.env.FRACTAL_SUGGEST_ROOTS.split(":")
    : ["~/src", "~/src/maze"]
).map(expandPath);

/** Expand a leading `~` and resolve to an absolute, normalized path. */
export function expandPath(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return HOME;
  if (v === "~") return HOME;
  if (v.startsWith("~/")) return resolve(HOME, v.slice(2));
  if (v.startsWith("/")) return resolve(v);
  return resolve(HOME, v);
}

export type DirEntry = { name: string; absolute: string };

/** List immediate subdirectories of `dir`. Hidden dirs hidden by default. */
export function listDirectories(
  dir: string,
  opts: { includeHidden?: boolean; limit?: number } = {},
): DirEntry[] {
  const abs = expandPath(dir);
  if (!existsSync(abs)) return [];
  let entries: DirEntry[] = [];
  try {
    const names = readdirSync(abs);
    for (const name of names) {
      if (!opts.includeHidden && name.startsWith(".")) continue;
      const full = join(abs, name);
      try {
        if (statSync(full).isDirectory()) entries.push({ name, absolute: full });
      } catch {
        // skip permission-denied or broken symlinks
      }
    }
  } catch {
    return [];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  if (opts.limit) entries = entries.slice(0, opts.limit);
  return entries;
}
