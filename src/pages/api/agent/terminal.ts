import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { APIRoute } from "astro";
import { renderAgentCommand } from "~/lib/server/agents.js";
import { ensureDir, FRACTAL_HOME } from "~/lib/server/paths.js";
import { getSettings } from "~/lib/server/store.js";
import {
  ensureSession,
  listSessions,
  sanitizeSessionName,
  spawnCommand,
} from "~/lib/server/tmux.js";

export const prerender = false;

const AGENT_CWD = join(FRACTAL_HOME, "agent");
const AGENTS_MD_PATH = join(AGENT_CWD, "AGENTS.md");
const CLAUDE_MD_PATH = join(AGENT_CWD, "CLAUDE.md");
const SESSION_PREFIX = "fractal-agent-";

const DEFAULT_AGENTS_MD = `# Fractal Global Agent

You are the Fractal global agent. You run in a tmux session managed by
the Fractal desktop app. Your CWD is ~/.fractal/agent.

Fractal's HTTP API is at http://127.0.0.1:$PORT.

## Available endpoints

  curl -s http://127.0.0.1:$PORT/api/state          # full snapshot
  curl -s http://127.0.0.1:$PORT/api/projects/:id/prompts  # list prompts
  curl -sX POST .../api/projects/:id/prompts -d '{"text":"..."}'  # create
  curl -sX PATCH .../api/prompts/:id -d '{"column":"PROMPTS"}'    # move
  curl -sX POST .../api/prompts/:id/run-in-place     # launch
  curl -sX POST .../api/prompts/:id/run-in-worktree  # launch wt
  curl -sX POST .../api/prompts/:id/archive          # archive
  curl -sX DELETE .../api/prompts/:id/archive        # unarchive
  curl -sX POST .../api/agent/tmux/capture \\        # read pane
    -d '{"session":"...","lines":200}'
  curl -sX POST .../api/agent/tmux/list-panes \\     # list panes
    -d '{"session":"..."}'

## Self-improvement

After every task, review what went well and what could be better.
Update this file with any new conventions, patterns, or rules you discover
about the Fractal codebase or the user's workflow.
`;

function ensureAgentFiles(): void {
  ensureDir(AGENT_CWD);

  if (!existsSync(AGENTS_MD_PATH)) {
    writeFileSync(AGENTS_MD_PATH, DEFAULT_AGENTS_MD, "utf8");
  }

  if (!existsSync(CLAUDE_MD_PATH)) {
    try {
      symlinkSync("AGENTS.md", CLAUDE_MD_PATH);
    } catch {
      // Symlink may fail on some platforms; ignore
    }
  }
}

function nextAgentIndex(sessions: string[]): number {
  let max = 0;
  for (const name of sessions) {
    if (name.startsWith(SESSION_PREFIX)) {
      const num = Number(name.slice(SESSION_PREFIX.length));
      if (Number.isFinite(num) && num > max) max = num;
    }
  }
  return max + 1;
}

export const POST: APIRoute = async () => {
  try {
    ensureAgentFiles();

    const sessions = await listSessions();
    const index = nextAgentIndex(sessions);
    const session = sanitizeSessionName(`${SESSION_PREFIX}${index}`);

    await ensureSession(session, AGENT_CWD);

    const settings = getSettings();
    const preset =
      settings.agentPresets.find((p) => p.id === settings.globalAgentPresetId) ??
      settings.agentPresets.find((p) => p.id === settings.defaultPresetId) ??
      settings.agentPresets[0];
    if (!preset) throw new Error("No Fractal Agent preset configured");

    // Spawn the agent CLI with the prompt template or default prompt
    const agentPrompt =
      preset.promptTemplate?.trim() ||
      "You are the Fractal global agent. Read AGENTS.md for your instructions.";
    const command = renderAgentCommand(preset, agentPrompt);
    await spawnCommand(session, command);

    return Response.json({ session, title: `Agent ${index}` });
  } catch (e) {
    const msg =
      e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT"
        ? "Fractal Agent binary not found for the selected preset"
        : e instanceof Error
          ? e.message
          : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
