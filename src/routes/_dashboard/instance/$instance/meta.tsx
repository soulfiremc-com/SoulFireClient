import { createRpcClient } from "@/lib/rpc";
import { toFormSchema } from "@/lib/form-validation";
import { Effect, Schema } from "effect";

import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon, ChevronsUpDownIcon, LoaderCircleIcon } from "lucide-react";
import { use, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { getAllIconTags } from "@/components/icon-tags.ts";
import {
  type MetadataAdapter,
  MetadataEditor,
} from "@/components/metadata-editor.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import {
  Field,
  FieldError,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { InstanceService } from "@/generated/soulfire/instance_pb";
import i18n from "@/lib/i18n";
import { searchIcons } from "@/lib/icon-search.ts";
import { createInstanceNameSchema } from "@/lib/instance-name.ts";
import { toastError } from "@/lib/error-toast.ts";
import { isDemoReadOnlyError } from "@/lib/instance-mutations.ts";
import { jsonToValue } from "@/lib/protobuf.ts";
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

// The field labels are static, so they stay visible while the values load.
function MetaSettingsSkeleton() {
  const { t } = useTranslation("common");
  return (
    <div className="container flex size-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Field>
          <FieldTitle>
            {t("dialog.createInstance.form.friendlyName.label")}
          </FieldTitle>
          <Skeleton className="h-9 w-full" />
        </Field>
        <Field className="max-w-xl">
          <FieldTitle>{t("instanceIcon.label")}</FieldTitle>
          <Skeleton className="h-9 w-full" />
        </Field>
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
            <Skeleton className="size-9" />
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
    validators: { onSubmit: toFormSchema(Schema.Struct({ name: schema })) },
    onSubmit: async ({ value: fields, formApi }) => {
      const name = Schema.decodeSync(schema)(fields.name);
      if (name === value) return;
      try {
        await onSave(name);
        formApi.reset({ name });
        toast.success(t("instanceName.saved"));
      } catch (error) {
        // The demo notice already explains a demo write.
        if (isDemoReadOnlyError(error)) formApi.reset({ name: value });
        toastError(t("instanceName.saveError"), error);
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
                      onChange={(event) => {
                        field.handleChange(event.currentTarget.value);
                      }}
                      onBlur={() => {
                        field.handleBlur();
                        void form.handleSubmit();
                      }}
                    />
                    {isSubmitting && (
                      <InputGroupAddon align="inline-end">
                        <LoaderCircleIcon
                          className="animate-spin"
                          aria-label={t("saving")}
                        />
                      </InputGroupAddon>
                    )}
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

const ICON_RESULT_LIMIT = 60;

function InstanceIconField({
  value,
  disabled,
  pending,
  onChange,
}: {
  value: string;
  disabled: boolean;
  pending: boolean;
  onChange: (icon: string) => void;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const allIcons = useMemo(() => getAllIconTags(), []);
  // Render a ranked slice. Mounting every Lucide icon at once froze the
  // picker for seconds, so people clicked the trigger again and closed it.
  const results = useMemo(
    () => (open ? searchIcons(allIcons, query, ICON_RESULT_LIMIT) : null),
    [allIcons, open, query],
  );
  const hiddenCount = results ? results.total - results.names.length : 0;

  return (
    <Field data-disabled={disabled} className="max-w-xl">
      <FieldLabel htmlFor={id}>{t("instanceIcon.label")}</FieldLabel>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="outline"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/role-has-required-aria-props -- custom combobox with a filtered popup list, which a native select cannot provide; PopoverTrigger adds aria-controls for the popup it opens
              role="combobox"
              aria-expanded={open}
              aria-busy={pending || undefined}
              className="w-full justify-between"
              disabled={disabled}
            />
          }
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {value && <DynamicIcon name={value} />}
            <span className="truncate">
              {value
                ? formatIconName(value)
                : t("settingsPage.combo.selectPlaceholder")}
            </span>
          </span>
          {pending ? (
            <LoaderCircleIcon
              className="animate-spin"
              data-icon="inline-end"
              aria-label={t("saving")}
            />
          ) : (
            <ChevronsUpDownIcon className="opacity-50" data-icon="inline-end" />
          )}
        </PopoverTrigger>
        <PopoverContent
          aria-label={t("instanceIcon.label")}
          className="w-(--anchor-width) p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t("instanceIcon.searchPlaceholder")}
            />
            <CommandList>
              <CommandEmpty>{t("instanceIcon.empty")}</CommandEmpty>
              <CommandGroup>
                {results?.names.map((icon) => (
                  <CommandItem
                    key={icon}
                    value={icon}
                    onSelect={() => {
                      setOpen(false);
                      setQuery("");
                      if (icon !== value) onChange(icon);
                    }}
                  >
                    <CheckIcon
                      className={icon === value ? "opacity-100" : "opacity-0"}
                    />
                    <DynamicIcon name={icon} />
                    {formatIconName(icon)}
                  </CommandItem>
                ))}
              </CommandGroup>
              {hiddenCount > 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {t("instanceIcon.more", { count: hiddenCount })}
                </p>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <FieldDescription>{t("instanceIcon.description")}</FieldDescription>
    </Field>
  );
}

function Content() {
  const { t } = useTranslation("common");
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
    mutationFn: async (value: string) => {
      await setInstanceIcon(
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

  const canEditMeta = hasInstancePermission(
    instanceInfo,
    InstancePermission.UPDATE_INSTANCE_META,
  );

  return (
    <div className="container flex size-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <InstanceNameField
          key={instanceInfo.id}
          value={instanceInfo.friendlyName}
          disabled={!canEditMeta}
          onSave={async (name) => {
            await setFriendlyNameMutation.mutateAsync(name);
          }}
        />
        <InstanceIconField
          value={instanceInfo.icon}
          disabled={!canEditMeta}
          pending={setIconMutation.isPending}
          onChange={(icon) => {
            setIconMutation.mutate(icon, {
              onError: (error) => {
                toastError(t("instanceIcon.saveError"), error);
              },
            });
          }}
        />
      </div>
      {canEditMeta && (
        <InstanceMetadataSection
          key={instanceInfo.id}
          instanceId={instanceInfo.id}
        />
      )}
    </div>
  );
}

function InstanceMetadataSection({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const adapter = useMemo<MetadataAdapter | null>(() => {
    if (transport === null) return null;
    const service = createRpcClient(InstanceService, transport);
    return {
      mutationKey: ["instance", "metadata", instanceId],
      load: async (signal) =>
        (
          await Effect.runPromise(
            service.getInstanceMetadata({ instanceId }, { signal }),
          )
        ).metadata,
      set: (entry) =>
        Effect.runPromise(
          service.setInstanceMetadataEntry({
            instanceId,
            ...entry,
            value: jsonToValue(entry.value),
          }),
        ),
      delete: (entry) =>
        Effect.runPromise(
          service.deleteInstanceMetadataEntry({ instanceId, ...entry }),
        ),
    };
  }, [transport, instanceId]);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{t("instanceMetadata.title")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("instanceMetadata.description")}
      </p>
      <MetadataEditor adapter={adapter} />
    </section>
  );
}
