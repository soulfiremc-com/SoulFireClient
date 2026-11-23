import { useForm } from "@tanstack/react-form";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Schema } from "effect";
import { PlusIcon, TrashIcon } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
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
import type { SettingsNamespace } from "@/generated/soulfire/common_pb";
import { toastDemoReadOnly, toastError } from "@/lib/error-toast.ts";
import { toFormSchema } from "@/lib/form-validation";
import {
  createMetadataEntryId,
  type MetadataEntry,
  type MetadataIdentifier,
  type MetadataValue,
  metadataEntriesFromProto,
  metadataKeyPattern,
  metadataNamespacePattern,
  updateMetadataEntry,
} from "@/lib/metadata.ts";
import { parseJsonValue } from "@/lib/protobuf.ts";

/** Server calls for one metadata store, such as a project or an account. */
export interface MetadataAdapter {
  /** Identifies the store. Writes to one store run in order. */
  mutationKey: readonly string[];
  load: (signal: AbortSignal) => Promise<SettingsNamespace[]>;
  set: (entry: MetadataValue) => Promise<unknown>;
  delete: (entry: MetadataIdentifier) => Promise<unknown>;
}

type ChangeKind = "add" | "update" | "delete";
type EntryField = "namespace" | "key" | "value";

const fieldGridClass =
  "gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start";

const skeletonSlots = ["first", "second"];

function createAddEntrySchema(messages: {
  namespace: string;
  key: string;
  valueRequired: string;
  invalidJson: string;
}) {
  return Schema.Struct({
    namespace: Schema.Trim.check(
      Schema.isPattern(metadataNamespacePattern, {
        message: messages.namespace,
      }),
    ),
    key: Schema.Trim.check(
      Schema.isPattern(metadataKeyPattern, { message: messages.key }),
    ),
    value: Schema.String.check(
      Schema.isMinLength(1, { message: messages.valueRequired }),
    ).check(
      Schema.makeFilter(
        (value) => parseJsonValue(value) !== undefined || messages.invalidJson,
      ),
    ),
  });
}

/**
 * Lists, adds, edits, and removes metadata entries. A null adapter means
 * demo mode: the list is empty and writes are not saved.
 */
