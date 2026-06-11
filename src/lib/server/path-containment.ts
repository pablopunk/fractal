import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolvedPathIsWithin(root: string, candidate: string): boolean {
  try {
    const realRoot = realpathSync(resolve(root));
    const realCandidate = realpathSync(resolve(candidate));
    if (realCandidate === realRoot) return true;
    const rel = relative(realRoot, realCandidate);
    return (
      rel !== "" && rel !== "." && !rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel)
    );
  } catch {
    return false;
  }
}
