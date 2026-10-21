import type { JsonValue } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import type { PortDefinition } from "@/components/script-editor/nodes/types";
import { jsonToValue } from "./protobuf";

export class InvalidMockInput extends Error {
  constructor(public readonly portId: string) {
    super(portId);
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
          port.type === "string" ? text : JSON.parse(text);
        if (
          port.type === "number" &&
          (typeof value !== "number" || !Number.isFinite(value))
        )
          throw new Error();
        if (port.type === "boolean" && typeof value !== "boolean")
          throw new Error();
        if (
          ["list", "set", "collection"].includes(port.type) &&
          !Array.isArray(value)
        )
          throw new Error();
        if (
          port.type === "map" &&
          (value === null || typeof value !== "object" || Array.isArray(value))
        )
          throw new Error();
        if (port.type === "vector3") {
          if (
            value === null ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            ![value.x, value.y, value.z].every(
              (coordinate) =>
                typeof coordinate === "number" && Number.isFinite(coordinate),
            )
          )
            throw new Error();
        }
        return [[port.id, jsonToValue(value)]];
      } catch {
        throw new InvalidMockInput(port.id);
      }
    }),
  );
}
