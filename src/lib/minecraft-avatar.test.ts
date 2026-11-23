import { expect, test } from "bun:test";
import { minecraftAvatarUrl } from "./minecraft-avatar";

test("avatar URLs use the skin hash and fall back to Steve", () => {
  expect(minecraftAvatarUrl("head", "abc", 128)).toBe(
    "https://mc-heads.net/head/abc/128",
  );
  expect(minecraftAvatarUrl("body", undefined)).toBe(
    "https://mc-heads.net/body/MHF_Steve",
  );
  expect(minecraftAvatarUrl("head", "", 64)).toBe(
    "https://mc-heads.net/head/MHF_Steve/64",
  );
});
