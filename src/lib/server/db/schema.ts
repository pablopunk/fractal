import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  icon: text("icon"),
  iconMime: text("icon_mime"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  summary: text("summary"),
  imagePaths: text("image_paths").notNull().default("[]"),
  modelProfile: text("model_profile", { enum: ["smart", "fast"] }).notNull().default("smart"),
  presetId: text("preset_id").notNull().default("pi"),
  column: text("column", { enum: ["PROMPTS", "RUN_IN_PLACE", "RUN_IN_WORKTREE"] })
    .notNull()
    .default("PROMPTS"),
  runMode: text("run_mode", { enum: ["in_place", "worktree"] }),
  branch: text("branch"),
  worktreePath: text("worktree_path"),
  tmuxSession: text("tmux_session"),
  error: text("error"),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  launchedAt: integer("launched_at", { mode: "timestamp_ms" }),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type Project = typeof projects.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type NewPrompt = typeof prompts.$inferInsert;
export type NewSetting = typeof settings.$inferInsert;