export function MetadataEditor({
  adapter,
}: {
  adapter: MetadataAdapter | null;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const mutationKey = useMemo(
    () => [...(adapter?.mutationKey ?? ["metadata", "demo"])],
    [adapter],
  );
  const entriesKey = useMemo(() => [...mutationKey, "entries"], [mutationKey]);
  // oxlint-disable-next-line tanstack-query/exhaustive-deps -- The adapter's mutation key names the store it loads, so it identifies the adapter.
  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: async ({ signal, queryKey }) =>
      metadataEntriesFromProto(
        adapter === null ? [] : await adapter.load(signal),
        // Reuse row ids, so a reload does not remount the rows.
        queryClient.getQueryData<MetadataEntry[]>(queryKey),
      ),
  });
  const entries = entriesQuery.data;
  const setEntries = (
    update: (entries: MetadataEntry[]) => MetadataEntry[],
  ) => {
    // A load that started before this change would overwrite it.
    void queryClient.cancelQueries({ queryKey: entriesKey });
    queryClient.setQueryData<MetadataEntry[]>(entriesKey, (previous) =>
      update(previous ?? []),
    );
  };
  // Wait for earlier writes, such as from a dialog that was closed and
  // opened again, so nobody edits values from before them.
  const idle = useIsMutating({ mutationKey }) === 0;
  const isReady = idle && entries !== undefined && !entriesQuery.isError;

  const change = useMutation({
    mutationKey: [...mutationKey, "change"],
    scope: { id: mutationKey.join("-") },
    mutationFn: async ({
      run,
    }: {
      kind: ChangeKind;
      run: () => Promise<unknown>;
    }) => {
      await run();
    },
    onSuccess: (_data, { kind }) => {
      if (kind === "add") toast.success(t("metadataEditor.addSuccess"));
      if (kind === "delete") toast.success(t("metadataEditor.deleteSuccess"));
    },
    onError: (error, { kind }) => {
      toastError(t(`metadataEditor.${kind}Error`), error);
    },
    // Load the saved state, which also undoes changes the server rejected.
    onSettled: () => queryClient.invalidateQueries({ queryKey: entriesKey }),
  });

  const isDuplicate = (namespace: string, key: string, excludeId?: string) =>
    (entries ?? []).some(
      (entry) =>
        entry.namespace === namespace &&
        entry.key === key &&
        entry.id !== excludeId,
    );

  const addEntrySchema = useMemo(
    () =>
      createAddEntrySchema({
        namespace: t("metadataValidation.invalidNamespace"),
        key: t("metadataValidation.invalidKey"),
        valueRequired: t("metadataEditor.valueRequired"),
        invalidJson: t("metadataEditor.invalidJson"),
      }),
    [t],
  );

  const addEntryForm = useForm({
    defaultValues: { namespace: "", key: "", value: "" },
    validators: { onSubmit: toFormSchema(addEntrySchema) },
    onSubmit: async ({ value: submitted, formApi }) => {
      if (!isReady) return;
      const namespace = submitted.namespace.trim();
      const key = submitted.key.trim();
      const value = parseJsonValue(submitted.value);
      if (value === undefined) return;
      if (adapter === null) {
        toastDemoReadOnly();
        return;
      }
      if (isDuplicate(namespace, key)) {
        toast.error(t("metadataEditor.duplicateError"));
        return;
      }

      setEntries((previous) => [
        ...previous,
        { id: createMetadataEntryId(), namespace, key, value: submitted.value },
      ]);
      try {
        await change.mutateAsync({
          kind: "add",
          run: () => adapter.set({ namespace, key, value }),
        });
      } catch {
        // The mutation reports the error. Keep the draft for a retry.
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

  const updateEntry = (
    entry: MetadataEntry,
    field: EntryField,
    fieldValue: string,
  ) => {
    if (!isReady) return false;
    const updated = { ...entry, [field]: fieldValue };
    const value = parseJsonValue(updated.value);
    if (
      value === undefined ||
      !metadataNamespacePattern.test(updated.namespace) ||
      !metadataKeyPattern.test(updated.key)
    )
      return false;
    if (adapter === null) {
      toastDemoReadOnly();
      return false;
    }
    if (
      field !== "value" &&
      isDuplicate(updated.namespace, updated.key, entry.id)
    ) {
      toast.error(t("metadataEditor.duplicateError"));
      return false;
    }

    setEntries((previous) =>
      previous.map((current) => (current.id === entry.id ? updated : current)),
    );
    change.mutate({
      kind: "update",
      run: () =>
        updateMetadataEntry(
          {
            oldNamespace: entry.namespace,
            oldKey: entry.key,
            namespace: updated.namespace,
            key: updated.key,
            value,
          },
          { setEntry: adapter.set, deleteEntry: adapter.delete },
        ),
    });
    return true;
  };

  const deleteEntry = (entry: MetadataEntry) => {
    if (!isReady) return;
    if (adapter === null) {
      toastDemoReadOnly();
      return;
    }
    setEntries((previous) =>
      previous.filter((current) => current.id !== entry.id),
    );
    change.mutate({
      kind: "delete",
      run: () => adapter.delete({ namespace: entry.namespace, key: entry.key }),
    });
  };

  const addFormId = useId();

  return (
    <Card>
      <CardHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void addEntryForm.handleSubmit();
          }}
        >
          <FieldSet className="gap-3">
            <FieldLegend variant="label">
              {t("metadataEditor.addEntryLegend")}
            </FieldLegend>
            <FieldGroup className={fieldGridClass}>
              {(["namespace", "key", "value"] as const).map((name) => (
                <addEntryForm.Field key={name} name={name}>
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <MetadataField
                        id={`${addFormId}-${name}`}
                        field={name}
                        value={field.state.value}
                        invalid={invalid}
                        error={
                          invalid ? (
                            <FieldError
                              id={`${addFormId}-${name}-error`}
                              errors={field.state.meta.errors}
                            />
                          ) : null
                        }
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                      />
                    );
                  }}
                </addEntryForm.Field>
              ))}
              <div className="md:self-end">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!isReady || change.isPending}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("metadataEditor.addEntryButton")}
                </Button>
              </div>
            </FieldGroup>
          </FieldSet>
        </form>
      </CardHeader>
      <CardContent
        className="flex flex-col gap-2 p-4 pt-0 md:max-h-64 md:overflow-y-auto"
        aria-busy={entriesQuery.isFetching}
      >
        {entriesQuery.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t("metadataEditor.loadError")}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col items-start gap-2">
                <p>{t("metadataEditor.loadErrorDescription")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void entriesQuery.refetch()}
                >
                  {t("metadataEditor.retryLoad")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {entries === undefined &&
          !entriesQuery.isError &&
          skeletonSlots.map((slot) => (
            <Skeleton key={slot} className="h-20 w-full" />
          ))}
        {isReady && entries.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("metadataEditor.noEntries")}
          </p>
        )}
        {entries?.map((entry) => (
          <MetadataEntryRow
            key={entry.id}
            entry={entry}
            disabled={!isReady || change.isPending}
            onUpdate={(field, value) => updateEntry(entry, field, value)}
            onDelete={() => {
              deleteEntry(entry);
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function MetadataField({
  id,
  field,
  value,
  invalid,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  id: string;
  field: EntryField;
  value: string;
  invalid: boolean;
  error: ReactNode;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation("instance");
  return (
    <Field data-invalid={invalid} className="gap-2">
      <FieldLabel htmlFor={id}>{t(`metadataEditor.${field}Label`)}</FieldLabel>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={t(`metadataEditor.${field}Placeholder`)}
        className={field === "value" ? "font-mono" : undefined}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
      />
      {error}
    </Field>
  );
}

function MetadataEntryRow({
  entry,
  disabled,
  onUpdate,
  onDelete,
}: {
  entry: MetadataEntry;
  disabled: boolean;
  onUpdate: (field: EntryField, value: string) => boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation("instance");
  const [draft, setDraft] = useState(entry);
  const [shownEntry, setShownEntry] = useState(entry);
  // Show new server values after a reload.
  if (
    shownEntry.namespace !== entry.namespace ||
    shownEntry.key !== entry.key ||
    shownEntry.value !== entry.value
  ) {
    setShownEntry(entry);
    setDraft(entry);
  }

  const valid: Record<EntryField, boolean> = {
    namespace: metadataNamespacePattern.test(draft.namespace.trim()),
    key: metadataKeyPattern.test(draft.key.trim()),
    value: parseJsonValue(draft.value) !== undefined,
  };
  const errors: Record<EntryField, string> = {
    namespace: t("metadataValidation.invalidNamespace"),
    key: t("metadataValidation.invalidKey"),
    value: t("metadataEditor.invalidJson"),
  };

  const saveField = (field: EntryField) => {
    const value = field === "value" ? draft[field] : draft[field].trim();
    if (!valid[field] || value === entry[field]) return;
    const accepted = onUpdate(field, value);
    setDraft((current) => ({
      ...current,
      [field]: accepted ? value : entry[field],
    }));
  };

  return (
    <FieldSet className="gap-3 rounded-lg border p-3">
      <FieldLegend className="sr-only">
        {t("metadataEditor.entryLegend")}
      </FieldLegend>
      <FieldGroup className={fieldGridClass}>
        {(["namespace", "key", "value"] as const).map((field) => (
          <MetadataField
            key={field}
            id={`${entry.id}-${field}`}
            field={field}
            value={draft[field]}
            invalid={!valid[field]}
            error={
              valid[field] ? null : (
                <FieldError id={`${entry.id}-${field}-error`}>
                  {errors[field]}
                </FieldError>
              )
            }
            disabled={disabled}
            onChange={(value) => {
              setDraft((current) => ({ ...current, [field]: value }));
            }}
            onBlur={() => {
              saveField(field);
            }}
          />
        ))}
        <div className="md:self-end">
          <Button variant="outline" onClick={onDelete} disabled={disabled}>
            <TrashIcon data-icon="inline-start" />
            {t("metadataEditor.removeEntryButton")}
          </Button>
        </div>
      </FieldGroup>
    </FieldSet>
  );
}
