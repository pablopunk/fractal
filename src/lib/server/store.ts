import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./db/client.js";
import { projects, prompts, settings, type Project, type Prompt } from "./db/schema.js";
import { DEFAULT_AGENT_PRESETS, type AgentPreset } from "./agents.js";

export type Column = "PROMPTS" | "RUN_IN_PLACE" | "RUN_IN_WORKTREE";
export type ModelProfile = "smart" | "fast";
export type AppSettings = {
  fastModel: string;
  smartModel: string;
  agentPresets: AgentPreset[];
  defaultPresetId: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  fastModel: "",
  smartModel: "",
  agentPresets: DEFAULT_AGENT_PRESETS,
  defaultPresetId: "pi",
};

export function listProjects(): Project[] {
  return getDb().select().from(projects).all();
}

export function getProject(id: string): Project | undefined {
  return getDb().select().from(projects).where(eq(projects.id, id)).get();
}

export function getProjectByPath(path: string): Project | undefined {
  return getDb().select().from(projects).where(eq(projects.path, path)).get();
}

export function createProject(input: { name: string; path: string }): Project {
  const now = new Date();
  const row = {
    id: randomUUID(),
    name: input.name,
    path: input.path,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(projects).values(row).run();
  return row as Project;
}

export function deleteProject(id: string): void {
  getDb().delete(projects).where(eq(projects.id, id)).run();
}

export function listPrompts(projectId?: string): Prompt[] {
  const q = getDb().select().from(prompts);
  return projectId ? q.where(eq(prompts.projectId, projectId)).all() : q.all();
}

export function getPrompt(id: string): Prompt | undefined {
  return getDb().select().from(prompts).where(eq(prompts.id, id)).get();
}

export function createPrompt(input: { projectId: string; text: string; imagePaths?: string[]; modelProfile?: ModelProfile; presetId?: string }): Prompt {
  const now = new Date();
  const row = {
    id: randomUUID(),
    projectId: input.projectId,
    text: input.text,
    imagePaths: JSON.stringify(input.imagePaths ?? []),
    modelProfile: input.modelProfile ?? "smart",
    presetId: input.presetId || getSettings().defaultPresetId,
    column: "PROMPTS" as const,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(prompts).values(row).run();
  return getPrompt(row.id)!;
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

export function getSettings(): AppSettings {
  const rows = getDb().select().from(settings).all();
  const out = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key === "fastModel") out.fastModel = row.value;
    if (row.key === "smartModel") out.smartModel = row.value;
    if (row.key === "agentPresets") {
      try { out.agentPresets = JSON.parse(row.value); } catch (err) {
        console.error("[fractal-settings] failed to parse agentPresets, using defaults:", err);
      }
    }
    if (row.key === "defaultPresetId") out.defaultPresetId = row.value;
  }
  return out;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const now = new Date();
  const next = { ...getSettings(), ...patch };
  for (const [key, value] of Object.entries(next)) {
    const storedValue = typeof value === "string" ? value : JSON.stringify(value);
    getDb().insert(settings).values({ key, value: storedValue, updatedAt: now }).onConflictDoUpdate({
      target: settings.key,
      set: { value: storedValue, updatedAt: now },
    }).run();
  }
  return getSettings();
}
