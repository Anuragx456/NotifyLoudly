const AMOUNT_RE = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi;

const MAX_PAISA = 1_000_000_000;

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
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
