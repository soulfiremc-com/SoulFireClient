import type { JsonValue } from "@bufbuild/protobuf";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { SettingsDefinition } from "@/generated/soulfire/common_pb";
import { useSettingSaveError } from "@/hooks/use-setting-save-error.ts";
import { isDemoReadOnlyError } from "@/lib/instance-mutations.ts";
import {
  settingMutationOptions,
  type SettingMutationTarget,
} from "@/lib/setting-mutation-options.ts";

/**
 * Picks the value a setting shows. Toggles and option pickers have no draft
 * state, so they show the chosen value while it saves instead of waiting for
 * the refetch. Without a server, the chosen value stays in this session.
 */
function getShownSettingValue(
  definition: SettingsDefinition | undefined,
  storedValue: JsonValue,
  mutation: { isPending: boolean; variables: JsonValue | undefined },
  unsaved: { value: JsonValue } | undefined,
): JsonValue {
  if (unsaved) return unsaved.value;
  const type = definition?.type.case;
  if (
    mutation.isPending &&
    mutation.variables !== undefined &&
    (type === "bool" || type === "combo")
  ) {
    return mutation.variables;
  }
  return storedValue;
}

/** Saves one setting value and reports what the field should show. */
export function useSettingValueMutation(options: {
  definition: SettingsDefinition | undefined;
  target: SettingMutationTarget;
  namespace: string;
  settingKey: string;
  storedValue: JsonValue;
  persisted: boolean;
  save: (value: JsonValue) => Promise<void>;
  invalidate: () => Promise<void>;
}) {
  const { definition, namespace, settingKey } = options;
  const type = definition?.type.case;
  const onSaveError = useSettingSaveError(
    definition,
    `${namespace}:${settingKey}`,
  );
  const [unsavedValue, setUnsavedValue] = useState<{ value: JsonValue }>();
  const mutation = useMutation({
    ...settingMutationOptions(options.target, namespace, settingKey, "value"),
    onMutate: (value: JsonValue) => {
      if (!options.persisted) setUnsavedValue({ value });
    },
    mutationFn: async (value: JsonValue) => {
      try {
        await options.save(value);
      } catch (error) {
        // The demo keeps the value for this session and already says that it
        // does not save, so a refused write is not reported as a failure.
        if (!options.persisted && isDemoReadOnlyError(error)) return;
        throw error;
      }
    },
    onError: onSaveError,
    onSettled: options.invalidate,
  });
  return {
    value: getShownSettingValue(
      definition,
      options.storedValue,
      mutation,
      unsavedValue,
    ),
    pending: mutation.isPending,
    status: mutation.status,
    // Toggles and option pickers save at once. Fields with drafts await the
    // save, so they can keep the draft and handle the failure themselves.
    changeCallback:
      type === "bool" || type === "combo" || type === undefined
        ? (value: JsonValue) => {
            mutation.mutate(value);
          }
        : mutation.mutateAsync,
    reset: (value: JsonValue) => {
      mutation.mutate(value);
    },
  };
}
