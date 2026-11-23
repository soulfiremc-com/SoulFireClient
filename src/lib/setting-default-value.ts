import type { JsonValue } from "@bufbuild/protobuf";
import type { SettingsDefinition } from "@/generated/soulfire/common_pb";

/** Returns the value a reset writes, or undefined when the type has no default. */
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
    case "minMax": {
      const { minEntry, maxEntry } = type.value;
      return minEntry && maxEntry
        ? { min: minEntry.def, max: maxEntry.def }
        : undefined;
    }
    case undefined:
    default: {
      return undefined;
    }
  }
}

/** Compares setting values. Lists and ranges with the same items are equal. */
export function isSameSettingValue(a: JsonValue, b: JsonValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  if (isRange(a) && isRange(b)) {
    return a["min"] === b["min"] && a["max"] === b["max"];
  }
  return a === b;
}

function isRange(value: JsonValue): value is Record<string, JsonValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "min" in value &&
    "max" in value
  );
}
