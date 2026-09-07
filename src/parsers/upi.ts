import type { UpiNotification } from "upi-listener";
import { extractAmounts, toPaise } from "./amount";
import type { ParseConfidence, ParsedPayment } from "./types";

interface AppPattern {
  id: string;
  direction: "incoming" | "outgoing";
  test: RegExp;
  sender?: RegExp;
  confidence: ParseConfidence;
}

interface AppParser {
  packageName: string;
  appName: string;
  patterns: AppPattern[];
}

const INCOMING_TEMPLATES: AppPattern[] = [
  {
    // PhonePe chat-style credit: "Aman sent ₹1 to you." Must precede the
    // outgoing patterns — "sent ₹1" alone looks outgoing.
    id: "sent-to-you",
    direction: "incoming",
    test: /(?:sent|paid|transferred)\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+to\s+you\b/i,
    sender: /(.{1,40}?)\s+sent\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+to\s+you\b/i,
    confidence: "high",
  },
  {
    // PhonePe transactional credit: "AMAN TAMRAKAR has sent ₹1 to your bank
    // account …". Recipient is you — must also precede outgoing patterns.
    id: "has-sent-to-account",
    direction: "incoming",
    test: /(?:has|have)\s+sent\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?/i,
    confidence: "high",
  },
  {
    id: "received-from",
    direction: "incoming",
    test: /received\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+from\s+/i,
    sender: /received\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+from\s+([A-Za-z0-9 .'\-&()]{1,60})/i,
    confidence: "high",
  },
  {
    id: "credited-from",
    direction: "incoming",
    test: /credited\s+(?:with\s+)?(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?/i,
    sender: /credited\s+(?:with\s+)?(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+(?:from|by)\s+([A-Za-z0-9 .'\-&()]{1,60})/i,
    confidence: "high",
  },
  {
    id: "money-received",
    direction: "incoming",
    test: /(?:money|payment|amount)\s+received/i,
    confidence: "medium",
  },
  {
    id: "hindi-incoming",
    direction: "incoming",
    test: /(?:प्राप्त|जमा|क्रेडिट)/,
    confidence: "medium",
  },
];

const OUTGOING_TEMPLATES: AppPattern[] = [
  {
    id: "paid-to",
    direction: "outgoing",
    // Recipient guards: "to you / to your …" means YOU received.
    test: /paid\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?(?!\s+to\s+you\b)(?!\s+to\s+your\b)\s+to\s+(?!you\b|your\b)/i,
    confidence: "high",
  },
  {
    id: "sent-debited",
    direction: "outgoing",
    test: /(?:sent|debited|transferred)(?:\s+\w+){0,4}\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?!\s+to\s+you\b)(?!\s+to\s+your\b)/i,
    confidence: "high",
  },
  {
    id: "payment-successful-out",
    direction: "outgoing",
    test: /payment\s+(?:of\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+)?(?:successful|completed|done)\s+to\s+(?!you\b|your\b)/i,
    confidence: "medium",
  },
];

const GENERIC_INCOMING: AppPattern = {
  id: "generic-incoming",
  direction: "incoming",
  test: /(?:received|credited)/i,
  confidence: "medium",
};

// "You have sent ₹X (to …)" / "You've sent ₹X (to …)" — the sender is you,
// so this is ALWAYS outgoing, even though "have sent ₹X" alone looks like
// an incoming credit (cf. has-sent-to-account). Checked before every
// other pattern: a false "received" announcement for money you sent is
// worse than staying silent.
const YOU_HAVE_SENT_RE = /\byou(?:'ve|\s+have)\s+sent\s+(?:₹|Rs\.?|INR)/i;

// Amounts preceded (within a short window) by balance language belong to
// the account balance, not the payment — e.g. "Balance ₹12,000. Received
// ₹500 from Aman" must announce ₹500, not ₹12,000.
const BALANCE_CONTEXT_RE = /balance|avail|closing|total\s+due/i;
const BALANCE_WINDOW = 15;

function nonBalanceAmounts(text: string): { raw: string; paise: number }[] {
  return extractAmounts(text).filter(
    ({ index }) =>
      !BALANCE_CONTEXT_RE.test(
        text.slice(Math.max(0, index - BALANCE_WINDOW), index),
      ),
  );
}

// Fallback for notifications that state the amount without a currency
// symbol ("Received 500 from Aman"). Fires only when (a) no symbol-amount
// exists, (b) an explicit incoming phrase is present, and (c) no outgoing
// signal is present. Always medium confidence — a wrong guess here still
// beats silence, but it must never outrank a symbol-amount parse.
const BARE_INCOMING_RE =
  /(?:money|payment|amount)\s+received|received\s+\d|credited\s+\d|(?:sent|paid|transferred)\s+\d+(?:\.\d{1,2})?\s+to\s+you\b|(?:has|have)\s+sent\s+\d|प्राप्त|जमा|क्रेडिट/i;
const BARE_OUTGOING_RE =
  /(?:you(?:'ve|\s+have)\s+sent\s+\d|paid\s+\d+\s+to\s+(?!you\b|your\b)|(?:sent|debited|transferred)\s+\d+(?!\s+to\s+you\b)(?!\s+to\s+your\b)|payment\s+(?:of\s+\d+\s+)?(?:successful|completed|done)\s+to\s+(?!you\b|your\b))/i;
const DATE_LIKE_RE = /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g;
const BARE_AMOUNT_RE = /(?<![\d₹\w,.])(\d{1,9}(?:\.\d{1,2})?)(?![\d])/g;

function bareSender(combined: string): string | null {
  const patterns = [
    /received\s+\d+(?:\.\d{1,2})?\s+from\s+([A-Za-z0-9 .'\-&()]{1,60})/i,
    /credited\s+(?:with\s+)?\d+(?:\.\d{1,2})?\s+(?:from|by)\s+([A-Za-z0-9 .'\-&()]{1,60})/i,
    /(.{1,40}?)\s+sent\s+\d+(?:\.\d{1,2})?\s+to\s+you\b/i,
  ];
  for (const re of patterns) {
    const match = re.exec(combined);
    const sender = cleanSender(match?.[1]);
    if (sender) return sender;
  }
  return null;
}

type BareResult =
  | { kind: "outgoing" }
  | { kind: "parsed"; paise: number; sender: string | null }
  | { kind: "none" };

function tryBareAmount(combined: string): BareResult {
  if (BARE_OUTGOING_RE.test(combined)) {
    return { kind: "outgoing" };
  }
  if (!BARE_INCOMING_RE.test(combined)) {
    return { kind: "none" };
  }
  const deDated = combined.replace(DATE_LIKE_RE, " ");
  BARE_AMOUNT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BARE_AMOUNT_RE.exec(deDated)) !== null) {
    const paise = toPaise(match[1]);
    if (paise !== null) {
      return { kind: "parsed", paise, sender: bareSender(combined) };
    }
  }
  return { kind: "none" };
}

function appParser(packageName: string, appName: string): AppParser {
  return {
    packageName,
    appName,
    patterns: [...INCOMING_TEMPLATES, ...OUTGOING_TEMPLATES, GENERIC_INCOMING],
  };
}

export const PARSER_TABLE: AppParser[] = [
  appParser("com.google.android.apps.nbu.paisa.user", "Google Pay"),
  appParser("com.phonepe.app", "PhonePe"),
  appParser("net.one97.paytm", "Paytm"),
  appParser("in.org.npci.upiapp", "BHIM"),
];

export type ParseOutcome =
  | { kind: "parsed"; payment: ParsedPayment }
  | { kind: "outgoing" }
  | { kind: "none"; reason: string; attempted: string[] };

function cleanSender(raw: string | undefined): string | null {
  if (!raw) return null;
  const beforeColon = raw.split(":")[0].trim() || raw.trim();
  const cut = beforeColon.split(/\s+(?:on|via|through|using|to|at|from)\s+/i)[0];
  const cleaned = cut.replace(/[.。,;]+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

const GENERIC_SENDER_WORDS =
  /payment|received|credited|sent|paid|success|notification|phonepe|gpay|paytm|bhim/i;

function senderBeforeHasSent(combined: string): string | null {
  const match = /(?:has|have)\s+sent\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?/i.exec(combined);
  if (!match || match.index === undefined) return null;
  const before = combined.slice(0, match.index).trim();
  if (!before) return null;
  const stop = new Set(["money", "payment", "amount", "received", "credited", "your", "bank", "account", "you"]);
  const words = before.split(/\s+/).filter(Boolean).slice(-4);
  const name = words.filter((w) => !stop.has(w.toLowerCase().replace(/[.`,;:]+$/g, ""))).join(" ");
  const cleaned = cleanSender(name.slice(0, 40));
  return cleaned && !GENERIC_SENDER_WORDS.test(cleaned) ? cleaned : null;
}

export function parseUpiNotification(event: UpiNotification): ParseOutcome {
  const parser = PARSER_TABLE.find((p) => p.packageName === event.packageName);
  if (!parser) {
    return { kind: "none", reason: "package-not-allowlisted", attempted: [] };
  }
  const combined = [event.title, event.text, event.bigText, event.subText]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (combined.length === 0) {
    return { kind: "none", reason: "empty-text", attempted: [] };
  }
  if (YOU_HAVE_SENT_RE.test(combined)) {
    return { kind: "outgoing" };
  }

  const attempted: string[] = [];
  for (const pattern of parser.patterns) {
    attempted.push(pattern.id);
    if (!pattern.test.test(combined)) {
      continue;
    }
    if (pattern.direction === "outgoing") {
      return { kind: "outgoing" };
    }
    const amounts = nonBalanceAmounts(combined);
    if (amounts.length === 0) {
      continue;
    }
    const senderMatch = pattern.sender
      ? pattern.sender.exec(combined)
      : null;
    let sender = cleanSender(senderMatch?.[1]);
    if (pattern.id === "has-sent-to-account") {
      sender = senderBeforeHasSent(combined);
    }
    if (
      (pattern.id === "sent-to-you" || pattern.id === "has-sent-to-account") &&
      sender &&
      GENERIC_SENDER_WORDS.test(sender)
    ) {
      sender = null;
    }
    return {
      kind: "parsed",
      payment: {
        amountPaise: amounts[0].paise,
        sender,
        sourcePackage: event.packageName,
        appName: parser.appName,
        confidence: pattern.confidence,
        patternId: pattern.id,
        postedAt: event.postedAt,
      },
    };
  }

  const amounts = nonBalanceAmounts(combined);
  if (amounts.length > 0) {
    return {
      kind: "none",
      reason: "amount-without-payment-context",
      attempted,
    };
  }
  const bare = tryBareAmount(combined);
  if (bare.kind === "outgoing") {
    return { kind: "outgoing" };
  }
  if (bare.kind === "parsed") {
    return {
      kind: "parsed",
      payment: {
        amountPaise: bare.paise,
        sender: bare.sender,
        sourcePackage: event.packageName,
        appName: parser.appName,
        confidence: "medium",
        patternId: "bare-amount-fallback",
        postedAt: event.postedAt,
      },
    };
  }
  return { kind: "none", reason: "no-amount-found", attempted };
}
