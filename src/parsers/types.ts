export type ParseConfidence = "high" | "medium";

export interface ParsedPayment {
  amountPaise: number;
  sender: string | null;
  sourcePackage: string;
  appName: string;
  confidence: ParseConfidence;
  patternId: string;
  postedAt: number;
}

export type ProcessResult =
  | { status: "parsed"; payment: ParsedPayment }
  | { status: "duplicate"; payment: ParsedPayment }
  | { status: "outgoing" }
  | { status: "unparsed"; reason: string };
