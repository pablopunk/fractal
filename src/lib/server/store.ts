import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { FractalAgentProvider } from "../agent-providers.js";
import { type AgentPreset, DEFAULT_AGENT_PRESETS } from "./agents.js";
import { getDb } from "./db/client.js";
import { type Project, type Prompt, projects, prompts, settings } from "./db/schema.js";

export type Column = "PROMPTS" | "RUN_IN_PLACE" | "RUN_IN_WORKTREE" | "GITHUB" | "LINEAR";
export type ModelProfile = "smart" | "fast";
export type AppSettings = {
  fastModel: string;
  smartModel: string;
  agentPresets: AgentPreset[];
  defaultPresetId: string;
  helperPresetId: string;
  lastProjectId: string;
  globalAgentPresetId: string;
  remoteAccessEnabled: boolean;
  remoteAccessToken: string;
  keepAwakeEnabled: boolean;
  apiKeys?: Record<string, string>;
  fractalAgentProvider?: FractalAgentProvider | "";
  fractalAgentModel?: string;
};

export type UiColumn = Column | "GITHUB" | "LINEAR" | "ARCHIVED";
export type UiState = {
  version: 1;
  sidebarWidth: number;
  collapsedColumns: Record<string, Record<UiColumn, boolean>>;
  terminalPosition: "right" | "bottom";
  terminalWidth: number;
  terminalHeight: number;
  terminalTabs: Array<{
    id: string;
    promptId: string;
    projectId?: string;
    session: string;
    title: string;
    cwd?: string;
  }>;
  activeTerminalTabId: string | null;
  theme: "system" | "light" | "dark";
  terminalTheme: "fractal" | "catppuccin" | "tokyo-night" | "solarized";
  glassSettings: { enabled: boolean; opacity: number; blur: number; version?: number };
  commandRecents: Array<{ kind: "project" | "prompt" | "tab"; id: string; at: number }>;
  boardLayout: "auto" | "rows" | "compact";
  lastProjectId: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  fastModel: "",
  smartModel: "",
  agentPresets: DEFAULT_AGENT_PRESETS,
  defaultPresetId: "pi",
  helperPresetId: "",
  lastProjectId: "",
  globalAgentPresetId: "pi",
  remoteAccessEnabled: false,
  remoteAccessToken: "",
  keepAwakeEnabled: false,
  apiKeys: {},
  fractalAgentProvider: "",
  fractalAgentModel: "",
};

const DEFAULT_COLLAPSED = {
  PROMPTS: false,
  RUN_IN_PLACE: false,
  RUN_IN_WORKTREE: false,
  GITHUB: false,
  LINEAR: false,
  ARCHIVED: true,
} as Record<UiColumn, boolean>;

const DEFAULT_UI_STATE: UiState = {
  version: 1,
  sidebarWidth: 204,
  collapsedColumns: { global: DEFAULT_COLLAPSED },
  terminalPosition: "right",
  terminalWidth: 520,
  terminalHeight: 320,
  terminalTabs: [],
  activeTerminalTabId: null,
  theme: "system",
  terminalTheme: "fractal",
  glassSettings: { enabled: false, opacity: 0.68, blur: 22, version: 2 },
  commandRecents: [],
  boardLayout: "auto",
  lastProjectId: "",
};

export function listProjects(): Project[] {
  return getDb()
    .select()
    .from(projects)
    .orderBy(asc(projects.sortOrder), asc(projects.createdAt))
    .all();
}

export function getProject(id: string): Project | undefined {
  return getDb().select().from(projects).where(eq(projects.id, id)).get();
}

export function getProjectByPath(path: string): Project | undefined {
  return getDb().select().from(projects).where(eq(projects.path, path)).get();
}

