import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { FRACTAL_DB_PATH } from "../src/lib/server/paths.js";

const sqlite = new Database(FRACTAL_DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./drizzle" });
sqlite.close();
console.log("Migrations applied to", FRACTAL_DB_PATH);
