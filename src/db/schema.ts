export const SCHEMA_VERSION = 8;

export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_paise INTEGER NOT NULL,
    sender TEXT,
    source_package TEXT NOT NULL,
    app_name TEXT NOT NULL,
    speech_text TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    posted_at INTEGER NOT NULL,
    announced_at INTEGER NOT NULL,
    dedup_key TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_payments_announced_at ON payments (announced_at DESC);`,
  `CREATE TABLE IF NOT EXISTS dedup_keys (
    dedup_key TEXT PRIMARY KEY,
    seen_at INTEGER NOT NULL
  );`,
// Dedup guard: keep the newest row per dedup_key, drop older duplicates
// before promoting to UNIQUE. Without this, devices that already have
// two rows with the same key (e.g. re-announced burst before dedup was
// added) throw SQLITE_CONSTRAINT on upgrade and the app never starts.
`DELETE FROM payments WHERE id NOT IN (
   SELECT MAX(id) FROM payments GROUP BY dedup_key
 );`,
`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_dedup_key ON payments (dedup_key);`,
// Phase 4: one row per contiguous down-stretch (connect/disconnect/revoke
// history). ended_at NULL = still down. A single partial unique index
// enforces at most one open episode without a separate lock table.
`CREATE TABLE IF NOT EXISTS listening_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  reason TEXT NOT NULL
);`,
`CREATE UNIQUE INDEX IF NOT EXISTS idx_listening_episodes_open ON listening_episodes (ended_at) WHERE ended_at IS NULL;`,
`CREATE INDEX IF NOT EXISTS idx_listening_episodes_started_at ON listening_episodes (started_at DESC);`,
];
