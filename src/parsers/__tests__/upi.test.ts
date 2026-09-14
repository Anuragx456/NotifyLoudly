import { describe, expect, test } from "bun:test";
import type { UpiNotification } from "upi-listener";
import { parseUpiNotification } from "../upi";

const GPAY = "com.google.android.apps.nbu.paisa.user";
const PHONEPE = "com.phonepe.app";
const PAYTM = "net.one97.paytm";
const BHIM = "in.org.npci.upiapp";

let id = 0;
function event(
  packageName: string,
  title: string,
  text: string,
): UpiNotification {
  id += 1;
  return {
    packageName,
    title,
    text,
    bigText: "",
    subText: "",
    tickerText: "",
    postedAt: Date.now(),
    notificationId: id,
    key: `test-${id}`,
  };
}

describe("incoming payments are parsed", () => {
  test("GPay received-from extracts amount + sender", () => {
    const outcome = parseUpiNotification(
      event(GPAY, "Money received", "Received ₹500.00 from Aman Kumar"),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(50000);
    expect(outcome.payment.sender).toBe("Aman Kumar");
    expect(outcome.payment.confidence).toBe("high");
    expect(outcome.payment.patternId).toBe("received-from");
  });

  test("PhonePe chat-style sent-to-you", () => {
    const outcome = parseUpiNotification(
      event(PHONEPE, "Aman", "sent ₹1 to you."),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(100);
    expect(outcome.payment.sender).toBe("Aman");
    expect(outcome.payment.patternId).toBe("sent-to-you");
  });

  test("PhonePe has-sent-to-account extracts trailing name", () => {
    const outcome = parseUpiNotification(
      event(
        PHONEPE,
        "PhonePe",
        "Money received AMAN TAMRAKAR has sent ₹1 to your bank account A/C XXXX1234",
      ),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(100);
    expect(outcome.payment.sender).toBe("AMAN TAMRAKAR");
    expect(outcome.payment.patternId).toBe("has-sent-to-account");
  });

  test("PhonePe Business received payment", () => {
    const outcome = parseUpiNotification(
      event(
        "com.phonepe.app.business",
        "Payment Received",
        "Received ₹150 from Vikram Singh on PhonePe QR",
      ),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(15000);
    expect(outcome.payment.sender).toBe("Vikram Singh");
    expect(outcome.payment.appName).toBe("PhonePe Business");
  });

  test("Navi received payment", () => {
    const outcome = parseUpiNotification(
      event(
        "com.navi.services",
        "Money Received",
        "Received ₹500 from Rohit Sharma",
      ),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(50000);
    expect(outcome.payment.sender).toBe("Rohit Sharma");
    expect(outcome.payment.appName).toBe("Navi");
  });

  test("Navi (com.naviapp) received payment", () => {
    const outcome = parseUpiNotification(
      event(
        "com.naviapp",
        "Money Received",
        "Received ₹250 from Ankit Verma",
      ),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(25000);
    expect(outcome.payment.sender).toBe("Ankit Verma");
    expect(outcome.payment.appName).toBe("Navi");
  });

  test("credited-by extracts sender before date tail", () => {
    const outcome = parseUpiNotification(
      event(
        PAYTM,
        "Paytm",
        "Your account XXXX1234 has been credited with ₹2,500.00 by RAHUL on 07-09-2026",
      ),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(250000);
    expect(outcome.payment.sender).toBe("RAHUL");
  });

  test("Hindi incoming parses without sender", () => {
    const outcome = parseUpiNotification(
      event(BHIM, "BHIM", "आपको ₹200 प्राप्त हुए"),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(20000);
    expect(outcome.payment.sender).toBeNull();
  });

  test("credited without from/by parses high without sender", () => {
    const outcome = parseUpiNotification(
      event(GPAY, "GPay", "Credited ₹50 to your account"),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(5000);
    expect(outcome.payment.patternId).toBe("credited-from");
    expect(outcome.payment.sender).toBeNull();
  });
});

describe("outgoing payments are ignored", () => {
  const outgoingCases: Array<[string, string, string]> = [
    [PHONEPE, "PhonePe", "You have sent ₹200 to Sharma"],
    [PHONEPE, "PhonePe", "You've sent ₹200 to Sharma"],
    [GPAY, "GPay", "Sent ₹200 to Sharma"],
    [GPAY, "GPay", "Paid ₹200 to Sharma"],
    [PAYTM, "Paytm", "Payment of ₹200 successful to Sharma"],
  ];
  for (const [pkg, title, text] of outgoingCases) {
    test(`outgoing ignored: "${text}"`, () => {
      expect(parseUpiNotification(event(pkg, title, text)).kind).toBe(
        "outgoing",
      );
    });
  }
});

describe("unparseable input stays silent", () => {
  test("unknown package", () => {
    const outcome = parseUpiNotification(
      event("com.example.bank", "Bank", "Received ₹100 from X"),
    );
    expect(outcome.kind).toBe("none");
    if (outcome.kind !== "none") return;
    expect(outcome.reason).toBe("package-not-allowlisted");
  });

  test("empty text", () => {
    const outcome = parseUpiNotification(event(GPAY, "", ""));
    expect(outcome.kind).toBe("none");
    if (outcome.kind !== "none") return;
    expect(outcome.reason).toBe("empty-text");
  });

  test("bare amount without currency symbol falls back to medium", () => {
    const outcome = parseUpiNotification(
      event(GPAY, "GPay", "Received 500 from Aman"),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(50000);
    expect(outcome.payment.sender).toBe("Aman");
    expect(outcome.payment.confidence).toBe("medium");
    expect(outcome.payment.patternId).toBe("bare-amount-fallback");
  });

  test("bare outgoing stays outgoing", () => {
    expect(
      parseUpiNotification(event(GPAY, "GPay", "Sent 500 to Sharma")).kind,
    ).toBe("outgoing");
    expect(
      parseUpiNotification(event(GPAY, "GPay", "Paid 500 to Sharma")).kind,
    ).toBe("outgoing");
  });

  test("bare number without payment context stays silent", () => {
    const outcome = parseUpiNotification(
      event(GPAY, "GPay", "Your balance is 12000"),
    );
    expect(outcome.kind).toBe("none");
  });

  test("balance-first text skips the balance amount", () => {
    const outcome = parseUpiNotification(
      event(GPAY, "GPay", "Balance ₹12,000. Received ₹500 from Aman"),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(50000);
  });

  test("trailing balance does not shadow the payment", () => {
    const outcome = parseUpiNotification(
      event(GPAY, "GPay", "Received ₹500 from Aman. Available balance ₹12,000"),
    );
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.payment.amountPaise).toBe(50000);
  });
});
