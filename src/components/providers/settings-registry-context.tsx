import type {
  SettingsDefinition,
  SettingsEntryIdentifier,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import { createContext, useContext, useMemo } from "react";

export type SettingsRegistry = {
  definitions: SettingsDefinition[];
  getDefinition: (
    id: SettingsEntryIdentifier | undefined,
  ) => SettingsDefinition | undefined;
  getDefinitionByKey: (
    namespace: string,
    key: string,
  ) => SettingsDefinition | undefined;
};

export const SettingsRegistryContext = createContext<SettingsRegistry | null>(
  null,
);

export function useSettingsRegistry(): SettingsRegistry {
  const context = useContext(SettingsRegistryContext);
  if (!context) {
    throw new Error(
      "useSettingsRegistry must be used within a SettingsRegistryProvider",
    );
  }
  return context;
}

export function useSettingsDefinition(
  id: SettingsEntryIdentifier | undefined,
): SettingsDefinition | undefined {
  const registry = useSettingsRegistry();
  return useMemo(() => registry.getDefinition(id), [registry, id]);
}

export function useSettingsDefinitionByKey(
  namespace: string,
  key: string,
): SettingsDefinition | undefined {
  const registry = useSettingsRegistry();
  return useMemo(
    () => registry.getDefinitionByKey(namespace, key),
    [registry, namespace, key],
  );
}

export function createSettingsRegistry(
  definitions: SettingsDefinition[],
): SettingsRegistry {
  // Create a map for O(1) lookup
  const definitionMap = new Map<string, SettingsDefinition>();
  for (const def of definitions) {
    if (def.id) {
      const key = `${def.id.namespace}:${def.id.key}`;
      definitionMap.set(key, def);
    }
  }

  return {
    definitions,
    getDefinition: (id) => {
      if (!id) return undefined;
      return definitionMap.get(`${id.namespace}:${id.key}`);
    },
    getDefinitionByKey: (namespace, key) => {
      return definitionMap.get(`${namespace}:${key}`);
    },
  };
}
