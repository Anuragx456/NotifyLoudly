import { describe, expect, test } from "bun:test";
import type { UpiNotification } from "upi-listener";
import { processNotification } from "../index";
import { parseUpiNotification } from "../upi";
import { isDuplicate, resetDedup } from "../dedup";
import { makeDedupKey } from "@/db/dedupKey";
import { STALE_MS } from "../constants";

const GPAY = "com.google.android.apps.nbu.paisa.user";

let id = 1000;
function event(
  text: string,
  postedAt: number = Date.now(),
  title: string = "GPay",
): UpiNotification {
  id += 1;
  return {
    packageName: GPAY,
    title,
    text,
    bigText: "",
    subText: "",
    tickerText: "",
    postedAt,
    notificationId: id,
    key: `reliability-${id}`,
  };
}

describe("amount range guard", () => {
  test("over-cap symbol amount reports amount-out-of-range", () => {
    const outcome = parseUpiNotification(
      event("Received \u20B92,00,00,000 from Aman"),
    );
    expect(outcome.kind).toBe("none");
    if (outcome.kind !== "none") return;
    expect(outcome.reason).toBe("amount-out-of-range");
  });
});

describe("stale guard", () => {
  test("ancient notifications stay silent via processNotification", () => {
    const now = Date.now();
    const result = processNotification(
      event("Received \u20B9500 from Aman", now - STALE_MS - 1000),
      now,
    );
    expect(result.status).toBe("unparsed");
    if (result.status !== "unparsed") return;
    expect(result.reason).toBe("stale");
  });

  test("fresh notifications still parse", () => {
    const now = Date.now();
    const result = processNotification(
      event("Received \u20B9500 from Aman", now - 1000),
      now,
    );
    expect(result.status).toBe("parsed");
  });
});

describe("postedAt fallback", () => {
  test("postedAt=0 bursts dedup but distinct buckets do not collide", () => {
    resetDedup();
    const payment = {
      amountPaise: 50000,
      sender: "Aman",
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: 0,
    };
    // Same 30s coalesce bucket → duplicate
    expect(isDuplicate(payment, 0, 1000)).toBe(false);
    expect(isDuplicate(payment, 0, 2000)).toBe(true);
    const keyA = makeDedupKey(50000, "Aman", 0, 1000);
    const keyB = makeDedupKey(50000, "Aman", 0, 1000 + 31 * 1000);
    expect(keyA).not.toBe(keyB);
  });

  test("postedAt>0: same notification re-delivery dedups, distinct timestamps do not", () => {
    resetDedup();
    const now = Date.now();
    const payment = {
      amountPaise: 100,
      sender: "Aman",
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: now,
    };
    const later = now + 60 * 1000;
    expect(isDuplicate(payment, now, now)).toBe(false);
    // Exact same postedAt → true (same notification re-delivered)
    expect(isDuplicate(payment, now, now + 1000)).toBe(true);
    // Different postedAt → distinct payment, must NOT be duplicate
    expect(isDuplicate(payment, later, now + 2000)).toBe(false);
    expect(makeDedupKey(100, "Aman", now, now)).not.toBe(makeDedupKey(100, "Aman", later, now + 2000));
  });

  test("same SBN key re-delivery dedups regardless of amount parse", () => {
    resetDedup();
    const now = Date.now();
    const payment = {
      amountPaise: 100,
      sender: "Aman",
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: now,
    };
    expect(isDuplicate(payment, now, now, "0|pkg|1|k")).toBe(false);
    expect(isDuplicate(payment, now, now + 50, "0|pkg|1|k")).toBe(true);
  });

  test("same SBN key with different postedAt does NOT dedup siblings", () => {
    // Many UPI apps reuse the same notification id/tag, so sibling payments
    // share sbn.key with different postedAt inside the 10-min TTL.
    // Regression for: Rs1 from brother, second Rs1 a minute later was silent.
    resetDedup();
    const now = Date.now();
    const later = now + 60_000;
    const payment = {
      amountPaise: 100,
      sender: "Aman",
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: now,
    };
    const sibling = { ...payment, postedAt: later };
    const reusedKey = "0|com.google.android.apps.nbu.paisa.user|1|null|1000";
    expect(isDuplicate(payment, now, now, reusedKey)).toBe(false);
    // Same sbn.key but different postedAt → must not be duplicate
    expect(isDuplicate(sibling, later, now + 2000, reusedKey)).toBe(false);
    // Exact re-delivery (same key + same postedAt) still dedups
    expect(isDuplicate(payment, now, now + 3000, reusedKey)).toBe(true);
  });

  test("postedAt==0 SBN key uses coalesce bucket like payment key", () => {
    resetDedup();
    const p = {
      amountPaise: 100,
      sender: "Aman",
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: 0,
    };
    const key = "0|pkg|1|k";
    // Same 30s bucket → duplicate
    expect(isDuplicate(p, 0, 1000, key)).toBe(false);
    expect(isDuplicate(p, 0, 2000, key)).toBe(true);
    // Different bucket → not duplicate even with same sbn.key
    resetDedup();
    expect(isDuplicate(p, 0, 1000, key)).toBe(false);
    expect(isDuplicate(p, 0, 1000 + 31_000, key)).toBe(false);
  });
});

