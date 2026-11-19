import { TaggedError as TaggedFailure } from "effect/Schema";
import type { JsonValue } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import { Schema } from "effect";
import type { PortDefinition } from "@/components/script-editor/nodes/types";
import { jsonToValue } from "./protobuf";

const decodeJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.MutableJson),
);

export class InvalidMockInput extends TaggedFailure<
  InvalidMockInput,
  { readonly brand: unique symbol }
>()("InvalidMockInput", { portId: Schema.String, message: Schema.String }) {
  static new(portId: string) {
    return InvalidMockInput.make({ portId, message: portId });
  }
}

export function parseMockInputs(
  ports: Pick<PortDefinition, "id" | "type">[],
  inputs: Record<string, string>,
): Record<string, Value> {
  return Object.fromEntries(
    ports.flatMap((port) => {
      const text = inputs[port.id] ?? "";
      if (text.trim() === "") return [];
      try {
        const value: JsonValue =
          port.type === "string" ? text : decodeJson(text);
        if (
          port.type === "number" &&
          (typeof value !== "number" || !Number.isFinite(value))
        )
          throw new Error("Expected a finite number");
        if (port.type === "boolean" && typeof value !== "boolean")
          throw new Error("Expected a boolean");
        if (
          ["list", "set", "collection"].includes(port.type) &&
          !Array.isArray(value)
        )
          throw new Error("Expected an array");
        if (
          port.type === "map" &&
          (value === null || typeof value !== "object" || Array.isArray(value))
        )
          throw new Error("Expected an object");
        if (
          port.type === "vector3" &&
          (value === null ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            ![value["x"], value["y"], value["z"]].every(
              (coordinate) =>
                typeof coordinate === "number" && Number.isFinite(coordinate),
            ))
        )
          throw new Error(
            "Expected a vector with finite x, y, and z coordinates",
          );
        return [[port.id, jsonToValue(value)]];
      } catch {
        throw InvalidMockInput.new(port.id);
      }
    }),
  );
}
