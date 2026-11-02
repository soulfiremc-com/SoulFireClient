import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listType,
  mapType,
  resolveTypeDescriptor,
  simpleType,
  typeVar,
  unifyTypes,
  type TypeDescriptor,
} from "./types";

test("connecting unresolved generic ports does not create a self binding", () => {
  const bindings = new Map<string, TypeDescriptor>();
  assert.equal(unifyTypes(typeVar("T"), typeVar("T"), bindings), true);
  assert.equal(bindings.size, 0);
  assert.equal(
    unifyTypes(listType(typeVar("T")), listType(typeVar("T")), bindings),
    true,
  );
  assert.deepEqual(resolveTypeDescriptor(typeVar("T"), bindings), typeVar("T"));
});

test("generic bindings reject direct and indirect recursive types", () => {
  const bindings = new Map<string, TypeDescriptor>();
  assert.equal(
    unifyTypes(typeVar("T"), listType(typeVar("T")), bindings),
    false,
  );
  assert.equal(
    unifyTypes(
      mapType(simpleType("string"), typeVar("T")),
      typeVar("T"),
      bindings,
    ),
    false,
  );
  assert.equal(bindings.size, 0);
  assert.equal(unifyTypes(typeVar("T"), typeVar("U"), bindings), true);
  assert.equal(
    unifyTypes(typeVar("U"), listType(typeVar("T")), bindings),
    false,
  );
  assert.deepEqual(resolveTypeDescriptor(typeVar("T"), bindings), typeVar("U"));
});

test("resolving previously cyclic bindings terminates with an unresolved variable", () => {
  for (const bindings of [
    new Map([["T", typeVar("T")]]),
    new Map([
      ["T", typeVar("U")],
      ["U", typeVar("T")],
    ]),
    new Map([["T", listType(typeVar("T"))]]),
  ]) {
    const resolved = resolveTypeDescriptor(typeVar("T"), bindings);
    assert.deepEqual(
      resolved,
      bindings.get("T")?.kind === "parameterized"
        ? listType(typeVar("T"))
        : typeVar("T"),
    );
  }
});

test("nested types resolve repeated variables and reject conflicting concrete types", () => {
  const bindings = new Map<string, TypeDescriptor>();
  assert.equal(
    unifyTypes(
      mapType(typeVar("T"), listType(typeVar("T"))),
      mapType(simpleType("string"), listType(simpleType("string"))),
      bindings,
    ),
    true,
  );
  assert.deepEqual(
    resolveTypeDescriptor(mapType(typeVar("T"), typeVar("T")), bindings),
    mapType(simpleType("string"), simpleType("string")),
  );
  assert.equal(unifyTypes(typeVar("T"), simpleType("bot"), bindings), false);
});
