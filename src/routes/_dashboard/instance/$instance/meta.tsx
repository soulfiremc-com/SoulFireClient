import { create, type JsonValue } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import { createClient } from "@connectrpc/connect";
import type { SettingsNamespace } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  ComboSettingSchema,
  InstancePermission,
  StringSetting_InputType,
  StringSettingSchema,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import { InstanceService } from "@soulfiremc/sdk/generated/soulfire/instance_pb";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, TrashIcon } from "lucide-react";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { getAllIconTags } from "@/components/dynamic-icon.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { SettingTypeRenderer } from "@/components/settings-page.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import i18n from "@/lib/i18n";
import { jsonToValue, valueToJson } from "@/lib/protobuf.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import {
  formatIconName,
  hasInstancePermission,
  setInstanceFriendlyName,
  setInstanceIcon,
} from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/instance/$instance/meta")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.metaSettings"), {
      kind: "dynamic",
      name: "bolt",
    }),
  component: MetaSettings,
});

interface MetadataEntry {
  id: string;
  namespace: string;
  key: string;
  value: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(7);
}

function convertProtoToEntries(metadata: SettingsNamespace[]): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  for (const namespace of metadata) {
    for (const entry of namespace.entries) {
      entries.push({
        id: generateId(),
        namespace: namespace.namespace,
        key: entry.key,
        value: JSON.stringify(valueToJson(entry.value as Value)),
      });
    }
  }
  return entries;
}

function parseJsonValue(value: string): JsonValue | null {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}

function MetaSettingsSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        {/* Friendly Name field */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
        {/* Icon combo field */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      {/* Metadata editor */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
        <div className="rounded-lg border p-4">
          <div className="flex flex-row gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaSettings() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "settings",
          content: t("breadcrumbs.settings"),
        },
      ]}
      pageName={t("pageName.metaSettings")}
      loadingSkeleton={<MetaSettingsSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { instanceInfoQueryOptions, instanceListQueryOptions } =
    Route.useRouteContext();
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const setFriendlyNameMutation = useMutation({
    mutationKey: ["instance", "meta", "friendlyName", instanceInfo.id],
    scope: { id: `instance-meta-friendlyName-${instanceInfo.id}` },
    mutationFn: async (value: JsonValue) => {
      await setInstanceFriendlyName(
        value as string,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
        instanceListQueryOptions.queryKey,
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: instanceInfoQueryOptions.queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: instanceListQueryOptions.queryKey,
        }),
      ]);
    },
  });
  const setIconMutation = useMutation({
    mutationKey: ["instance", "meta", "icon", instanceInfo.id],
    scope: { id: `instance-meta-icon-${instanceInfo.id}` },
    mutationFn: async (value: JsonValue) => {
      await setInstanceIcon(
        value as string,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
        instanceListQueryOptions.queryKey,
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: instanceInfoQueryOptions.queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: instanceListQueryOptions.queryKey,
        }),
      ]);
    },
  });

  const canEditMeta = hasInstancePermission(
    instanceInfo,
    InstancePermission.UPDATE_INSTANCE_META,
  );

  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SettingTypeRenderer
          settingType={{
            case: "string",
            value: create(StringSettingSchema, {
              uiName: "Friendly Name",
              description:
                "The name of the instance that will be displayed in the UI.",
              def: "",
              inputType: StringSetting_InputType.TEXT,
              placeholder: "My Instance",
              minLength: 3,
              maxLength: 32,
              pattern: "[a-zA-Z0-9 ]+",
              disabled: !canEditMeta,
            }),
          }}
          value={instanceInfo.friendlyName}
          changeCallback={setFriendlyNameMutation.mutate}
        />
        <SettingTypeRenderer
          settingType={{
            case: "combo",
            value: create(ComboSettingSchema, {
              uiName: "Icon",
              description:
                "The icon of the instance that will be displayed in the UI.",
              options: getAllIconTags().map((iconName) => ({
                id: iconName[0],
                displayName: formatIconName(iconName[0]),
                iconId: iconName[0],
                keywords: iconName[1],
              })),
              def: "",
              disabled: !canEditMeta,
            }),
          }}
          value={instanceInfo.icon}
          changeCallback={setIconMutation.mutate}
        />
      </div>
      {canEditMeta && <InstanceMetadataEditor instanceId={instanceInfo.id} />}
    </div>
  );
}

