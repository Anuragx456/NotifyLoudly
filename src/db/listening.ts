import { getDatabase } from "./client";

export type ListeningReason = "disconnected" | "access-revoked";

export interface ListeningEpisode {
  id: number;
  startedAt: number;
  endedAt: number | null;
  reason: ListeningReason;
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeReason(raw: unknown): ListeningReason {
  return raw === "access-revoked" ? "access-revoked" : "disconnected";
}

function toEpisode(row: {
  id: number;
  started_at: number;
  ended_at: number | null;
  reason: string;
}): ListeningEpisode {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    reason: normalizeReason(row.reason),
  };
}

// Record a single health observation as an open/closed episode transition.
// Connected closes any open episode; a down status opens one (stamping the
// first-seen time) or refreshes the reason if the cause changed mid-outage
// (e.g. disconnected → revoked) without splitting the row.
//
// Unknown statuses (e.g. the "disconnected" fallback the bridge returns when
// the native module is missing) are ignored — callers must gate those out,
// but this is a second line of defense against phantom episodes.
export function recordListeningHealth(
  status: string,
  nowMs: number = Date.now(),
): void {
  if (
    status !== "connected" &&
    status !== "disconnected" &&
    status !== "access-revoked"
  ) {
    return;
  }
  const database = getDatabase();
  if (status === "connected") {
    database.runSync(
      `UPDATE listening_episodes SET ended_at = ? WHERE ended_at IS NULL`,
      [nowMs],
    );
    return;
  }
  const reason = normalizeReason(status);
  const open = database.getFirstSync<{
    id: number;
    started_at: number;
    ended_at: number | null;
    reason: string;
  }>(`SELECT * FROM listening_episodes WHERE ended_at IS NULL`);
  if (!open) {
    database.runSync(
      `INSERT INTO listening_episodes (started_at, ended_at, reason) VALUES (?, NULL, ?)`,
      [nowMs, reason],
    );
    return;
  }
  if (normalizeReason(open.reason) !== reason) {
    database.runSync(`UPDATE listening_episodes SET reason = ? WHERE id = ?`, [
      reason,
      open.id,
    ]);
  }
}

export function listListeningEpisodes(limit: number = 10): ListeningEpisode[] {
  const database = getDatabase();
  const rows = database.getAllSync<{
    id: number;
    started_at: number;
    ended_at: number | null;
    reason: string;
  }>(
    `SELECT * FROM listening_episodes ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(toEpisode);
}

export function pruneListeningEpisodes(nowMs: number = Date.now()): void {
  const database = getDatabase();
  database.runSync(
    `DELETE FROM listening_episodes WHERE ended_at IS NOT NULL AND ended_at < ?`,
    [nowMs - RETENTION_MS],
  );
}
