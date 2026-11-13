import { Schema, Result } from "effect";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createInstanceNameSchema,
  getDuplicateInstanceName,
} from "./instance-name.ts";

const schema = createInstanceNameSchema({
  required: "required",
  max: "max",
  singleLine: "singleLine",
});

test("instance names support the database boundaries, Unicode and punctuation", () => {
  for (const name of ["x", "x".repeat(32), "Farm - A_1", "日本語 Farm"]) {
    assert.equal(Schema.decodeUnknownSync(schema)(name), name);
  }
  assert.equal(
    Result.isSuccess(Schema.decodeUnknownResult(schema)("x".repeat(33))),
    false,
  );
});

test("pasted outer whitespace is normalized before validating instance names", () => {
  assert.equal(
    Schema.decodeUnknownSync(schema)(" \u00a0Farm - A_1\ufeff "),
    "Farm - A_1",
  );
  for (const name of ["", "   ", "\u00a0\ufeff"]) {
    assert.equal(
      Result.isSuccess(Schema.decodeUnknownResult(schema)(name)),
      false,
    );
  }
});

test("control characters and line breaks cannot be embedded in a name", () => {
  for (const separator of [
    "\n",
    "\r",
    "\t",
    "\u0000",
    "\u0085",
    "\u2028",
    "\u2029",
  ]) {
    assert.equal(
      Result.isSuccess(
        Schema.decodeUnknownResult(schema)(`first${separator}second`),
      ),
      false,
    );
  }
});

test("duplicate names stay within the limit without splitting Unicode characters", () => {
  for (const name of [
    "x",
    "x".repeat(32),
    "x".repeat(26) + "😀suffix",
    "😀".repeat(20),
    "日本語 Farm",
    "   ",
  ]) {
    const duplicate = getDuplicateInstanceName(name);
    assert.equal(Schema.decodeUnknownSync(schema)(duplicate), duplicate);
    assert.equal(
      new TextDecoder().decode(new TextEncoder().encode(duplicate)),
      duplicate,
    );
  }
  assert.equal(getDuplicateInstanceName("x"), "x Copy");
});
