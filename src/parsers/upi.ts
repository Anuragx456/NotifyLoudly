import type { UpiNotification } from "upi-listener";
import { extractAmounts } from "./amount";
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
  const stop = new Set(["money", "payment", "amount", "received", "credited", "your", "bank", "account"]);
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

  const attempted: string[] = [];
  for (const pattern of parser.patterns) {
    attempted.push(pattern.id);
    if (!pattern.test.test(combined)) {
      continue;
    }
    if (pattern.direction === "outgoing") {
      return { kind: "outgoing" };
    }
    const amounts = extractAmounts(combined);
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

  const amounts = extractAmounts(combined);
  if (amounts.length > 0) {
    return {
      kind: "none",
      reason: "amount-without-payment-context",
      attempted,
    };
  }
  return { kind: "none", reason: "no-amount-found", attempted };
}