export function createProject(input: { name: string; path: string; githubRepo?: string }): Project {
  const now = new Date();
  const sortOrder = listProjects().length;
  const row = {
    id: randomUUID(),
    name: input.name,
    path: input.path,
    githubRepo: input.githubRepo ?? null,
    defaultPresetId: null,
    icon: null,
    iconMime: null,
    showGithubIssues: 0,
    showLinearIssues: 0,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(projects).values(row).run();
  return row as Project;
}

export function deleteProject(id: string): void {
  getDb().delete(projects).where(eq(projects.id, id)).run();
}

export function updateProject(id: string, patch: Partial<Project>): Project | undefined {
  getDb()
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .run();
  return getProject(id);
}

export function reorderProjects(ids: string[]): Project[] {
  const db = getDb();
  const now = new Date();
  db.transaction((tx) => {
    ids.forEach((id, sortOrder) => {
      tx.update(projects).set({ sortOrder, updatedAt: now }).where(eq(projects.id, id)).run();
    });
  });
  return listProjects();
}

export function listPrompts(projectId?: string): Prompt[] {
  const q = getDb().select().from(prompts);
  return projectId ? q.where(eq(prompts.projectId, projectId)).all() : q.all();
}

export function getPrompt(id: string): Prompt | undefined {
  return getDb().select().from(prompts).where(eq(prompts.id, id)).get();
}

export function createPrompt(input: {
  projectId: string;
  text: string;
  imagePaths?: string[];
  modelProfile?: ModelProfile;
  presetId?: string;
  issueRef?: string;
}): Prompt {
  const now = new Date();
  const row = {
    id: randomUUID(),
    projectId: input.projectId,
    text: input.text,
    imagePaths: JSON.stringify(input.imagePaths ?? []),
    modelProfile: input.modelProfile ?? "smart",
    presetId: input.presetId || getSettings().defaultPresetId,
    issueRef: input.issueRef ?? null,
    column: "PROMPTS" as const,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(prompts).values(row).run();
  const prompt = getPrompt(row.id);
  if (!prompt) throw new Error("Failed to create prompt: row not found after insert");
  return prompt;
}

export function updatePrompt(id: string, patch: Partial<Prompt>): Prompt | undefined {
  getDb()
    .update(prompts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(prompts.id, id))
    .run();
  return getPrompt(id);
}

export function deletePrompt(id: string): void {
  getDb().delete(prompts).where(eq(prompts.id, id)).run();
}

export function linkPromptToIssue(promptId: string, issueRef: string): Prompt | undefined {
  return updatePrompt(promptId, { issueRef } as Partial<Prompt>);
}

export function unlinkPromptFromIssue(promptId: string): Prompt | undefined {
  return updatePrompt(promptId, { issueRef: null } as Partial<Prompt>);
}

function defaultHelperPresetId(presets: AgentPreset[]): string {
  return (
    presets.find((preset) => preset.kind === "pi" || preset.binary === "pi")?.id ??
    presets.find((preset) => preset.kind === "opencode" || preset.binary === "opencode")?.id ??
    ""
  );
}

export function getSettings(): AppSettings {
  const rows = getDb().select().from(settings).all();
  const out = { ...DEFAULT_SETTINGS };
  let hasStoredHelperPresetId = false;
  for (const row of rows) {
    if (row.key === "fastModel") out.fastModel = row.value;
    if (row.key === "smartModel") out.smartModel = row.value;
    if (row.key === "agentPresets") {
      try {
        out.agentPresets = JSON.parse(row.value);
      } catch (err) {
        console.error("[fractal-settings] failed to parse agentPresets, using defaults:", err);
      }
    }
    if (row.key === "defaultPresetId") out.defaultPresetId = row.value;
    if (row.key === "helperPresetId") {
      out.helperPresetId = row.value;
      hasStoredHelperPresetId = true;
    }
    if (row.key === "globalAgentPresetId") out.globalAgentPresetId = row.value;
    if (row.key === "remoteAccessToken") out.remoteAccessToken = row.value;
    if (row.key === "remoteAccessEnabled") out.remoteAccessEnabled = row.value === "true";
    if (row.key === "keepAwakeEnabled") out.keepAwakeEnabled = row.value === "true";
    if (row.key === "lastProjectId") out.lastProjectId = row.value;
    if (row.key === "apiKeys") {
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const valid: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof k === "string" && typeof v === "string" && v.trim()) {
              valid[k] = v.trim();
            }
          }
          out.apiKeys = valid;
        }
      } catch (err) {
        console.error("[fractal-settings] failed to parse apiKeys:", err);
      }
    }
    if (row.key === "fractalAgentProvider") {
      out.fractalAgentProvider = row.value.trim() ? (row.value as FractalAgentProvider) : "";
    }
    if (row.key === "fractalAgentModel") out.fractalAgentModel = row.value || "";
  }
  for (const preset of DEFAULT_AGENT_PRESETS) {
    if (!out.agentPresets.some((p) => p.id === preset.id)) out.agentPresets.push(preset);
  }
  if (!hasStoredHelperPresetId) out.helperPresetId = defaultHelperPresetId(out.agentPresets);
  if (out.helperPresetId && !out.agentPresets.some((p) => p.id === out.helperPresetId))
    out.helperPresetId = "";
  if (out.globalAgentPresetId && !out.agentPresets.some((p) => p.id === out.globalAgentPresetId)) {
    out.globalAgentPresetId = out.agentPresets.some((p) => p.id === out.defaultPresetId)
      ? out.defaultPresetId
      : (out.agentPresets[0]?.id ?? "");
  }
  return out;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const now = new Date();
  const next = { ...getSettings(), ...patch };
  for (const [key, value] of Object.entries(next)) {
    const storedValue = typeof value === "string" ? value : JSON.stringify(value);
    getDb()
      .insert(settings)
      .values({ key, value: storedValue, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: storedValue, updatedAt: now },
      })
      .run();
  }
  return getSettings();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeCollapsed(value: unknown): Record<UiColumn, boolean> {
  if (!isObject(value)) return { ...DEFAULT_COLLAPSED };
  return { ...DEFAULT_COLLAPSED, ...value } as Record<UiColumn, boolean>;
}

