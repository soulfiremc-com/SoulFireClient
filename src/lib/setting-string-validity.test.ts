import assert from "node:assert/strict";
import { test } from "node:test";
import { getStringSettingError } from "./setting-string-validity";

const text = { type: "other", minLength: 0, pattern: ".*" } as const;

test("accepts empty text even when a minimum length or pattern is set", () => {
  assert.equal(
    getStringSettingError("", { type: "email", minLength: 3, pattern: "a+" }),
    undefined,
  );
});

test("rejects a partial email address and accepts a complete one", () => {
  const email = { ...text, type: "email" } as const;
  assert.equal(getStringSettingError("user@", email), "email");
  assert.equal(getStringSettingError("user@example.com", email), undefined);
});

test("rejects text that is not an absolute URL", () => {
  const url = { ...text, type: "url" } as const;
  assert.equal(getStringSettingError("https:", url), "url");
  assert.equal(getStringSettingError("example.com", url), "url");
  assert.equal(
    getStringSettingError("https://api.example.com/v1", url),
    undefined,
  );
});

test("rejects text shorter than the minimum length", () => {
  const constraints = { ...text, minLength: 4 };
  assert.equal(getStringSettingError("abc", constraints), "minLength");
  assert.equal(getStringSettingError("abcd", constraints), undefined);
});

test("matches the whole value against the pattern", () => {
  const constraints = { ...text, pattern: "[a-z]+" };
  assert.equal(getStringSettingError("abc1", constraints), "pattern");
  assert.equal(getStringSettingError("abc", constraints), undefined);
  // An alternation must not let a prefix match pass.
  assert.equal(
    getStringSettingError("ab", { ...text, pattern: "a|ab" }),
    undefined,
  );
  assert.equal(
    getStringSettingError("abc", { ...text, pattern: "a|ab" }),
    "pattern",
  );
});

test("ignores a pattern that does not compile, like browsers do", () => {
  assert.equal(
    getStringSettingError("x", { ...text, pattern: "(" }),
    undefined,
  );
});
