import type { JsonValue } from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import { createClient } from "@connectrpc/connect";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { PlusIcon, TrashIcon } from "lucide-react";
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
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
import type { SettingsNamespace } from "@/generated/soulfire/common_pb";
import { InstanceService } from "@/generated/soulfire/instance_pb";
import {
  metadataKeyPattern,
  metadataNamespacePattern,
  updateMetadataEntry,
} from "@/lib/metadata.ts";
import { jsonToValue, parseJsonValue, valueToJson } from "@/lib/protobuf.ts";
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
  const instanceId = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions.queryKey[1] as string,
  });

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
              key={`${instanceId}:${account.profileId}`}
              instanceId={instanceId}
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
  instanceId,
  account,
  open,
  onOpenChange,
}: {
  instanceId: string;
  account: ProfileAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
        setEntries([]);
        return;
      }
      const result = await createClient(
        InstanceService,
        transport,
      ).getAccountMetadata(
        { instanceId, accountId: account.profileId },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || activeLoad.current !== controller)
        return;
      setEntries(convertProtoToEntries(result.metadata));
    } catch (error) {
      if (controller.signal.aborted || activeLoad.current !== controller)
        return;
      console.error("Failed to load metadata:", error);
      setLoadError(true);
    } finally {
      if (activeLoad.current === controller) {
        activeLoad.current = null;
        setIsLoading(false);
      }
    }
  }, [transport, instanceId, account.profileId]);

  useEffect(() => {
    activeView.current = open;
    if (open) void loadMetadata();
    return () => {
      activeView.current = false;
      activeLoad.current?.abort();
      activeLoad.current = null;
    };
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

      await updateMetadataEntry(entry, {
        setEntry: (replacement) =>
          instanceService.setAccountMetadataEntry({
            instanceId,
            accountId: account.profileId,
            ...replacement,
            value: jsonToValue(replacement.value),
          }),
        deleteEntry: (original) =>
          instanceService.deleteAccountMetadataEntry({
            instanceId,
            accountId: account.profileId,
            ...original,
          }),
      });
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
          .min(1, t("account.metadata.valuePlaceholder"))
          .refine(
            (v) => parseJsonValue(v) !== undefined,
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
      if (!isMetadataReady) return;
      const namespace = value.namespace.trim();
      const key = value.key.trim();
      const parsedValue = parseJsonValue(value.value);

      if (parsedValue === undefined) return;

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
      if (!isMetadataReady || !entries) return false;

      const entry = entries.find((e) => e.id === id);
      if (!entry) return false;

      const updatedEntry = { ...entry, [field]: newFieldValue };

      // Validate
      const parsedValue = parseJsonValue(updatedEntry.value);
      if (
        parsedValue === undefined ||
        !metadataNamespacePattern.test(updatedEntry.namespace) ||
        !metadataKeyPattern.test(updatedEntry.key)
      )
        return false;

      // Check for duplicates (only if namespace or key changed)
      if (
        (field === "namespace" || field === "key") &&
        isDuplicate(updatedEntry.namespace, updatedEntry.key, id)
      ) {
        toast.error(t("account.metadata.duplicateError"));
        return false;
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
      return true;
    },
    [entries, isMetadataReady, isDuplicate, t, updateEntryMutation],
  );

  const handleDeleteEntry = useCallback(
    (id: string, namespace: string, key: string) => {
      if (!isMetadataReady) return;
      // Remove from local state
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? []);

      // Send to server
      deleteEntryMutation.mutate({ namespace, key });
    },
    [isMetadataReady, deleteEntryMutation],
  );

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
                    disabled={!isMetadataReady || addEntryMutation.isPending}
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
        <CardContent
          className="flex max-h-64 flex-col gap-2 overflow-y-auto p-4 pt-0"
          aria-busy={isLoading}
        >
          {loadError && (
            <Alert variant="destructive">
              <AlertTitle>{t("account.metadata.loadError")}</AlertTitle>
              <AlertDescription>
                <div className="flex flex-col items-start gap-2">
                  <p>{t("account.metadata.loadErrorDescription")}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadMetadata()}
                  >
                    {t("account.metadata.retryLoad")}
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
              isUpdating={
                !isMetadataReady ||
                updateEntryMutation.isPending ||
                addEntryMutation.isPending
              }
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
  isUpdating,
}: {
  entry: MetadataEntry;
  onUpdate: (field: "namespace" | "key" | "value", value: string) => boolean;
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
      const accepted = onUpdate(field, value);
      setDraft((current) => ({
        ...current,
        [field]: accepted ? value : entry[field],
      }));
    }
  };

  return (
    <FieldSet className="gap-3 rounded-lg border p-3">
      <FieldLegend className="sr-only">
        {t("account.metadata.entryLegend", {
          defaultValue: "Metadata entry",
        })}
      </FieldLegend>
      <FieldGroup className="gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
        <Field data-invalid={!isValidNamespace} className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-namespace`}>
            {t("account.metadata.namespaceLabel", {
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
            placeholder={t("account.metadata.namespacePlaceholder")}
            aria-invalid={!isValidNamespace}
          />
          {!isValidNamespace ? (
            <FieldError>{t("metadataValidation.invalidNamespace")}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={!isValidKey} className="gap-2">
          <FieldLabel htmlFor={`${entry.id}-key`}>
            {t("account.metadata.keyLabel", {
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
            placeholder={t("account.metadata.keyPlaceholder")}
            aria-invalid={!isValidKey}
          />
          {!isValidKey ? (
            <FieldError>{t("metadataValidation.invalidKey")}</FieldError>
          ) : null}
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
            value={draft.value}
            onChange={(e) =>
              setDraft({ ...draft, value: e.currentTarget.value })
            }
            onBlur={() => saveField("value")}
            disabled={isUpdating || isDeleting}
            placeholder={t("account.metadata.valuePlaceholder")}
            className="font-mono"
            aria-invalid={!isValidJson}
          />
          {!isValidJson ? (
            <FieldError>{t("account.metadata.invalidJson")}</FieldError>
          ) : null}
        </Field>
        <div className="md:self-end">
          <Button
            variant="outline"
            onClick={onDelete}
            disabled={isDeleting || isUpdating}
          >
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
