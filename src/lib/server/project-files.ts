import { readdirSync, type Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import { exec } from "./exec.js";

export type ProjectFile = { path: string; name: string };

const SKIPPED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "release",
  ".astro",
  ".next",
  ".nuxt",
  ".turbo",
  "coverage",
]);

export async function listProjectFiles(projectPath: string, limit = 1000): Promise<ProjectFile[]> {
  const gitFiles = await listGitFiles(projectPath, limit).catch(() => []);
  const paths = gitFiles.length > 0 ? gitFiles : listFsFiles(projectPath, limit);
  return paths.map((path) => ({ path, name: basename(path) }));
}

async function listGitFiles(projectPath: string, limit: number): Promise<string[]> {
  const result = await exec("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: projectPath, timeoutMs: 3_000 });
  return uniqueSorted(result.stdout.split(/\r?\n/).map(cleanRelativePath).filter(Boolean)).slice(0, limit);
}

function listFsFiles(projectPath: string, limit: number): string[] {
  const out: string[] = [];
  walk(projectPath, projectPath, out, limit);
  return uniqueSorted(out).slice(0, limit);
}

function walk(dir: string, root: string, out: string[], limit: number): void {
  if (out.length >= limit) return;

  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= limit) return;
    if (entry.isSymbolicLink()) continue;

    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(absolute, root, out, limit);
      continue;
    }

    if (!entry.isFile()) continue;
    const path = cleanRelativePath(relative(root, absolute));
    if (path) out.push(path);
  }
}

function cleanRelativePath(value: string): string {
  const normalized = value.trim().split(sep).join("/");
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../") || normalized.startsWith("/")) return "";
  return normalized;
}

function uniqueSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
