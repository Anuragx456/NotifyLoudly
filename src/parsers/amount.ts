import { MAX_PAISA } from "./constants";

const AMOUNT_RE = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi;

export function toPaise(numStr: string): number | null {
  const normalized = numStr.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const paise = Math.round(parseFloat(normalized) * 100);
  if (!Number.isFinite(paise) || paise <= 0 || paise > MAX_PAISA) {
    return null;
  }
  return paise;
}

const BALANCE_CONTEXT_RE_IN_AMOUNT = /balance|avail|closing|total\s+due/i;
const BALANCE_WINDOW_IN_AMOUNT = 15;

export function hasOutOfRangeSymbolAmount(text: string): boolean {
  AMOUNT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AMOUNT_RE.exec(text)) !== null) {
    // Balance amounts are not payment amounts - same rule as nonBalanceAmounts.
    const idx = match.index ?? 0;
    if (
      BALANCE_CONTEXT_RE_IN_AMOUNT.test(
        text.slice(Math.max(0, idx - BALANCE_WINDOW_IN_AMOUNT), idx),
      )
    ) {
      continue;
    }
    const normalized = match[1].replace(/,/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      continue;
    }
    const paise = Math.round(parseFloat(normalized) * 100);
    if (Number.isFinite(paise) && (paise <= 0 || paise > MAX_PAISA)) {
      return true;
    }
  }
  return false;
}

export function extractAmounts(text: string): { raw: string; paise: number; index: number }[] {
  const found: { raw: string; paise: number; index: number }[] = [];
  AMOUNT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AMOUNT_RE.exec(text)) !== null) {
    const paise = toPaise(match[1]);
    if (paise !== null) {
      found.push({ raw: match[0], paise, index: match.index ?? 0 });
    }
  }
  return found;
}

export function formatINR(paise: number): string {
  try {
    const s = (paise / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // Hermes on some firmware formats en-IN as en-US (1,234,567 vs 12,34,567).
    // Keep native Intl when it actually produced lakh grouping; otherwise
    // fall back to the manual formatter that matches Kotlin's PaymentAlertManager.
    if (/^\d{1,2}(,\d{2})*,\d{3}\.\d{2}$/.test(s) || paise < 10000000) return `₹${s}`;
  } catch {}
  // Manual en-IN lakh formatter - matches Kotlin PaymentAlertManager.formatINR
  const rupees = Math.floor(paise / 100);
  const remainder = (paise % 100).toString().padStart(2, "0");
  const digits = String(rupees);
  const tail = digits.length > 3 ? digits.slice(-3) : digits;
  let head = digits.length > 3 ? digits.slice(0, -3) : "";
  const parts: string[] = [];
  while (head.length > 2) { parts.unshift(head.slice(-2)); head = head.slice(0, -2); }
  if (head) parts.unshift(head);
  parts.push(tail);
  return `₹${parts.join(",")}.${remainder}`;
}
