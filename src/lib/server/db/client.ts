import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { FRACTAL_DB_PATH } from "../paths.js";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

export function getDb() {
  if (_db) return _db;
  console.log(`[fractal-db] opening database at: ${FRACTAL_DB_PATH}`);
  const sqlite = new Database(FRACTAL_DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");
  ensureSchema(sqlite);
  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });
  console.log(`[fractal-db] database initialized successfully`);
  return _db;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

/**
 * Minimal in-process schema bootstrap so the app runs without a separate
 * `db:migrate` step in development. Drizzle Kit migrations remain the source
 * of truth once the schema stabilizes.
 */
function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      icon TEXT,
      icon_mime TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      image_paths TEXT NOT NULL DEFAULT '[]',
      model_profile TEXT NOT NULL DEFAULT 'smart',
      preset_id TEXT NOT NULL DEFAULT 'pi',
      column TEXT NOT NULL DEFAULT 'PROMPTS',
      run_mode TEXT,
      branch TEXT,
      worktree_path TEXT,
      tmux_session TEXT,
      error TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      launched_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
  `);

  try {
    sqlite.exec("ALTER TABLE prompts ADD COLUMN model_profile TEXT NOT NULL DEFAULT 'smart';");
  } catch (err) { if (!/duplicate column/i.test(String(err))) console.error("[fractal-db] migration step failed:", err); }
  try {
    sqlite.exec("ALTER TABLE prompts ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;");
  } catch (err) { if (!/duplicate column/i.test(String(err))) console.error("[fractal-db] migration step failed:", err); }
  try {
    sqlite.exec("ALTER TABLE prompts ADD COLUMN preset_id TEXT NOT NULL DEFAULT 'pi';");
  } catch (err) { if (!/duplicate column/i.test(String(err))) console.error("[fractal-db] migration step failed:", err); }
  try {
    sqlite.exec("ALTER TABLE prompts ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]';");
  } catch (err) { if (!/duplicate column/i.test(String(err))) console.error("[fractal-db] migration step failed:", err); }
  try {
    sqlite.exec("ALTER TABLE projects ADD COLUMN icon TEXT;");
  } catch (err) { if (!/duplicate column/i.test(String(err))) console.error("[fractal-db] migration step failed:", err); }
  try {
    sqlite.exec("ALTER TABLE projects ADD COLUMN icon_mime TEXT;");
  } catch (err) { if (!/duplicate column/i.test(String(err))) console.error("[fractal-db] migration step failed:", err); }
  try {
    sqlite.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;");
  } catch (err) { if (!/duplicate column/i.test(String(err))) console.error("[fractal-db] migration step failed:", err); }
}
