import { GitBranch, Play, Terminal } from "lucide-react";
import type { TerminalTabAccent } from "./types.js";

export function terminalTabIcon(accent?: TerminalTabAccent) {
  if (accent === "in-place") return Play;
  if (accent === "worktree") return GitBranch;
  return Terminal;
}
