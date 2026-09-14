import type { ParsedPayment } from "./types";
import { DEDUP_TTL_MS, DEDUP_COALESCE_MS, DEDUP_CROSS_SOURCE_MS } from "./constants";

const MAX_ENTRIES = 500;

// Three tiers:
//   1. sbn.key — exact NotificationStatusBar key (e.g. "0|pkg|id|...").
//      Catches re-delivered / updated notifications regardless of parse.
//   2. exact amount|sender|postedAt — only the exact postedAt (or short
//      coalesce bucket when postedAt==0). Distinct payments never share
//      postedAt, so same amount/sender seconds apart no longer collides.
//   3. amount|sender recency (seenPairAt) — same pair with postedAt closer
//      than DEDUP_CROSS_SOURCE_MS is a cross-source echo of one payment
//      (UPI app + bank app, post + update) and speaks once.
const seenKey = new Map<string, number>();
const seenPayment = new Map<string, number>();
// Cross-source echoes (UPI app + bank app for one payment, post + update)
// share amount+sender but carry different postedAt seconds apart. Remember
// the last observation per pair so the echo speaks once. Keyed WITHOUT
// postedAt; suppression compares postedAt distance against
// DEDUP_CROSS_SOURCE_MS, so genuine repeats landing minutes apart still
// speak. Entries expire with the same TTL as the other maps (expiry by
// observation time is safe: a stale entry can only suppress a payment whose
// postedAt is seconds from the stale postedAt, which the 30-min stale guard
// already rejects). postedAt==0 never feeds this map (no reliable
// timestamp; those bursts already coalesce via the 30s bucket above).
interface PairSeen {
  postedAt: number;
  seenAt: number;
}
const seenPairAt = new Map<string, PairSeen>();

function normalizeSender(sender: string | null): string {
  return (sender ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "unknown";
}

function exactPaymentKey(
  payment: ParsedPayment,
  postedAtMs: number,
  fallbackNow: number,
): string {
  if (postedAtMs > 0) {
    return `${payment.amountPaise}|${normalizeSender(payment.sender)}|${postedAtMs}`;
  }
  const bucket = Math.floor(fallbackNow / DEDUP_COALESCE_MS);
  return `${payment.amountPaise}|${normalizeSender(payment.sender)}|b:${bucket}`;
}

let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 60_000;

function pairKey(payment: ParsedPayment): string {
  return `${payment.amountPaise}|${normalizeSender(payment.sender)}`;
}

function prune(now: number): void {
  const due = now - lastPruneAt > PRUNE_INTERVAL_MS;
  if (seenKey.size + seenPayment.size + seenPairAt.size <= MAX_ENTRIES && !due) return;
  lastPruneAt = now;
  for (const [k, at] of seenKey) {
    if (now - at > DEDUP_TTL_MS) seenKey.delete(k);
  }
  for (const [k, at] of seenPayment) {
    if (now - at > DEDUP_TTL_MS) seenPayment.delete(k);
  }
  for (const [k, prev] of seenPairAt) {
    if (now - prev.seenAt > DEDUP_TTL_MS) seenPairAt.delete(k);
  }
}

export function isDuplicate(
  payment: ParsedPayment,
  postedAt: number,
  now: number = Date.now(),
  sbnKey?: string | null,
): boolean {
  prune(now);
  // Composite sbn key: many UPI apps reuse the same SBN id/tag for every
  // payment, so the bare `k:<sbnKey>` would suppress distinct siblings
  // within the 10-min TTL. Binding the SBN dedup to postedAt (or a short
  // coalesce bucket when postedAt==0, mirroring exactPaymentKey) keeps
  // true re-deliveries deduped while letting real siblings through.
  const keyForMap = sbnKey
    ? postedAt > 0
      ? `k:${sbnKey}|${postedAt}`
      : `k:${sbnKey}|b:${Math.floor(now / DEDUP_COALESCE_MS)}`
    : null;
  if (keyForMap && seenKey.has(keyForMap)) return true;
  const exact = exactPaymentKey(payment, postedAt, now);
  const prefixedPayment = `p:${exact}`;
  if (seenPayment.has(prefixedPayment)) return true;
  // Cross-source echo check: same amount+sender with postedAt closer than
  // DEDUP_CROSS_SOURCE_MS is the same logical payment arriving twice (UPI
  // app + bank app echo, or post + update with a fresh postTime) — suppress
  // the second announcement. postedAt distance (not observation distance) is
  // compared, so a victim's phone restart between echo halves, or a burst of
  // unrelated traffic between them, can never widen the window into swallowing
  // a genuine repeat minutes later. postedAt==0 skips this (unreliable
  // timestamp; the coalesce bucket above already handles those bursts).
  if (postedAt > 0) {
    const prev = seenPairAt.get(pairKey(payment));
    if (prev !== undefined && Math.abs(postedAt - prev.postedAt) < DEDUP_CROSS_SOURCE_MS) {
      return true;
    }
  }
  if (keyForMap) seenKey.set(keyForMap, now);
  seenPayment.set(prefixedPayment, now);
  if (postedAt > 0) {
    seenPairAt.set(pairKey(payment), { postedAt, seenAt: now });
  }
  return false;
}

export function resetDedup(): void {
  seenKey.clear();
  seenPayment.clear();
  seenPairAt.clear();
  lastPruneAt = 0;
}

export function seedDedupKey(key: string, seenAt: number): void {
  // Seeds are persisted payments (exact postedAt keys) plus native-gate keys.
  // Store them namespaced so pruning still works; same prefix convention as
  // isDuplicate uses.
  const prefixed = key.startsWith("k:") || key.startsWith("p:") ? key : `p:${key}`;
  if (prefixed.startsWith("p:")) {
    seenPayment.set(prefixed, seenAt);
    // Rebuild cross-source recency too: exact keys embed
    // amount|sender|postedAt, so an echo arriving just after a restart is
    // still suppressed. Bucket keys (postedAt==0, "b:N") carry no usable
    // timestamp and are skipped.
    const parts = prefixed.slice(2).split("|");
    if (parts.length === 3) {
      const postedAt = Number(parts[2]);
      if (Number.isFinite(postedAt) && postedAt > 0) {
        const pair = `${parts[0]}|${parts[1]}`;
        const prev = seenPairAt.get(pair);
        if (prev === undefined || postedAt > prev.postedAt) {
          seenPairAt.set(pair, { postedAt, seenAt });
        }
      }
    }
  } else {
    seenKey.set(prefixed, seenAt);
  }
  prune(Date.now());
}
