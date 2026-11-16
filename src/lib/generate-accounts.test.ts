import { describe, expect, test } from "bun:test";
import { parseAccountAmount } from "@/lib/generate-accounts.ts";

describe("parseAccountAmount", () => {
  test("accepts whole numbers of at least 1", () => {
    expect(parseAccountAmount("1")).toBe(1);
    expect(parseAccountAmount(" 50 ")).toBe(50);
    expect(parseAccountAmount("007")).toBe(7);
  });

  test("rejects an empty field so users can clear it while typing", () => {
    expect(parseAccountAmount("")).toBeNull();
    expect(parseAccountAmount("   ")).toBeNull();
  });

  test("rejects zero, negatives, decimals, and exponents", () => {
    expect(parseAccountAmount("0")).toBeNull();
    expect(parseAccountAmount("-3")).toBeNull();
    expect(parseAccountAmount("2.5")).toBeNull();
    expect(parseAccountAmount("1e3")).toBeNull();
  });

  test("rejects values beyond the safe integer range", () => {
    expect(parseAccountAmount("9007199254740993")).toBeNull();
  });
});
