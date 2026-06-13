import { cpSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
const AGENT_SKILLS_DIR = join(AGENT_CWD, ".agents", "skills");
const SELF_IMPROVING_SKILL_NAME = "self-improving-agent";
const SELF_IMPROVING_SKILL_SOURCE = join(
  homedir(),
  ".agents",
  "skills",
  SELF_IMPROVING_SKILL_NAME,
);
const SELF_IMPROVING_SKILL_DEST = join(AGENT_SKILLS_DIR, SELF_IMPROVING_SKILL_NAME);
const SESSION_PREFIX = "fractal-agent-";

const MANAGED_START = "<!-- FRACTAL-MANAGED-START -->";
const MANAGED_END = "<!-- FRACTAL-MANAGED-END -->";

/**
 * Returns a truthful self-improvement section for the generated manual.
 * Wording differs depending on whether the self-improving-agent skill
 * source exists on this machine — it never falsely claims a path exists.
 */
function selfImprovementSection(): string {
  const sourceExists = existsSync(SELF_IMPROVING_SKILL_SOURCE);
  const destExists = existsSync(SELF_IMPROVING_SKILL_DEST);
  const skillPath = ".agents/skills/self-improving-agent/SKILL.md";

  if (destExists) {
    return [
      "## Self-improvement",
      "",
      "The self-improving-agent skill is stored in this workspace at:",
      "",
      `  ${skillPath}`,
      "",
      "Use it as the source of truth for self-improvement. After every task:",
      "",
      "1. Review what happened and whether any reusable lesson emerged.",
      "2. Capture facts, corrections, failed assumptions, and reusable patterns",
      "   as memory or proposal artifacts under the local self-improving-agent",
      "   skill.",
      "3. Promote changes into AGENTS.md, skills, docs, or runtime behaviour only",
      "   when the skill's promotion policy allows it, or when the user explicitly",
      "   asks.",
      "4. Prefer concise, durable rules over long transcripts.",
    ].join("\n");
  }

  return [
    "## Self-improvement",
    "",
    "The self-improving-agent skill is not yet seeded into this workspace.",
    "Install it at `~/.agents/skills/self-improving-agent/` and Fractal will",
    `automatically copy it into ${skillPath} on the next agent launch.`,
    "",
    "After that, use it as the source of truth for self-improvement.",
    "Refer to the skill's promotion policy before committing durable changes",
    "to AGENTS.md or other repo artefacts.",
  ].join("\n");
}

function defaultAgentsMd(): string {
  const selfImprove = selfImprovementSection();
  return `${MANAGED_START}
# Fractal Agent — Operating Manual

## What is Fractal?

Fractal is a desktop application for managing AI coding agents across
multiple projects. It provides:

* A **kanban board** to track prompts (tasks) through columns:
  Prompts → Run in place → Run in worktree → Done.
* **Tmux terminals** attached to running agents so you can watch
  and interact with them live.
* A **settings system** for agent presets (which binary, which
  model, which thinking level, which prompt template to use).
* A **card-based workflow**: every task starts as a prompt card;
  you launch it, monitor it, and archive it when done.

## Your Mission

You are the Fractal global agent. You run in a persistent tmux
session inside the Fractal agent workspace. Your job is to **manage
Fractal for the user** — just like they would from the UI, but
faster and autonomously.

You can:

* Inspect the full Fractal state.
* Create, edit, and organise projects.
* Create, edit, move, launch, and archive prompts.
* Monitor running agents through tmux.
* Read and analyse agent output.
* Change settings and presets.
* Run health/maintenance tasks.

Do **not** guess — **read** state first, then **act** through the API.

## Fractal Concepts

### Projects

A project is a directory on disk that Fractal watches. Each project
has a kanban board with prompts.

### Prompts

A prompt is a task card. It has:

* **text** — the task description (may include @mentions for files).
* **column** — where it lives on the board:
  \`PROMPTS\` (backlog), \`RUN_IN_PLACE\` (agent in project dir),
  \`RUN_IN_WORKTREE\` (agent in isolated git worktree).
* **isArchived** — boolean; when \`true\`, the prompt appears in the
  Done column (a virtual column, not a real \`column\` value).
* **presetId** — which agent preset to use when launching.
* **modelProfile** — \`smart\` or \`fast\`.
* **tmuxSession** — the tmux session name while the agent is running.
* **branch / worktreePath** — git worktree info (worktree mode only).
* **error** — last error message from launch, if any.

### Agent Presets

A preset defines **which agent binary, model, thinking level, and
prompt template** to use. Fractal ships with presets for Pi, Claude
Code, and OpenCode. You can inspect and change presets through the
settings API.

### Columns

Prompts move through columns:

| Column              | Meaning                                |
|---------------------|----------------------------------------|
| \`PROMPTS\`          | Backlog / not yet launched             |
| \`RUN_IN_PLACE\`     | Agent launched in the project directory|
| \`RUN_IN_WORKTREE\`  | Agent launched in a git worktree       |

Archived (done) prompts are marked with \`isArchived: true\` and
shown in a virtual "DONE" column — they stay in their last real
column (\`RUN_IN_PLACE\` or \`RUN_IN_WORKTREE\`) after archiving.

## HTTP API

All endpoints are relative to \`http://127.0.0.1:$PORT\`.
The \`$PORT\` is provided as an environment variable;
default is \`7666\`.

### Root Snapshot

**GET /api/state**

Returns the full Fractal snapshot: all projects, all prompts (with
live status), current settings, saved UI state, and tmux session list.

Response shape:
\`\`\`json
{
  "home": "/home/user",
  "projects": [ { "id": "...", "name": "...", "path": "...", ... } ],
  "prompts": [
    {
      "id": "...", "text": "...", "column": "PROMPTS",
      "isArchived": false, "isRunning": false, ...
    }
  ],
  "settings": {
    "defaultPresetId": "...", "agentPresets": [...],
    "globalAgentPresetId": "...", ...
  },
  "uiState": {
    "sidebarWidth": 204, "theme": "dark",
    "terminalPosition": "right", ...
  },
  "terminalSessions": ["session-a", "session-b"]
}
\`\`\`

**GET /api/ui-state** — saved UI preferences.
Response: \`{ uiState: { sidebarWidth, theme, terminalPosition, ... } }\`.

### Projects

**GET /api/projects**

Returns \`{ projects: [...] }\` — all projects in sort order.

**POST /api/projects**

Create or return an existing project.
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/api/projects \\
  -H 'Content-Type: application/json' \\
  -d '{"path":"/absolute/path/to/repo","name":"My Repo"}'
\`\`\`
Response: \`{ project: { id, name, path, ... } }\`

**PATCH /api/projects/:id**

Update project fields.
\`\`\`bash
curl -sX PATCH http://127.0.0.1:$PORT/api/projects/<id> \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"New Name","defaultPresetId":"claude"}'
\`\`\`
Response: \`{ project: { ... } }\`

Accepted fields: \`name\`, \`defaultPresetId\` (null to clear),
\`githubRepo\`, \`showGithubIssues\`, \`showLinearIssues\`.

**DELETE /api/projects/:id**

Remove a project from Fractal (does not delete the directory on disk).
Response: \`{ ok: true }\`

**POST /api/projects/reorder**

\`{ ids: ["id1","id2"] }\` → \`{ projects: [...] }\`

### Prompts

**GET /api/projects/:id/prompts**

Returns \`{ prompts: [...] }\` — all prompts for a project, with
live running status.

**POST /api/projects/:id/prompts**

Create a new prompt card.
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/api/projects/<id>/prompts \\
  -H 'Content-Type: application/json' \\
  -d '{"text":"Fix the login timeout bug","presetId":"pi","modelProfile":"smart"}'
\`\`\`
At least one of \`text\` (string) or \`imagePaths\` (string array)
is required. Optional: \`presetId\`, \`modelProfile\` (\`smart\` |
\`fast\`), \`issueRef\`.

Response: \`{ prompt: { id, text, column: "PROMPTS", ... } }\`

**PATCH /api/prompts/:id**

Update a prompt.
\`\`\`bash
curl -sX PATCH http://127.0.0.1:$PORT/api/prompts/<prompt-id> \\
  -H 'Content-Type: application/json' \\
  -d '{"column":"RUN_IN_PLACE","text":"updated description"}'
\`\`\`
Accepted fields: \`text\`, \`column\` (\`PROMPTS\`, \`RUN_IN_PLACE\`,
\`RUN_IN_WORKTREE\`), \`presetId\`, \`modelProfile\`, \`issueRef\`
(null to unlink).

**DELETE /api/prompts/:id**

Delete a prompt, cleaning up any tmux session or worktree.
\`\`\`bash
curl -sX DELETE http://127.0.0.1:$PORT/api/prompts/<prompt-id> \\
  -H 'Content-Type: application/json' \\
  -d '{"force":true}'
\`\`\`
Set \`force: true\` to skip uncommitted-changes safety checks.

### Launching Prompts

**POST /api/prompts/:id/run-in-place**

Launch the prompt's agent in the project directory.
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/api/prompts/<id>/run-in-place
\`\`\`

Idempotent: if the prompt already has a running tmux session,
returns the current state without relaunching.

Response: \`{ prompt: { column: "RUN_IN_PLACE", tmuxSession: "...", ... } }\`

**POST /api/prompts/:id/run-in-worktree**

Launch in an isolated git worktree. Creates a branch, checks out
a worktree, and starts the agent there.

Idempotent like run-in-place.

Response: \`{ prompt: { column: "RUN_IN_WORKTREE", branch: "...",
tmuxSession: "...", worktreePath: "...", ... } }\`

### Archiving & PR Flow

**POST /api/prompts/:id/archive**

Mark a prompt as done (sets \`isArchived: true\`). Cleans up its
tmux session. For worktree prompts, can also create a PR, merge to
default branch, or discard.

\`\`\`bash
# Simple archive (tmux session killed, prompt marked done)
curl -sX POST http://127.0.0.1:$PORT/api/prompts/<id>/archive

# Archive with a PR
curl -sX POST http://127.0.0.1:$PORT/api/prompts/<id>/archive \\
  -H 'Content-Type: application/json' \\
  -d '{"action":"create-pr"}'

# Archive and merge to main
curl -sX POST http://127.0.0.1:$PORT/api/prompts/<id>/archive \\
  -H 'Content-Type: application/json' \\
  -d '{"action":"merge-main"}'

# Force-discard worktree
curl -sX POST http://127.0.0.1:$PORT/api/prompts/<id>/archive \\
  -H 'Content-Type: application/json' \\
  -d '{"action":"discard"}'
\`\`\`

**DELETE /api/prompts/:id/archive** — unarchive (sets
\`isArchived: false\`, prompt re-appears on its board column).

### Prompt Summary

**POST /api/prompts/:id/summary**

Use the Fractal AI helper (configured in settings) to generate a
one-line summary of the prompt text.

\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/api/prompts/<id>/summary \\
  -H 'Content-Type: application/json' \\
  -d '{"force":true}'
\`\`\`

### Settings

**GET /api/settings**

Returns \`{ settings: { agentPresets: [...], defaultPresetId: "...",
helperPresetId: "...", globalAgentPresetId: "...", ... } }\`

**PATCH /api/settings**

Update one or more settings. Returns the full updated settings object.

\`\`\`bash
curl -sX PATCH http://127.0.0.1:$PORT/api/settings \\
  -H 'Content-Type: application/json' \\
  -d '{"globalAgentPresetId":"claude"}'
\`\`\`

Settable fields: \`fastModel\`, \`smartModel\`, \`agentPresets\`
(full array), \`defaultPresetId\`, \`helperPresetId\`,
\`globalAgentPresetId\`, \`lastProjectId\`,
\`remoteAccessEnabled\` (boolean), \`keepAwakeEnabled\` (boolean).

**POST /api/settings/remote-token** — rotate the remote access
token. Response: \`{ token: "..." }\`

### Agent Tmux Helpers

**POST /api/agent/tmux/capture**

Read the current content of a tmux pane.
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/api/agent/tmux/capture \\
  -H 'Content-Type: application/json' \\
  -d '{"session":"my-session","lines":200}'
\`\`\`
Response: \`{ content: "..." }\`

Optional \`target\` parameter selects a specific pane.

**POST /api/agent/tmux/list-panes**

List panes in a tmux session.
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/api/agent/tmux/list-panes \\
  -H 'Content-Type: application/json' \\
  -d '{"session":"my-session"}'
\`\`\`

### Other Endpoints

* **GET /api/health** — returns app metadata: \`{ name: "Fractal",
  version: "0.9.1" }\`.
* **POST /api/health-check** — cleanup orphans and stale DONE
  prompts. Returns counts and details of what was cleaned.
* **GET /api/models** — available agent models (pi, claude, opencode).
* **GET /api/tailscale/status** — Tailscale connection status.
* **POST /api/tailscale/serve** — enable/disable Tailscale Funnel.
  Body: \`{ enable: true }\` or \`{ enable: false }\`.
* **GET /api/fs/suggestions** — directory suggestions for the
  project-picker.
* **GET /api/url-preview?url=...** — fetch Open Graph / Twitter Card
  preview for a URL.
* **GET /api/projects/:id/files** — list project files (for
  @mention completion; up to 5000 entries).
* **GET /api/projects/:id/github-issues** — list open GitHub issues
  for a project.
* **GET /api/projects/:id/linear-issues** — list Linear issues.
* **POST /api/projects/:id/terminal** — create/focus a project
  terminal (not an agent launch; a plain shell in the project dir).

## End-to-End Workflows

### 1. Create a project and launch a task

\`\`\`bash
# Step 1: Add a project
PROJECT=$(curl -sX POST http://127.0.0.1:$PORT/api/projects \\
  -H 'Content-Type: application/json' \\
  -d '{"path":"/home/user/my-repo","name":"My Repo"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.project.id')

# Step 2: Create a prompt
PROMPT=$(curl -sX POST http://127.0.0.1:$PORT/api/projects/$PROJECT_ID/prompts \\
  -H 'Content-Type: application/json' \\
  -d '{"text":"Refactor the auth module to use JWT"}')
PROMPT_ID=$(echo "$PROMPT" | jq -r '.prompt.id')

# Step 3: Launch in worktree
curl -sX POST http://127.0.0.1:$PORT/api/prompts/$PROMPT_ID/run-in-worktree

# Step 4: Wait, then archive (create a PR)
curl -sX POST http://127.0.0.1:$PORT/api/prompts/$PROMPT_ID/archive \\
  -H 'Content-Type: application/json' \\
  -d '{"action":"create-pr"}'
\`\`\`

### 2. Monitor a running agent

\`\`\`bash
# Get the full state
STATE=$(curl -s http://127.0.0.1:$PORT/api/state)

# Find a running prompt
RUNNING=$(echo "$STATE" | jq '.prompts[] | select(.isRunning == true)')
SESSION=$(echo "$RUNNING" | jq -r '.tmuxSession')

# Read the last 200 lines
curl -sX POST http://127.0.0.1:$PORT/api/agent/tmux/capture \\
  -H 'Content-Type: application/json' \\
  -d "{\"session\":\"$SESSION\",\"lines\":200}" | jq -r '.content'
\`\`\`

### 3. Clean up stale work

\`\`\`bash
# Run the health-check — archives orphan prompts, deletes old DONE entries
curl -sX POST http://127.0.0.1:$PORT/api/health-check
\`\`\`

### 4. Change the Fractal Agent preset

\`\`\`bash
curl -sX PATCH http://127.0.0.1:$PORT/api/settings \\
  -H 'Content-Type: application/json' \\
  -d '{"globalAgentPresetId":"claude"}'
\`\`\`

### 5. Reorganise the board

\`\`\`bash
# Move a prompt to RUN_IN_PLACE
curl -sX PATCH http://127.0.0.1:$PORT/api/prompts/<id> \\
  -H 'Content-Type: application/json' \\
  -d '{"column":"RUN_IN_PLACE"}'

# Archive it
curl -sX POST http://127.0.0.1:$PORT/api/prompts/<id>/archive
\`\`\`

## Safety & Idempotency

* **POST run-in-place / run-in-worktree** are idempotent: if the
  prompt already has a live tmux session, they return current state
  without launching a duplicate.
* **DELETE prompt** checks for uncommitted worktree changes before
  deleting, unless \`force: true\` is passed.
* **POST archive** guards against archiving worktree prompts with
  uncommitted changes (you can use \`{"action":"discard"}\` to
  override).
* Always **read /api/state first** before taking destructive actions.

## Error Handling

* All errors return a JSON body with an \`error\` field.
* HTTP status codes: \`400\` for bad input, \`404\` for missing
  resources, \`409\` for conflicts (e.g., uncommitted changes),
  \`500\` for server errors, \`503\` for transient database locks.
* If an endpoint returns \`"error":"database is locked"\`, wait a
  moment and retry.

## Settings & Presets Reference

Default presets shipped with Fractal:

| ID       | Name        | Binary    | Default Model |
|----------|-------------|-----------|---------------|
| \`pi\`     | Pi          | pi        | (user choice) |
| \`claude\` | Claude Code | claude    | sonnet        |
| \`opencode\`| OpenCode   | opencode  | (user choice) |

Settings keys:
* \`defaultPresetId\` — which preset to use for new prompts.
* \`helperPresetId\` — which preset Fractal uses for AI helpers
  (summaries, etc).
* \`globalAgentPresetId\` — which preset **you** are launched with.

## Working with this Workspace

Your CWD is the persistent Fractal agent workspace. Key files:

* \`AGENTS.md\` — this operating manual (read it on every session).
* \`CLAUDE.md\` — symlink to AGENTS.md (used by Claude Code).
* \`.agents/skills/self-improving-agent/\` — the self-improving
  skill (see below).

${selfImprove}
${MANAGED_END}
`;
}

/**
 * Update an existing AGENTS.md in-place without destroying user
 * customisations.
 *
 * Strategy:
 * - If valid managed markers are found, replace only the managed section.
 * - If the file starts with a known old default, safe-rewrite it.
 * - If the file is arbitrary markerless content, leave it unchanged
 *   (do NOT append a managed block).
 * - Broken markers (partial or misordered) fail closed: no change.
 *
 * Returns true if the file was written.
 */
function updateAgentsMdIfNeeded(): boolean {
  if (!existsSync(AGENTS_MD_PATH)) return false;
  try {
    const current = readFileSync(AGENTS_MD_PATH, "utf8");
    const startIdx = current.indexOf(MANAGED_START);
    const endIdx = current.indexOf(MANAGED_END);

    // Both markers present and in correct order → replace managed section
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
      const before = current.slice(0, startIdx);
      const after = current.slice(endIdx + MANAGED_END.length);
      const updated = before + defaultAgentsMd() + after;
      if (updated !== current) {
        writeFileSync(AGENTS_MD_PATH, updated, "utf8");
      }
      return true;
    }

    // Any partial markers → fail closed (do not touch the file)
    if (startIdx !== -1 || endIdx !== -1) {
      return false;
    }

    // No managed markers — leave the file unchanged.
    // Old-default or custom files without markers are untouched to
    // avoid overwriting user edits. The user can delete the file to
    // get a fresh managed copy on the next agent launch.
    return false;
  } catch {
    // Best effort; ignore read/write errors
    return false;
  }
}

function seedSkillIfMissing(): void {
  if (!existsSync(SELF_IMPROVING_SKILL_SOURCE)) return;
  if (existsSync(SELF_IMPROVING_SKILL_DEST)) return;
  try {
    ensureDir(AGENT_SKILLS_DIR);
    cpSync(SELF_IMPROVING_SKILL_SOURCE, SELF_IMPROVING_SKILL_DEST, {
      recursive: true,
      dereference: false,
    });
  } catch {
    // Best-effort; silently skip on permission errors or unsupported platforms
  }
}

function ensureAgentFiles(): void {
  ensureDir(AGENT_CWD);

  seedSkillIfMissing();

  if (!existsSync(AGENTS_MD_PATH)) {
    writeFileSync(AGENTS_MD_PATH, defaultAgentsMd(), "utf8");
  } else {
    updateAgentsMdIfNeeded();
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
