import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  column: text("column", { enum: ["PROMPTS", "RUN_IN_PLACE", "RUN_IN_WORKTREE"] })
    .notNull()
    .default("PROMPTS"),
  runMode: text("run_mode", { enum: ["in_place", "worktree"] }),
  branch: text("branch"),
  worktreePath: text("worktree_path"),
  tmuxSession: text("tmux_session"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  launchedAt: integer("launched_at", { mode: "timestamp_ms" }),
});

export type Project = typeof projects.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type NewPrompt = typeof prompts.$inferInsert;
