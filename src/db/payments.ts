import type { AnnouncementEvent } from "upi-listener";
import { getDatabase } from "./client";

export interface StoredPayment {
  id: number;
  amountPaise: number;
  sender: string | null;
  sourcePackage: string;
  appName: string;
  speechText: string;
  latencyMs: number;
  postedAt: number;
  announcedAt: number;
  dedupKey: string;
}

export interface DedupSeed {
  key: string;
  seenAt: number;
}

const DEDUP_WINDOW_MS = 10 * 60 * 1000;

export function makeDedupKey(
  amountPaise: number,
  sender: string | null,
  postedAt: number,
): string {
  const normalized = (sender ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${amountPaise}|${normalized}|${Math.floor(postedAt / DEDUP_WINDOW_MS)}`;
}

export async function insertAnnouncedPayment(
  event: AnnouncementEvent,
  sourcePackage: string,
): Promise<number> {
  const announcedAt = Date.now();
  const sender = event.sender || null;
  const dedupKey = makeDedupKey(event.amountPaise, sender, event.postedAt);
  const database = getDatabase();
  const result = await database.runAsync(
    `INSERT INTO payments
      (amount_paise, sender, source_package, app_name, speech_text,
       latency_ms, posted_at, announced_at, dedup_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.amountPaise,
      sender,
      sourcePackage,
      event.appName,
      event.text,
      event.latencyMs,
      event.postedAt,
      announcedAt,
      dedupKey,
    ],
  );
  await database.runAsync(
    `INSERT OR REPLACE INTO dedup_keys (dedup_key, seen_at) VALUES (?, ?)`,
    [dedupKey, announcedAt],
  );
  await database.runAsync(`DELETE FROM dedup_keys WHERE seen_at < ?`, [
    announcedAt - DEDUP_WINDOW_MS,
  ]);
  return result.lastInsertRowId;
}

export async function listRecentPayments(
  limit: number = 100,
): Promise<StoredPayment[]> {
  const database = getDatabase();
  const rows = await database.getAllAsync<{
    id: number;
    amount_paise: number;
    sender: string | null;
    source_package: string;
    app_name: string;
    speech_text: string;
    latency_ms: number;
    posted_at: number;
    announced_at: number;
    dedup_key: string;
  }>(`SELECT * FROM payments ORDER BY announced_at DESC LIMIT ?`, [limit]);
  return rows.map((row) => ({
    id: row.id,
    amountPaise: row.amount_paise,
    sender: row.sender,
    sourcePackage: row.source_package,
    appName: row.app_name,
    speechText: row.speech_text,
    latencyMs: row.latency_ms,
    postedAt: row.posted_at,
    announcedAt: row.announced_at,
    dedupKey: row.dedup_key,
  }));
}

export async function loadRecentDedupSeeds(): Promise<DedupSeed[]> {
  const database = getDatabase();
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  const rows = await database.getAllAsync<{
    dedup_key: string;
    seen_at: number;
  }>(`SELECT dedup_key, seen_at FROM dedup_keys WHERE seen_at >= ?`, [cutoff]);
  return rows.map((row) => ({ key: row.dedup_key, seenAt: row.seen_at }));
}

export async function clearAllPayments(): Promise<void> {
  const database = getDatabase();
  await database.runAsync(`DELETE FROM payments`);
  await database.runAsync(`DELETE FROM dedup_keys`);
}
