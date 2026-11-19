import type { JsonValue } from "@bufbuild/protobuf";
import type { SettingsDefinition } from "@/generated/soulfire/common_pb";

/** Returns the value a reset writes, or undefined when the type has no single default. */
export function getSettingDefaultValue(
  definition: Pick<SettingsDefinition, "type">,
): JsonValue | undefined {
  const type = definition.type;
  switch (type.case) {
    case "string":
    case "int":
    case "double":
    case "bool":
    case "combo": {
      return type.value.def;
    }
    case "stringList": {
      return [...type.value.def];
    }
    case undefined:
    case "minMax":
    default: {
      return undefined;
    }
  }
}

/** Compares setting values, treating lists with the same items as equal. */
export function isSameSettingValue(a: JsonValue, b: JsonValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}
