import type { JsonValue } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import { createClient } from "@connectrpc/connect";
import type { SettingsNamespace } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import { InstanceService } from "@soulfiremc/sdk/generated/soulfire/instance_pb";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { PlusIcon, TrashIcon } from "lucide-react";
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
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
import { jsonToValue, valueToJson } from "@/lib/protobuf.ts";
import type { ProfileAccount } from "@/lib/types.ts";

interface MetadataEntry {
  id: string;
  namespace: string;
  key: string;
  value: string; // JSON string for editing
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

type AccountMetadataDialogProps = {
  account: ProfileAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AccountMetadataDialog({
  account,
  open,
  onOpenChange,
}: AccountMetadataDialogProps) {
  const { t } = useTranslation("instance");

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="sm:max-w-[700px]">
        <CredenzaHeader>
          <CredenzaTitle>
            {t("account.metadata.title", { name: account.lastKnownName })}
          </CredenzaTitle>
          <CredenzaDescription>
            {t("account.metadata.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <Suspense fallback={<DialogSkeleton />}>
            <DialogContentInner
              account={account}
              open={open}
              onOpenChange={onOpenChange}
            />
          </Suspense>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}

function DialogSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-64 w-full" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-20" />
      </div>
    </div>
  );
}

function DialogContentInner({
  account,
  open,
  onOpenChange,
}: {
  account: ProfileAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const _queryClient = useQueryClient();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const instanceId = instanceInfoQueryOptions.queryKey[1] as string;

  const [entries, setEntries] = useState<MetadataEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load metadata on mount
  const loadMetadata = useCallback(async () => {
    setIsLoading(true);
    if (transport === null) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    const instanceService = createClient(InstanceService, transport);
    try {
      const result = await instanceService.getAccountMetadata({
        instanceId,
        accountId: account.profileId,
      });
      setEntries(convertProtoToEntries(result.metadata));
    } catch (e) {
      console.error("Failed to load metadata:", e);
      setEntries([]);
    }
    setIsLoading(false);
  }, [transport, instanceId, account.profileId]);

  useEffect(() => {
    if (!open) return;
    void loadMetadata();
  }, [open, loadMetadata]);

  // Check for duplicate namespace+key
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

  // Add entry mutation
  const addEntryMutation = useMutation({
    mutationKey: ["account", "metadata", "add", account.profileId],
    scope: { id: `account-metadata-${account.profileId}` },
    mutationFn: async (entry: {
      namespace: string;
      key: string;
      value: JsonValue;
    }) => {
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);
      await instanceService.setAccountMetadataEntry({
        instanceId,
        accountId: account.profileId,
        namespace: entry.namespace,
        key: entry.key,
        value: jsonToValue(entry.value),
      });
    },
    onSuccess: () => {
      toast.success(t("account.metadata.addSuccess"));
      void loadMetadata();
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("account.metadata.addError"));
      void loadMetadata();
    },
  });

  // Update entry mutation
  const updateEntryMutation = useMutation({
    mutationKey: ["account", "metadata", "update", account.profileId],
    scope: { id: `account-metadata-${account.profileId}` },
    mutationFn: async (entry: {
      oldNamespace: string;
      oldKey: string;
      namespace: string;
      key: string;
      value: JsonValue;
    }) => {
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);

      // If namespace or key changed, delete old entry first
      if (
        entry.oldNamespace !== entry.namespace ||
        entry.oldKey !== entry.key
      ) {
        await instanceService.deleteAccountMetadataEntry({
          instanceId,
          accountId: account.profileId,
          namespace: entry.oldNamespace,
          key: entry.oldKey,
        });
      }

      // Set new entry
      await instanceService.setAccountMetadataEntry({
        instanceId,
        accountId: account.profileId,
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
      toast.error(t("account.metadata.updateError"));
      void loadMetadata();
    },
  });

  // Delete entry mutation
  const deleteEntryMutation = useMutation({
    mutationKey: ["account", "metadata", "delete", account.profileId],
    scope: { id: `account-metadata-${account.profileId}` },
    mutationFn: async (entry: { namespace: string; key: string }) => {
      if (transport === null) return;
      const instanceService = createClient(InstanceService, transport);
      await instanceService.deleteAccountMetadataEntry({
        instanceId,
        accountId: account.profileId,
        namespace: entry.namespace,
        key: entry.key,
      });
    },
    onSuccess: () => {
      toast.success(t("account.metadata.deleteSuccess"));
      void loadMetadata();
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("account.metadata.deleteError"));
      void loadMetadata();
    },
  });

  const addEntrySchema = useMemo(
    () =>
      z.object({
        namespace: z
          .string()
          .min(1, t("account.metadata.namespacePlaceholder")),
        key: z.string().min(1, t("account.metadata.keyPlaceholder")),
        value: z
          .string()
          .min(1, t("account.metadata.valuePlaceholder"))
          .refine(
            (v) => parseJsonValue(v) !== null,
            t("account.metadata.invalidJson"),
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
        toast.error(t("account.metadata.duplicateError"));
        return;
      }

      // Add to local state
      setEntries((prev) => [
        ...(prev ?? []),
        {
          id: generateId(),
          namespace,
          key,
          value: value.value,
        },
      ]);

      // Reset form
      addEntryForm.reset();

      // Send to server
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

      // Validate
      const parsedValue = parseJsonValue(updatedEntry.value);
      if (parsedValue === null) {
        // Invalid JSON, just update local state for editing
        setEntries(
          (prev) => prev?.map((e) => (e.id === id ? updatedEntry : e)) ?? [],
        );
        return;
      }

      // Check for duplicates (only if namespace or key changed)
      if (
        (field === "namespace" || field === "key") &&
        isDuplicate(updatedEntry.namespace, updatedEntry.key, id)
      ) {
        toast.error(t("account.metadata.duplicateError"));
        return;
      }

      // Update local state
      setEntries(
        (prev) => prev?.map((e) => (e.id === id ? updatedEntry : e)) ?? [],
      );

      // Send to server
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
      // Remove from local state
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? []);

      // Send to server
      deleteEntryMutation.mutate({ namespace, key });
    },
    [deleteEntryMutation],
  );

  if (isLoading) {
    return <DialogSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
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
                {t("account.metadata.addEntryLegend", {
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
                          {t("account.metadata.namespaceLabel", {
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
                            "account.metadata.namespacePlaceholder",
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
                          {t("account.metadata.keyLabel", {
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
                          placeholder={t("account.metadata.keyPlaceholder")}
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
                          {t("account.metadata.valueLabel", {
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
                          placeholder={t("account.metadata.valuePlaceholder")}
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
                    {t("account.metadata.addEntryButton", {
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
              {t("account.metadata.noEntries")}
            </p>
          )}
          {entries?.map((entry) => (
            <EntryRow
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
      <CredenzaFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common:close")}
        </Button>
      </CredenzaFooter>
    </div>
  );
}

function EntryRow({
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

  // Track original values for detecting changes
  const [originalNamespace] = useState(entry.namespace);
  const [originalKey] = useState(entry.key);
  const [originalValue] = useState(entry.value);

  // Validate JSON
  const isValidJson = useMemo(
    () => parseJsonValue(entry.value) !== null,
    [entry.value],
  );

  return (
    <FieldSet className="gap-3 rounded-lg border p-3">
      <FieldLegend className="sr-only">
        {t("account.metadata.entryLegend", {
          defaultValue: "Metadata entry",
        })}
      </FieldLegend>
      <FieldGroup className="gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
        <Field className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-namespace`}>
            {t("account.metadata.namespaceLabel", {
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
            placeholder={t("account.metadata.namespacePlaceholder")}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-key`}>
            {t("account.metadata.keyLabel", {
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
            placeholder={t("account.metadata.keyPlaceholder")}
          />
        </Field>
        <Field data-invalid={!isValidJson} className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-value`}>
            {t("account.metadata.valueLabel", {
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
            placeholder={t("account.metadata.valuePlaceholder")}
            className="font-mono"
            aria-invalid={!isValidJson}
          />
          {!isValidJson ? (
            <FieldError>{t("account.metadata.invalidJson")}</FieldError>
          ) : null}
        </Field>
        <div className="md:self-end">
          <Button variant="outline" onClick={onDelete} disabled={isDeleting}>
            <TrashIcon data-icon="inline-start" />
            {t("account.metadata.removeEntryButton", {
              defaultValue: "Remove",
            })}
          </Button>
        </div>
      </FieldGroup>
    </FieldSet>
  );
}