describe("cross-source echo suppression (double-announce fix)", () => {
  function payment(postedAt: number) {
    return {
      amountPaise: 50000,
      sender: "Aman",
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt,
    };
  }

  test("echo seconds apart speaks once: second is duplicate", () => {
    // One logical payment surfacing twice — UPI app + bank app echo, or a
    // post + update with a fresh postTime. Different sbn.keys, same
    // amount+sender, postedAt 5s apart → second stays silent.
    resetDedup();
    const now = Date.now();
    const echo = now + 5000;
    expect(isDuplicate(payment(now), now, now, "0|upi-app|1|k")).toBe(false);
    expect(isDuplicate(payment(echo), echo, now + 5000, "0|bank-app|7|k")).toBe(true);
  });

  test("genuine repeat a minute later still speaks", () => {
    // Genuine repeats land 60s+ apart in postedAt — outside the 10s window.
    resetDedup();
    const now = Date.now();
    const later = now + 60_000;
    expect(isDuplicate(payment(now), now, now, "0|upi-app|1|k")).toBe(false);
    expect(isDuplicate(payment(later), later, later, "0|upi-app|1|k")).toBe(false);
  });

  test("genuine repeat just outside the window still speaks", () => {
    // 12s apart — outside the 10s window, so a rapid genuine repeat speaks.
    resetDedup();
    const now = Date.now();
    const later = now + 12_000;
    expect(isDuplicate(payment(now), now, now, "0|upi-app|1|k")).toBe(false);
    expect(isDuplicate(payment(later), later, later, "0|upi-app|1|k")).toBe(false);
  });

  test("repeat just inside the window is still suppressed", () => {
    // 8s apart — inside the 10s window, so an echo still collapses to one.
    resetDedup();
    const now = Date.now();
    const echo = now + 8000;
    expect(isDuplicate(payment(now), now, now, "0|upi-app|1|k")).toBe(false);
    expect(isDuplicate(payment(echo), echo, now + 8000, "0|upi-app|1|k")).toBe(true);
  });

  test("different sender or amount inside the window still speaks", () => {
    resetDedup();
    const now = Date.now();
    const echo = now + 5000;
    expect(isDuplicate(payment(now), now, now)).toBe(false);
    const otherSender = { ...payment(echo), sender: "Rahul" };
    expect(isDuplicate(otherSender, echo, echo)).toBe(false);
    const otherAmount = { ...payment(echo), sender: "Aman", amountPaise: 60000 };
    expect(isDuplicate(otherAmount, echo, echo)).toBe(false);
  });
});

describe("empty-sender dedup", () => {
  test("same amount, empty vs named sender → not duplicate", () => {
    resetDedup();
    const amountPaise = 50000;
    const now = Date.now();
    const emptyPayment = {
      amountPaise,
      sender: null as string | null,
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: now,
    };
    const namedPayment = {
      amountPaise,
      sender: "Aman",
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: now,
    };
    expect(isDuplicate(emptyPayment, now, now)).toBe(false);
    expect(isDuplicate(namedPayment, now, now)).toBe(false);
    // empty-sender now keys as "unknown", not "" — should not collide with "aman"
    const emptyKey = makeDedupKey(amountPaise, null, now, now);
    const namedKey = makeDedupKey(amountPaise, "Aman", now, now);
    expect(emptyKey).not.toBe(namedKey);
  });

  test("two empty-sender same postedAt → duplicate (same notification)", () => {
    resetDedup();
    const now = Date.now();
    const payment = {
      amountPaise: 50000,
      sender: null as string | null,
      sourcePackage: GPAY,
      appName: "Google Pay",
      confidence: "high" as const,
      patternId: "received-from",
      postedAt: now,
    };
    expect(isDuplicate(payment, now, now)).toBe(false);
    expect(isDuplicate(payment, now, now)).toBe(true);
  });
});

describe("bare-amount range guard", () => {
  test("huge bare number without symbol stays silent, never ok-bare", () => {
    // Bare path only extracts 1-9 digit numbers; ≥10 digits or out-of-range
    // paise via toPaise() yields no parsed result — must NOT become ok-bare.
    const outcome = parseUpiNotification(event("Received 1234567890 from Aman"));
    expect(outcome.kind).toBe("none");
    if (outcome.kind !== "none") return;
    // Either no-amount-found (no valid bare capture) is correct; the point is
    // it is NOT parsed as a payment.
    expect(["no-amount-found", "amount-out-of-range"]).toContain(outcome.reason);
  });

  test("symbol amount over cap → amount-out-of-range", () => {
    const outcome = parseUpiNotification(event("Received ₹2,00,00,000 from Aman"));
    expect(outcome.kind).toBe("none");
    if (outcome.kind !== "none") return;
    expect(outcome.reason).toBe("amount-out-of-range");
  });
});

describe("unicode sender", () => {
  test("Devanagari sender is preserved", () => {
    const outcome = parseUpiNotification(
      event("Received \u20B9500 from \u0905\u092E\u0928 \u0915\u0941\u092E\u093E\u0930"),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.sender).toContain("\u0905\u092E\u0928");
  });
});
