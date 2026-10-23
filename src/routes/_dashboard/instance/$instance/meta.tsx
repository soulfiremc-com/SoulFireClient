import { create, type JsonValue } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import { createClient } from "@connectrpc/connect";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircleIcon, PlusIcon, TrashIcon } from "lucide-react";
import {
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { getAllIconTags } from "@/components/dynamic-icon.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { SettingTypeRenderer } from "@/components/settings-page.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import {
  Field,
  FieldError,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { SettingsNamespace } from "@/generated/soulfire/common_pb";
import {
  ComboSettingSchema,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import { InstanceService } from "@/generated/soulfire/instance_pb";
import i18n from "@/lib/i18n";
import { createInstanceNameSchema } from "@/lib/instance-name.ts";
import {
  metadataKeyPattern,
  metadataNamespacePattern,
  updateMetadataEntry,
} from "@/lib/metadata.ts";
import { jsonToValue, parseJsonValue, valueToJson } from "@/lib/protobuf.ts";
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

function InstanceNameField({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const schema = createInstanceNameSchema({
    required: t("instanceName.required"),
    max: t("instanceName.max"),
    singleLine: t("instanceName.singleLine"),
  });
  const form = useForm({
    defaultValues: { name: value },
    validators: { onSubmit: z.object({ name: schema }) },
    onSubmit: async ({ value: fields, formApi }) => {
      const name = schema.parse(fields.name);
      if (name === value) return;
      try {
        await onSave(name);
        formApi.reset({ name });
        toast.success(t("instanceName.saved"));
      } catch (error) {
        console.error(error);
        toast.error(t("instanceName.saveError"));
      }
    },
  });
  return (
    <form
      className="max-w-xl"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <form.Field name="name">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field
                  data-invalid={invalid}
                  data-disabled={disabled || isSubmitting}
                >
                  <FieldLabel htmlFor={id}>
                    {t("dialog.createInstance.form.friendlyName.label")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={id}
                      name="friendlyName"
                      value={field.state.value}
                      placeholder={t(
                        "dialog.createInstance.form.friendlyName.placeholder",
                      )}
                      aria-invalid={invalid}
                      disabled={disabled || isSubmitting}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                      onBlur={field.handleBlur}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="submit"
                        aria-label={t("instanceName.save")}
                        disabled={disabled || isSubmitting}
                      >
                        {isSubmitting && (
                          <LoaderCircleIcon
                            className="animate-spin"
                            data-icon="inline-start"
                          />
                        )}
                        {t("save")}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    {t("dialog.createInstance.form.friendlyName.description")}
                  </FieldDescription>
                  {invalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>
        )}
      </form.Subscribe>
    </form>
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
    mutationFn: async (value: string) => {
      await setInstanceFriendlyName(
        value,
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
        <InstanceNameField
          key={instanceInfo.id}
          value={instanceInfo.friendlyName}
          disabled={!canEditMeta}
          onSave={setFriendlyNameMutation.mutateAsync}
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
      {canEditMeta && (
        <InstanceMetadataEditor
          key={instanceInfo.id}
          instanceId={instanceInfo.id}
        />
      )}
    </div>
  );
}

function InstanceMetadataEditor({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);

  const [entries, setEntries] = useState<MetadataEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const activeView = useRef(false);
  const isMetadataReady = !isLoading && !loadError && entries !== null;

  const loadMetadata = useCallback(async () => {
    if (!activeView.current) return;
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    setIsLoading(true);
    setLoadError(false);
    try {
      if (transport === null) {
        setLoadError(true);
        return;
      }
      const result = await createClient(
        InstanceService,
        transport,
      ).getInstanceMetadata({ instanceId }, { signal: controller.signal });
      if (controller.signal.aborted || activeLoad.current !== controller)
        return;
      setEntries(convertProtoToEntries(result.metadata));
    } catch (e) {
      if (controller.signal.aborted || activeLoad.current !== controller)
        return;
      console.error("Failed to load instance metadata:", e);
      setLoadError(true);
    } finally {
      if (activeLoad.current === controller) {
        activeLoad.current = null;
        setIsLoading(false);
      }
    }
  }, [transport, instanceId]);

  useEffect(() => {
    activeView.current = true;
    void loadMetadata();
    return () => {
      activeView.current = false;
      activeLoad.current?.abort();
      activeLoad.current = null;
    };
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

      await updateMetadataEntry(entry, {
        setEntry: (replacement) =>
          instanceService.setInstanceMetadataEntry({
            instanceId,

            ...replacement,
            value: jsonToValue(replacement.value),
          }),
        deleteEntry: (original) =>
          instanceService.deleteInstanceMetadataEntry({
            instanceId,

            ...original,
          }),
      });
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
          .trim()
          .regex(
            metadataNamespacePattern,
            t("metadataValidation.invalidNamespace"),
          ),
        key: z
          .string()
          .trim()
          .regex(metadataKeyPattern, t("metadataValidation.invalidKey")),
        value: z
          .string()
          .min(1, t("instanceMetadata.valuePlaceholder"))
          .refine(
            (v) => parseJsonValue(v) !== undefined,
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
    onSubmit: async ({ value, formApi }) => {
      if (!isMetadataReady) return;
      const submitted = { ...value };
      const namespace = submitted.namespace.trim();
      const key = submitted.key.trim();
      const parsedValue = parseJsonValue(submitted.value);

      if (parsedValue === undefined) return;

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
          value: submitted.value,
        },
      ]);

      try {
        await addEntryMutation.mutateAsync({
          namespace,
          key,
          value: parsedValue,
        });
      } catch {
        // The mutation reports the error. Keep the current draft for a retry.
        return;
      }
      const current = formApi.state.values;
      if (
        current.namespace === submitted.namespace &&
        current.key === submitted.key &&
        current.value === submitted.value
      ) {
        formApi.reset();
      }
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
      if (!isMetadataReady) return;

      const entry = entries.find((e) => e.id === id);
      if (!entry) return;

      const updatedEntry = { ...entry, [field]: newFieldValue };

      const parsedValue = parseJsonValue(updatedEntry.value);
      if (
        parsedValue === undefined ||
        !metadataNamespacePattern.test(updatedEntry.namespace) ||
        !metadataKeyPattern.test(updatedEntry.key)
      )
        return;

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
    [entries, isDuplicate, isMetadataReady, t, updateEntryMutation],
  );

  const handleDeleteEntry = useCallback(
    (id: string, namespace: string, key: string) => {
      if (!isMetadataReady) return;
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? []);
      deleteEntryMutation.mutate({ namespace, key });
    },
    [deleteEntryMutation, isMetadataReady],
  );

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
                    disabled={!isMetadataReady || addEntryMutation.isPending}
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
        <CardContent
          className="flex max-h-64 flex-col gap-2 overflow-y-auto p-4 pt-0"
          aria-busy={isLoading}
        >
          {loadError && (
            <Alert variant="destructive">
              <AlertTitle>{t("instanceMetadata.loadError")}</AlertTitle>
              <AlertDescription>
                <div className="flex flex-col items-start gap-2">
                  <p>{t("instanceMetadata.loadErrorDescription")}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadMetadata()}
                  >
                    {t("instanceMetadata.retryLoad")}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {isLoading && entries === null && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {isMetadataReady && entries.length === 0 && (
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
              isUpdating={
                !isMetadataReady ||
                updateEntryMutation.isPending ||
                addEntryMutation.isPending
              }
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
  isUpdating,
}: {
  entry: MetadataEntry;
  onUpdate: (field: "namespace" | "key" | "value", value: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
  isUpdating: boolean;
}) {
  const { t } = useTranslation("instance");

  const [draft, setDraft] = useState(entry);
  const isValidNamespace = metadataNamespacePattern.test(
    draft.namespace.trim(),
  );
  const isValidKey = metadataKeyPattern.test(draft.key.trim());
  const isValidJson = parseJsonValue(draft.value) !== undefined;

  const saveField = (field: "namespace" | "key" | "value") => {
    const value = field === "value" ? draft[field] : draft[field].trim();
    const valid =
      field === "namespace"
        ? isValidNamespace
        : field === "key"
          ? isValidKey
          : isValidJson;
    if (valid && value !== entry[field]) {
      setDraft((current) => ({ ...current, [field]: value }));
      onUpdate(field, value);
    }
  };

  return (
    <FieldSet className="gap-3 rounded-lg border p-3">
      <FieldLegend className="sr-only">
        {t("instanceMetadata.entryLegend", {
          defaultValue: "Metadata entry",
        })}
      </FieldLegend>
      <FieldGroup className="gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
        <Field data-invalid={!isValidNamespace} className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-namespace`}>
            {t("instanceMetadata.namespaceLabel", {
              defaultValue: "Namespace",
            })}
          </FieldLabel>
          <Input
            id={`${entry.id}-namespace`}
            type="text"
            value={draft.namespace}
            onChange={(e) =>
              setDraft({ ...draft, namespace: e.currentTarget.value })
            }
            onBlur={() => saveField("namespace")}
            disabled={isUpdating || isDeleting}
            placeholder={t("instanceMetadata.namespacePlaceholder")}
            aria-invalid={!isValidNamespace}
          />
          {!isValidNamespace ? (
            <FieldError>{t("metadataValidation.invalidNamespace")}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={!isValidKey} className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-key`}>
            {t("instanceMetadata.keyLabel", {
              defaultValue: "Key",
            })}
          </FieldLabel>
          <Input
            id={`${entry.id}-key`}
            type="text"
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.currentTarget.value })}
            onBlur={() => saveField("key")}
            disabled={isUpdating || isDeleting}
            placeholder={t("instanceMetadata.keyPlaceholder")}
            aria-invalid={!isValidKey}
          />
          {!isValidKey ? (
            <FieldError>{t("metadataValidation.invalidKey")}</FieldError>
          ) : null}
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
            value={draft.value}
            onChange={(e) =>
              setDraft({ ...draft, value: e.currentTarget.value })
            }
            onBlur={() => saveField("value")}
            disabled={isUpdating || isDeleting}
            placeholder={t("instanceMetadata.valuePlaceholder")}
            className="font-mono"
            aria-invalid={!isValidJson}
          />
          {!isValidJson ? (
            <FieldError>{t("instanceMetadata.invalidJson")}</FieldError>
          ) : null}
        </Field>
        <div className="md:self-end">
          <Button
            variant="outline"
            onClick={onDelete}
            disabled={isDeleting || isUpdating}
          >
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
