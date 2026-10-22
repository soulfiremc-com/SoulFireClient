import assert from "node:assert/strict";
import { test } from "node:test";
import { fromBinary, toBinary } from "@bufbuild/protobuf";
import type { Node } from "@xyflow/react";
import type { PortType as LocalPortType } from "@/components/script-editor/nodes/types";
import { PortType, ScriptNodeSchema } from "@/generated/soulfire/script_pb";
import { nodesToProto, protoToNodes } from "./script-service";

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
