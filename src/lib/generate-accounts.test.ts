import { describe, expect, test } from "bun:test";
import {
  formatAccountName,
  parseAccountAmount,
  resolveNameFormat,
} from "@/lib/generate-accounts.ts";

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

describe("resolveNameFormat", () => {
  test("keeps a format that already contains %d", () => {
    expect(resolveNameFormat("Bot_%d")).toBe("Bot_%d");
    expect(resolveNameFormat(" %d_Bot ")).toBe("%d_Bot");
  });

  test("appends %d when the format has no placeholder", () => {
    expect(resolveNameFormat("Bot")).toBe("Bot%d");
    expect(resolveNameFormat("Bot_ ")).toBe("Bot_%d");
  });

  test("rejects an empty format", () => {
    expect(resolveNameFormat("")).toBeNull();
    expect(resolveNameFormat("   ")).toBeNull();
  });
});

describe("formatAccountName", () => {
  test("replaces the placeholder with the account number", () => {
    expect(formatAccountName("Bot_%d", 1)).toBe("Bot_1");
    expect(formatAccountName("%dBot", 12)).toBe("12Bot");
  });
});