function isTerminalTab(value: unknown): value is UiState["terminalTabs"][number] {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.promptId === "string" &&
    typeof value.session === "string" &&
    typeof value.title === "string"
  );
}

function isCommandRecent(value: unknown): value is UiState["commandRecents"][number] {
  if (!isObject(value)) return false;
  return (
    (value.kind === "project" || value.kind === "prompt" || value.kind === "tab") &&
    typeof value.id === "string" &&
    typeof value.at === "number"
  );
}

export function normalizeUiState(value: unknown): UiState {
  const input = isObject(value) ? value : {};
  const collapsedColumns: UiState["collapsedColumns"] = { global: { ...DEFAULT_COLLAPSED } };
  if (isObject(input.collapsedColumns)) {
    for (const [key, collapsed] of Object.entries(input.collapsedColumns)) {
      collapsedColumns[key || "global"] = normalizeCollapsed(collapsed);
    }
  }
  const terminalTabs = Array.isArray(input.terminalTabs)
    ? input.terminalTabs.filter(isTerminalTab)
    : [];
  const activeTerminalTabId =
    typeof input.activeTerminalTabId === "string" &&
    terminalTabs.some((tab) => tab.id === input.activeTerminalTabId)
      ? input.activeTerminalTabId
      : (terminalTabs[0]?.id ?? null);
  const theme =
    input.theme === "light" || input.theme === "dark" ? input.theme : DEFAULT_UI_STATE.theme;
  const terminalTheme =
    input.terminalTheme === "catppuccin" ||
    input.terminalTheme === "tokyo-night" ||
    input.terminalTheme === "solarized"
      ? input.terminalTheme
      : DEFAULT_UI_STATE.terminalTheme;
  const boardLayout =
    input.boardLayout === "rows" || input.boardLayout === "compact"
      ? input.boardLayout
      : DEFAULT_UI_STATE.boardLayout;
  const terminalPosition = input.terminalPosition === "bottom" ? "bottom" : "right";
  const glass = isObject(input.glassSettings) ? input.glassSettings : {};
  return {
    version: 1,
    sidebarWidth: numberInRange(input.sidebarWidth, DEFAULT_UI_STATE.sidebarWidth, 56, 260),
    collapsedColumns,
    terminalPosition,
    terminalWidth: numberInRange(input.terminalWidth, DEFAULT_UI_STATE.terminalWidth, 180, 5000),
    terminalHeight: numberInRange(input.terminalHeight, DEFAULT_UI_STATE.terminalHeight, 120, 5000),
    terminalTabs,
    activeTerminalTabId,
    theme,
    terminalTheme,
    glassSettings: {
      version: 2,
      enabled: Boolean(glass.enabled),
      opacity: numberInRange(glass.opacity, DEFAULT_UI_STATE.glassSettings.opacity, 0.45, 1),
      blur: numberInRange(glass.blur, DEFAULT_UI_STATE.glassSettings.blur, 0, 40),
    },
    commandRecents: Array.isArray(input.commandRecents)
      ? input.commandRecents.filter(isCommandRecent).slice(0, 20)
      : [],
    boardLayout,
    lastProjectId: typeof input.lastProjectId === "string" ? input.lastProjectId : "",
  };
}

export function getUiState(): UiState {
  const row = getDb().select().from(settings).where(eq(settings.key, "uiState")).get();
  if (!row) return DEFAULT_UI_STATE;
  try {
    return normalizeUiState(JSON.parse(row.value));
  } catch {
    return DEFAULT_UI_STATE;
  }
}

export function updateUiState(patch: Partial<UiState>): UiState {
  const now = new Date();
  const next = normalizeUiState({ ...getUiState(), ...patch });
  getDb()
    .insert(settings)
    .values({ key: "uiState", value: JSON.stringify(next), updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(next), updatedAt: now },
    })
    .run();
  return next;
}
