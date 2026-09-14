import type { UpiNotification } from "upi-listener";

export interface UnparsedEntry {
  packageName: string;
  postedAt: number;
  titleLen: number;
  textLen: number;
  bigTextLen: number;
  reason: string;
  attempted: string[];
}

const MAX_ENTRIES = 100;
const entries: UnparsedEntry[] = [];

export function logUnparsed(event: UpiNotification, reason: string, attempted: string[]): void {
  entries.unshift({
    packageName: event.packageName,
    postedAt: event.postedAt,
    titleLen: event.title?.length ?? 0,
    textLen: event.text?.length ?? 0,
    bigTextLen: event.bigText?.length ?? 0,
    reason,
    attempted,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
  console.warn(
    `[upi-parser] unparsed (${reason}) from ${event.packageName}; ` +
      `tried: ${attempted.join(",") || "none"}`,
  );
}

export function getUnparsed(): readonly UnparsedEntry[] {
  return entries;
}

export function resetUnparsed(): void {
  entries.length = 0;
}
