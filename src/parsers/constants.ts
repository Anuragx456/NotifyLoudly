export const MAX_PAISA = 1_000_000_000;
export const BALANCE_WINDOW = 15;
export const DEDUP_WINDOW_MS = 10 * 60 * 1000;
// How long a seen key stays in memory / on disk. Doubles as the TTL for
// pruning both the JS and native dedup maps. Keep at 10 minutes — it is a
// retention window, NOT a dedup window for distinct payments.
export const DEDUP_TTL_MS = DEDUP_WINDOW_MS;
// Only used when postedAt is 0 (no reliable timestamp). Rapid redeliveries
// with postedAt==0 share a bucket, but distinct payments minutes apart never
// bucket together. Small — burst dedup only.
export const DEDUP_COALESCE_MS = 30 * 1000;
export const STALE_MS = 30 * 60 * 1000;
// Cross-source suppression window (double-announce fix): two notifications
// for ONE logical payment (e.g. UPI app + bank app echo, or post + update)
// carry different postedAt seconds apart. Same amount+sender with postedAt
// closer than this speaks once. Genuine repeats ~10s+ apart in postedAt now
// speak. Tradeoff: echoes landing 10-30s apart may double-announce (accepted
// to stop swallowing rapid genuine repeats). Keep well under a minute.
// Mirrored as CROSS_SOURCE_WINDOW_MS in UpiAnnounceGate.kt.
export const DEDUP_CROSS_SOURCE_MS = 10 * 1000;