function InstanceMetadataEditor({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);

  const [entries, setEntries] = useState<MetadataEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMetadata = useCallback(async () => {
    setIsLoading(true);
    if (transport === null) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    const instanceService = createClient(InstanceService, transport);
    try {
      const result = await instanceService.getInstanceMetadata({
        instanceId,
      });
      setEntries(convertProtoToEntries(result.metadata));
    } catch (e) {
      console.error("Failed to load instance metadata:", e);
      setEntries([]);
    }
    setIsLoading(false);
  }, [transport, instanceId]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  const isDuplicate = useCallback(
    (namespace: string, key: string, excludeId?: string) => {
      if (!entries) return false;
      return entries.some(
        (e) =>
          e.namespace === namespace &&
          e.key === key &&
          (excludeId === undefined || e.id !== excludeId),
      );
    },
    [entries],
  );

  const addEntryMutation = useMutation({
    mutationKey: ["instance", "metadata", "add", instanceId],
    scope: { id: `instance-metadata-${instanceId}` },
    mutationFn: async (entry: {
      namespace: string;
      key: string;
      value: JsonValue;
    }) => {
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);
      await instanceService.setInstanceMetadataEntry({
        instanceId,
        namespace: entry.namespace,
        key: entry.key,
        value: jsonToValue(entry.value),
      });
    },
    onSuccess: () => {
      toast.success(t("instanceMetadata.addSuccess"));
      void loadMetadata();
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("instanceMetadata.addError"));
      void loadMetadata();
    },
  });

  const updateEntryMutation = useMutation({
    mutationKey: ["instance", "metadata", "update", instanceId],
    scope: { id: `instance-metadata-${instanceId}` },
    mutationFn: async (entry: {
      oldNamespace: string;
      oldKey: string;
      namespace: string;
      key: string;
      value: JsonValue;
    }) => {
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);

      if (
        entry.oldNamespace !== entry.namespace ||
        entry.oldKey !== entry.key
      ) {
        await instanceService.deleteInstanceMetadataEntry({
          instanceId,
          namespace: entry.oldNamespace,
          key: entry.oldKey,
        });
      }

      await instanceService.setInstanceMetadataEntry({
        instanceId,
        namespace: entry.namespace,
        key: entry.key,
        value: jsonToValue(entry.value),
      });
    },
    onSuccess: () => {
      void loadMetadata();
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("instanceMetadata.updateError"));
      void loadMetadata();
    },
  });

  const deleteEntryMutation = useMutation({
    mutationKey: ["instance", "metadata", "delete", instanceId],
    scope: { id: `instance-metadata-${instanceId}` },
    mutationFn: async (entry: { namespace: string; key: string }) => {
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);
      await instanceService.deleteInstanceMetadataEntry({
        instanceId,
        namespace: entry.namespace,
        key: entry.key,
      });
    },
    onSuccess: () => {
      toast.success(t("instanceMetadata.deleteSuccess"));
      void loadMetadata();
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("instanceMetadata.deleteError"));
      void loadMetadata();
    },
  });

  const addEntrySchema = useMemo(
    () =>
      z.object({
        namespace: z
          .string()
          .min(1, t("instanceMetadata.namespacePlaceholder")),
        key: z.string().min(1, t("instanceMetadata.keyPlaceholder")),
        value: z
          .string()
          .min(1, t("instanceMetadata.valuePlaceholder"))
          .refine(
            (v) => parseJsonValue(v) !== null,
            t("instanceMetadata.invalidJson"),
          ),
      }),
    [t],
  );

  const addEntryForm = useForm({
    defaultValues: {
      namespace: "",
      key: "",
      value: "",
    },
    validators: {
      onSubmit: addEntrySchema,
    },
    onSubmit: async ({ value }) => {
      const namespace = value.namespace.trim();
      const key = value.key.trim();
      const parsedValue = parseJsonValue(value.value);

      if (parsedValue === null) return;

      if (isDuplicate(namespace, key)) {
        toast.error(t("instanceMetadata.duplicateError"));
        return;
      }

      setEntries((prev) => [
        ...(prev ?? []),
        {
          id: generateId(),
          namespace,
          key,
          value: value.value,
        },
      ]);

      addEntryForm.reset();
      addEntryMutation.mutate({ namespace, key, value: parsedValue });
    },
  });

  const handleUpdateEntry = useCallback(
    (
      id: string,
      oldNamespace: string,
      oldKey: string,
      field: "namespace" | "key" | "value",
      newFieldValue: string,
    ) => {
      if (!entries) return;

      const entry = entries.find((e) => e.id === id);
      if (!entry) return;

      const updatedEntry = { ...entry, [field]: newFieldValue };

      const parsedValue = parseJsonValue(updatedEntry.value);
      if (parsedValue === null) {
        setEntries(
          (prev) => prev?.map((e) => (e.id === id ? updatedEntry : e)) ?? [],
        );
        return;
      }

      if (
        (field === "namespace" || field === "key") &&
        isDuplicate(updatedEntry.namespace, updatedEntry.key, id)
      ) {
        toast.error(t("instanceMetadata.duplicateError"));
        return;
      }

      setEntries(
        (prev) => prev?.map((e) => (e.id === id ? updatedEntry : e)) ?? [],
      );

      updateEntryMutation.mutate({
        oldNamespace,
        oldKey,
        namespace: updatedEntry.namespace,
        key: updatedEntry.key,
        value: parsedValue,
      });
    },
    [entries, isDuplicate, t, updateEntryMutation],
  );

  const handleDeleteEntry = useCallback(
    (id: string, namespace: string, key: string) => {
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? []);
      deleteEntryMutation.mutate({ namespace, key });
    },
    [deleteEntryMutation],
  );

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">{t("instanceMetadata.title")}</h3>
      <p className="text-muted-foreground text-sm">
        {t("instanceMetadata.description")}
      </p>
      <Card>
        <CardHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addEntryForm.handleSubmit();
            }}
          >
            <FieldSet className="gap-3">
              <FieldLegend variant="label">
                {t("instanceMetadata.addEntryLegend", {
                  defaultValue: "Add metadata entry",
                })}
              </FieldLegend>
              <FieldGroup className="gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
                <addEntryForm.Field name="namespace">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;

                    return (
                      <Field data-invalid={isInvalid} className="gap-2">
                        <FieldLabel htmlFor={field.name}>
                          {t("instanceMetadata.namespaceLabel", {
                            defaultValue: "Namespace",
                          })}
                        </FieldLabel>
                        <Input
                          id={field.name}
                          type="text"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(e.currentTarget.value)
                          }
                          placeholder={t(
                            "instanceMetadata.namespacePlaceholder",
                          )}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid ? (
                          <FieldError errors={field.state.meta.errors} />
                        ) : null}
                      </Field>
                    );
                  }}
                </addEntryForm.Field>
                <addEntryForm.Field name="key">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;

                    return (
                      <Field data-invalid={isInvalid} className="gap-2">
                        <FieldLabel htmlFor={field.name}>
                          {t("instanceMetadata.keyLabel", {
                            defaultValue: "Key",
                          })}
                        </FieldLabel>
                        <Input
                          id={field.name}
                          type="text"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(e.currentTarget.value)
                          }
                          placeholder={t("instanceMetadata.keyPlaceholder")}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid ? (
                          <FieldError errors={field.state.meta.errors} />
                        ) : null}
                      </Field>
                    );
                  }}
                </addEntryForm.Field>
                <addEntryForm.Field name="value">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;

                    return (
                      <Field data-invalid={isInvalid} className="gap-2">
                        <FieldLabel htmlFor={field.name}>
                          {t("instanceMetadata.valueLabel", {
                            defaultValue: "Value",
                          })}
                        </FieldLabel>
                        <Input
                          id={field.name}
                          type="text"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(e.currentTarget.value)
                          }
                          placeholder={t("instanceMetadata.valuePlaceholder")}
                          className="font-mono"
                          aria-invalid={isInvalid}
                        />
                        {isInvalid ? (
                          <FieldError errors={field.state.meta.errors} />
                        ) : null}
                      </Field>
                    );
                  }}
                </addEntryForm.Field>
                <div className="md:self-end">
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={addEntryMutation.isPending}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {t("instanceMetadata.addEntryButton", {
                      defaultValue: "Add entry",
                    })}
                  </Button>
                </div>
              </FieldGroup>
            </FieldSet>
          </form>
        </CardHeader>
        <CardContent className="flex max-h-64 flex-col gap-2 overflow-y-auto p-4 pt-0">
          {entries && entries.length === 0 && (
            <p className="text-muted-foreground text-center text-sm py-4">
              {t("instanceMetadata.noEntries")}
            </p>
          )}
          {entries?.map((entry) => (
            <MetadataEntryRow
              key={entry.id}
              entry={entry}
              onUpdate={(field, value) =>
                handleUpdateEntry(
                  entry.id,
                  entry.namespace,
                  entry.key,
                  field,
                  value,
                )
              }
              onDelete={() =>
                handleDeleteEntry(entry.id, entry.namespace, entry.key)
              }
              isDeleting={deleteEntryMutation.isPending}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetadataEntryRow({
  entry,
  onUpdate,
  onDelete,
  isDeleting,
}: {
  entry: MetadataEntry;
  onUpdate: (field: "namespace" | "key" | "value", value: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation("instance");

  const [originalNamespace] = useState(entry.namespace);
  const [originalKey] = useState(entry.key);
  const [originalValue] = useState(entry.value);

  const isValidJson = useMemo(
    () => parseJsonValue(entry.value) !== null,
    [entry.value],
  );

  return (
    <FieldSet className="gap-3 rounded-lg border p-3">
      <FieldLegend className="sr-only">
        {t("instanceMetadata.entryLegend", {
          defaultValue: "Metadata entry",
        })}
      </FieldLegend>
      <FieldGroup className="gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
        <Field className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-namespace`}>
            {t("instanceMetadata.namespaceLabel", {
              defaultValue: "Namespace",
            })}
          </FieldLabel>
          <Input
            id={`${entry.id}-namespace`}
            type="text"
            value={entry.namespace}
            onChange={(e) => onUpdate("namespace", e.currentTarget.value)}
            onBlur={(e) => {
              if (e.currentTarget.value !== originalNamespace) {
                onUpdate("namespace", e.currentTarget.value);
              }
            }}
            placeholder={t("instanceMetadata.namespacePlaceholder")}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-key`}>
            {t("instanceMetadata.keyLabel", {
              defaultValue: "Key",
            })}
          </FieldLabel>
          <Input
            id={`${entry.id}-key`}
            type="text"
            value={entry.key}
            onChange={(e) => onUpdate("key", e.currentTarget.value)}
            onBlur={(e) => {
              if (e.currentTarget.value !== originalKey) {
                onUpdate("key", e.currentTarget.value);
              }
            }}
            placeholder={t("instanceMetadata.keyPlaceholder")}
          />
        </Field>
        <Field data-invalid={!isValidJson} className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-value`}>
            {t("instanceMetadata.valueLabel", {
              defaultValue: "Value",
            })}
          </FieldLabel>
          <Input
            id={`${entry.id}-value`}
            type="text"
            value={entry.value}
            onChange={(e) => onUpdate("value", e.currentTarget.value)}
            onBlur={(e) => {
              if (e.currentTarget.value !== originalValue) {
                onUpdate("value", e.currentTarget.value);
              }
            }}
            placeholder={t("instanceMetadata.valuePlaceholder")}
            className="font-mono"
            aria-invalid={!isValidJson}
          />
          {!isValidJson ? (
            <FieldError>{t("instanceMetadata.invalidJson")}</FieldError>
          ) : null}
        </Field>
        <div className="md:self-end">
          <Button variant="outline" onClick={onDelete} disabled={isDeleting}>
            <TrashIcon data-icon="inline-start" />
            {t("instanceMetadata.removeEntryButton", {
              defaultValue: "Remove",
            })}
          </Button>
        </div>
      </FieldGroup>
    </FieldSet>
  );
}
