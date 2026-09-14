import { DEDUP_COALESCE_MS } from "@/parsers/constants";

export function makeDedupKey(
  amountPaise: number,
  sender: string | null,
  postedAt: number,
  fallbackNow: number = Date.now(),
): string {
  const normalized = (sender ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "unknown";
  if (postedAt > 0) {
    // Genuine payments have a stable postTime. Two different notifications
    // — even same amount/sender minutes apart — have different postedAt, so
    // they must NOT collide. Using the exact timestamp keeps true
    // re-deliveries (same postedAt) deduped without swallowing siblings.
    return `${amountPaise}|${normalized}|${postedAt}`;
  }
  // postedAt==0 fallback: coalesce bursts in a short window so a rapid
  // re-delivery with slightly different `fallbackNow` is still suppressed,
  // but distinct payments minutes apart land in different buckets.
  const bucket = Math.floor(fallbackNow / DEDUP_COALESCE_MS);
  return `${amountPaise}|${normalized}|b:${bucket}`;
}
