import * as SQLite from "expo-sqlite";
import { MIGRATIONS, SCHEMA_VERSION } from "./schema";

const DB_NAME = "notifyloudly.db";

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (db) {
    return db;
  }
  const opened = SQLite.openDatabaseSync(DB_NAME);
  opened.execSync("PRAGMA journal_mode = WAL;");
  const versionRow = opened.getFirstSync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  const current = versionRow?.user_version ?? 0;
  if (MIGRATIONS.length !== SCHEMA_VERSION) {
    throw new Error(
      `[db] migration mismatch: SCHEMA_VERSION=${SCHEMA_VERSION} but MIGRATIONS has ${MIGRATIONS.length} entries`,
    );
  }
  try {
    for (let v = current; v < SCHEMA_VERSION; v++) {
      const migration = MIGRATIONS[v];
      if (migration == null) {
        throw new Error(`[db] missing migration for version ${v}`);
      }
      opened.execSync(migration);
    }
    opened.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  } catch (error) {
    // Leave user_version where it was so the next launch retries rather
    // than silently thinking the migration succeeded mid-batch.
    throw error;
  }
  db = opened;
  return db;
}

export function closeDatabase(): void {
  try {
    db?.closeSync();
  } catch {
    // Best-effort close; the singleton is dropped regardless.
  }
  db = null;
}
