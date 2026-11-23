import { toFormSchema } from "@/lib/form-validation";
import { Schema } from "effect";
import { Code, ConnectError } from "@connectrpc/connect";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ComponentProps, Suspense, use, useId, useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { ComponentTitle } from "@/components/settings-page.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";
import { GlobalPermission } from "@/generated/soulfire/common_pb";
import { createUsernameSchema, userEmailSchema } from "@/lib/user-profile.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { setSelfEmail, setSelfUsername } from "@/lib/instance-mutations.ts";
import { hasGlobalPermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/user/settings")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.settings"), {
      kind: "dynamic",
      name: "settings",
    }),
  component: UserSettings,
});

function SelfAvatar() {
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  return (
    <Item variant="outline" size="sm" className="w-fit text-left">
      <ItemMedia>
        <UserAvatar
          username={clientInfo.username}
          email={clientInfo.email}
          className="size-10"
        />
      </ItemMedia>
      <ItemContent className="text-base/tight">
        <ItemTitle>{clientInfo.username}</ItemTitle>
        <ItemDescription>{clientInfo.email}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function SelfAvatarSkeleton() {
  return (
    <div className="flex w-fit flex-row items-center gap-2 rounded-lg border p-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

/// Keeps the field label and description visible while the stored value loads.
function ProfileFieldSkeleton({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <Field>
      <FieldTitle>{label}</FieldTitle>
      <Skeleton className="h-9 w-full" />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

/// Loads the stored profile value and permission, then renders the editable field.
function SelfProfileField({
  permission,
  ...props
}: Omit<ComponentProps<typeof ProfileField>, "value" | "disabled"> & {
  permission: GlobalPermission;
}) {
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  return (
    <ProfileField
      {...props}
      value={clientInfo[props.name]}
      disabled={!hasGlobalPermission(clientInfo, permission)}
    />
  );
}

function UserSettings() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout showUserCrumb pageName={t("pageName.settings")}>
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation(["common", "admin"]);
  const { clientDataQueryOptions } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const setUsernameMutation = useMutation({
    mutationKey: ["user", "self", "username"],
    scope: { id: "user-self-username" },
    mutationFn: async (value: string) => {
      await setSelfUsername(
        value,
        transport,
        queryClient,
        clientDataQueryOptions.queryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: clientDataQueryOptions.queryKey,
      });
    },
  });
  const setEmailMutation = useMutation({
    mutationKey: ["user", "self", "email"],
    scope: { id: "user-self-email" },
    mutationFn: async (value: string) => {
      await setSelfEmail(
        value,
        transport,
        queryClient,
        clientDataQueryOptions.queryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: clientDataQueryOptions.queryKey,
      });
    },
  });

  return (
    <div className="container flex size-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex max-w-xl flex-col gap-1">
          <ComponentTitle
            title={t("userSettings.avatar.title")}
            description={
              <Trans
                i18nKey="common:userSettings.avatar.hint"
                components={{
                  link: (
                    <ExternalLink
                      className="font-semibold underline-offset-4 hover:underline"
                      href="https://gravatar.com"
                    />
                  ),
                }}
              />
            }
          />
          <Suspense fallback={<SelfAvatarSkeleton />}>
            <SelfAvatar />
          </Suspense>
        </div>
        <Suspense
          fallback={
            <ProfileFieldSkeleton
              label={t("userSettings.username.uiName")}
              description={t("userSettings.username.description")}
            />
          }
        >
          <SelfProfileField
            name="username"
            label={t("userSettings.username.uiName")}
            description={t("userSettings.username.description")}
            schema={createUsernameSchema({
              min: t("admin:users.baseUserDialog.form.username.min"),
              max: t("admin:users.baseUserDialog.form.username.max"),
              pattern: t("admin:users.baseUserDialog.form.username.regex"),
            })}
            permission={GlobalPermission.UPDATE_SELF_USERNAME}
            demo={transport === null}
            onSave={setUsernameMutation.mutateAsync}
          />
        </Suspense>
        <Suspense
          fallback={
            <ProfileFieldSkeleton
              label={t("userSettings.email.uiName")}
              description={t("userSettings.email.description")}
            />
          }
        >
          <SelfProfileField
            name="email"
            label={t("userSettings.email.uiName")}
            description={t("userSettings.email.description")}
            schema={userEmailSchema}
            permission={GlobalPermission.UPDATE_SELF_EMAIL}
            demo={transport === null}
            onSave={setEmailMutation.mutateAsync}
          />
        </Suspense>
      </div>
    </div>
  );
}

function ProfileField({
  name,
  label,
  description,
  value,
  schema,
  disabled,
  demo,
  onSave,
}: {
  name: "username" | "email";
  label: string;
  description: string;
  value: string;
  schema: Schema.Codec<string, string>;
  disabled: boolean;
  demo: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  // The last value the server rejected. The field keeps it, so the user can
  // correct it, and blur does not resend a value that is already taken.
  const [saveError, setSaveError] = useState<{
    value: string;
    message: string;
    retry: boolean;
  }>();
  const form = useForm({
    defaultValues: { value },
    validators: { onSubmit: toFormSchema(Schema.Struct({ value: schema })) },
    onSubmit: async ({ value: fields, formApi }) => {
      if (fields.value === value) {
        setSaveError(undefined);
        return;
      }
      if (saveError?.value === fields.value && !saveError.retry) return;
      if (demo) {
        formApi.reset({ value });
        toast.info(t("demoReadOnly"));
        return;
      }
      try {
        await onSave(fields.value);
        setSaveError(undefined);
        formApi.reset({ value: fields.value });
        toast.success(t("userSettings.saved", { field: label }));
      } catch (error) {
        const conflict = ConnectError.from(error).code === Code.AlreadyExists;
        if (!conflict) console.error(error);
        const message = conflict
          ? t("userSettings.conflict", { field: label })
          : t("userSettings.saveError", { field: label });
        setSaveError({ value: fields.value, message, retry: !conflict });
        toast.error(message);
      }
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // Enter during a save would send the same value a second time.
        if (form.state.isSubmitting) return;
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <FieldGroup>
            <form.Field name="value">
              {(field) => {
                const rejected =
                  saveError?.value === field.state.value
                    ? saveError
                    : undefined;
                const invalid =
                  (field.state.meta.isTouched && !field.state.meta.isValid) ||
                  rejected !== undefined;
                return (
                  <Field data-invalid={invalid} data-disabled={disabled}>
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={id}
                        name={name}
                        type={name === "email" ? "email" : "text"}
                        autoComplete={name}
                        value={field.state.value}
                        maxLength={name === "username" ? 32 : 255}
                        onChange={(event) => {
                          field.handleChange(event.currentTarget.value);
                        }}
                        onBlur={() => {
                          field.handleBlur();
                          if (form.state.isSubmitting) return;
                          void form.handleSubmit();
                        }}
                        disabled={disabled}
                        // Read-only keeps focus in the field while it saves.
                        readOnly={isSubmitting}
                        aria-busy={isSubmitting}
                        aria-invalid={invalid}
                        aria-describedby={
                          invalid
                            ? `${id}-description ${id}-error`
                            : `${id}-description`
                        }
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
                    <FieldDescription id={`${id}-description`}>
                      {description}{" "}
                      {disabled
                        ? t("userSettings.noPermission")
                        : t("userSettings.autoSave")}
                    </FieldDescription>
                    {invalid ? (
                      <FieldError
                        id={`${id}-error`}
                        errors={
                          rejected
                            ? [{ message: rejected.message }]
                            : field.state.meta.errors
                        }
                      />
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>
        )}
      </form.Subscribe>
    </form>
  );
}
