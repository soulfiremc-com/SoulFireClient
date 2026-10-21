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
    assert.equal(schema.parse(name), name);
  }
  assert.equal(schema.safeParse("x".repeat(33)).success, false);
});

test("pasted outer whitespace is normalized before validating instance names", () => {
  assert.equal(schema.parse(" \u00a0Farm - A_1\ufeff "), "Farm - A_1");
  for (const name of ["", "   ", "\u00a0\ufeff"]) {
    assert.equal(schema.safeParse(name).success, false);
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
    assert.equal(schema.safeParse(`first${separator}second`).success, false);
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
    assert.equal(schema.parse(duplicate), duplicate);
    assert.equal(
      new TextDecoder().decode(new TextEncoder().encode(duplicate)),
      duplicate,
    );
  }
  assert.equal(getDuplicateInstanceName("x"), "x Copy");
});
