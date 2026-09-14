import type { UpiNotification } from "upi-listener";
import { STALE_MS } from "./constants";
import { isDuplicate } from "./dedup";
import { logUnparsed } from "./unparsed";
import { parseUpiNotification } from "./upi";
import { formatINR } from "./amount";
import type { ProcessResult } from "./types";

export * from "./types";
export { formatINR };
export { getUnparsed } from "./unparsed";
export { seedDedupKey } from "./dedup";
export { parseUpiNotification, PARSER_TABLE } from "./upi";
export type { ParseOutcome } from "./upi";

export function processNotification(
  event: UpiNotification,
  now: number = Date.now(),
): ProcessResult {
  if (event.postedAt > 0 && now - event.postedAt > STALE_MS) {
    logUnparsed(event, "stale", []);
    return { status: "unparsed", reason: "stale" };
  }
  const outcome = parseUpiNotification(event);
  if (outcome.kind === "outgoing") {
    console.log(
      `[upi-parser] outgoing payment ignored (${event.packageName})`,
    );
    return { status: "outgoing" };
  }
  if (outcome.kind === "none") {
    logUnparsed(event, outcome.reason, outcome.attempted);
    return { status: "unparsed", reason: outcome.reason };
  }
  if (isDuplicate(outcome.payment, event.postedAt, now, event.key)) {
    console.log(
      `[upi-parser] duplicate ignored: ${formatINR(outcome.payment.amountPaise)} ` +
        `from ${outcome.payment.sender ?? "unknown"} (${outcome.payment.appName})`,
    );
    return { status: "duplicate", payment: outcome.payment };
  }
  console.log(
    `[upi-parser] parsed: ${formatINR(outcome.payment.amountPaise)} ` +
      `from ${outcome.payment.sender ?? "unknown"} ` +
      `(${outcome.payment.appName}, ${outcome.payment.confidence})`,
  );
  return { status: "parsed", payment: outcome.payment };
}
