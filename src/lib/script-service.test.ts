import assert from "node:assert/strict";
import { test } from "node:test";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { Node } from "@xyflow/react";
import type { PortType as LocalPortType } from "@/components/script-editor/nodes/types";
import {
  PortType,
  ScriptInfoSchema,
  ScriptNodeSchema,
} from "@/generated/soulfire/script_pb";
import { filterScripts, nodesToProto, protoToNodes } from "./script-service";

test("typed reroutes retain their editor type through protobuf binary round trips", () => {
  const types: Array<[LocalPortType, PortType]> = [
    ["any", PortType.ANY],
    ["number", PortType.NUMBER],
    ["string", PortType.STRING],
    ["boolean", PortType.BOOLEAN],
    ["vector3", PortType.VECTOR3],
    ["bot", PortType.BOT],
    ["list", PortType.LIST],
    ["execution", PortType.EXEC],
    ["block", PortType.BLOCK],
    ["entity", PortType.ENTITY],
    ["item", PortType.ITEM],
    ["map", PortType.MAP],
    ["set", PortType.SET],
    ["collection", PortType.COLLECTION],
  ];
  for (const [local, wire] of types) {
    const node: Node = {
      id: crypto.randomUUID(),
      type: "layout.reroute",
      position: { x: 12, y: 34 },
      data: { resolvedType: local },
    };
    const proto = nodesToProto([node])[0];
    assert.equal(proto.resolvedType, wire);
    const decoded = fromBinary(
      ScriptNodeSchema,
      toBinary(ScriptNodeSchema, proto),
    );
    assert.equal(decoded.resolvedType, wire);
    assert.deepEqual(protoToNodes([decoded]), [node]);
  }
});

test("unresolved reroutes stay unset rather than acquiring an explicit any type", () => {
  const node: Node = {
    id: crypto.randomUUID(),
    type: "layout.reroute",
    position: { x: 0, y: 0 },
    data: {},
  };
  const proto = nodesToProto([node])[0];
  assert.equal(proto.resolvedType, undefined);
  const decoded = fromBinary(
    ScriptNodeSchema,
    toBinary(ScriptNodeSchema, proto),
  );
  assert.equal(decoded.resolvedType, undefined);
  assert.deepEqual(protoToNodes([decoded]), [node]);
});

test("ordinary nodes stay sized by content despite measurements or older saved sizes", () => {
  for (const type of [
    "trigger.on_chat",
    "action.print",
    "constant.string",
    "layout.reroute",
    "layout.group",
  ]) {
    const node: Node = {
      id: crypto.randomUUID(),
      type,
      position: { x: 12, y: 34 },
      data: {},
      width: 200,
      height: 150,
      measured: { width: 200, height: 55 },
      style: { width: 200, height: 150 },
    };
    const proto = nodesToProto([node])[0];
    assert.equal(proto.width, undefined);
    assert.equal(proto.height, undefined);
    const stored = fromBinary(
      ScriptNodeSchema,
      toBinary(ScriptNodeSchema, { ...proto, width: 200, height: 150 }),
    );
    const restored = protoToNodes([stored])[0];
    assert.equal(restored.width, undefined);
    assert.equal(restored.height, undefined);
    assert.equal(restored.style, undefined);
  }
});

test("frames and notes retain explicit dimensions without persisting measurements", () => {
  for (const type of ["layout.frame", "layout.note"]) {
    const base: Node = {
      id: crypto.randomUUID(),
      type,
      position: { x: 0, y: 0 },
      data: {},
      measured: { width: 400, height: 300 },
    };
    const measured = nodesToProto([base])[0];
    assert.equal(measured.width, undefined);
    assert.equal(measured.height, undefined);
    for (const node of [
      { ...base, width: 348, height: 192 },
      { ...base, style: { width: 348, height: 192 } },
    ]) {
      const wire = fromBinary(
        ScriptNodeSchema,
        toBinary(ScriptNodeSchema, nodesToProto([node])[0]),
      );
      const restored = protoToNodes([wire])[0];
      assert.equal(restored.width, 348);
      assert.equal(restored.height, 192);
    }
  }
});

const script = (name: string, paused: boolean, seconds: number) =>
  create(ScriptInfoSchema, {
    id: name,
    name,
    description: `${name} description`,
    paused,
    updatedAt: timestampFromMs(seconds * 1000),
  });

test("script list filters by text and state, then sorts", () => {
  const scripts = [
    script("Greeter", false, 10),
    script("Auto eat", true, 30),
    script("Guard", false, 20),
  ];
  const names = (list: typeof scripts) => list.map(({ name }) => name);

  assert.deepEqual(names(filterScripts(scripts, "", "all", "edited")), [
    "Auto eat",
    "Guard",
    "Greeter",
  ]);
  assert.deepEqual(names(filterScripts(scripts, "", "all", "name")), [
    "Auto eat",
    "Greeter",
    "Guard",
  ]);
  assert.deepEqual(names(filterScripts(scripts, "", "on", "name")), [
    "Greeter",
    "Guard",
  ]);
  assert.deepEqual(names(filterScripts(scripts, "", "off", "name")), [
    "Auto eat",
  ]);
  assert.deepEqual(names(filterScripts(scripts, " GU ", "all", "name")), [
    "Guard",
  ]);
  // The search also matches descriptions.
  assert.deepEqual(names(filterScripts(scripts, "eat desc", "all", "name")), [
    "Auto eat",
  ]);
  assert.deepEqual(filterScripts(scripts, "missing", "all", "name"), []);
});
