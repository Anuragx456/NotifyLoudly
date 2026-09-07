import { describe, expect, test } from "bun:test";
import { formatINR, toPaise } from "../amount";

describe("toPaise", () => {
  test("parses grouped decimals", () => {
    expect(toPaise("1,250.50")).toBe(125050);
  });
  test("rejects zero, negative-shaped and over-precise input", () => {
    expect(toPaise("0")).toBeNull();
    expect(toPaise("10.123")).toBeNull();
    expect(toPaise("abc")).toBeNull();
  });
});

describe("formatINR", () => {
  test("formats paise with Indian grouping", () => {
    expect(formatINR(125050)).toBe("₹1,250.50");
  });
});
