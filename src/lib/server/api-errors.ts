import { isMissingTmuxError, TMUX_MISSING_MESSAGE } from "./tmux.js";

export function classifyError(e: unknown): { status: number; error: string; retryable?: boolean } {
  if (e instanceof Error && e.message.includes("SQLITE_BUSY")) {
    return { status: 503, error: "database is locked", retryable: true };
  }
  if (isMissingTmuxError(e)) {
    return { status: 500, error: TMUX_MISSING_MESSAGE };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 500, error: msg };
}
