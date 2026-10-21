import { Code, ConnectError } from "@connectrpc/connect";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { use, useId } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslation } from "react-i18next";
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
} from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
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
import {
  hasGlobalPermission,
  setSelfEmail,
  setSelfUsername,
} from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/user/settings")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.settings"), {
      kind: "dynamic",
      name: "settings",
    }),
  component: UserSettings,
});

function UserSettingsSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        {/* Avatar section */}
        <div className="flex max-w-xl flex-col gap-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-48" />
          <div className="flex w-fit flex-row items-center gap-2 rounded-lg border p-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </div>
        {/* Username field */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
        {/* Email field */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}

function UserSettings() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout
      showUserCrumb={true}
      pageName={t("pageName.settings")}
      loadingSkeleton={<UserSettingsSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation(["common", "admin"]);
  const { clientDataQueryOptions } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
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
    <div className="container flex h-full w-full grow flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex max-w-xl flex-col gap-1">
          <ComponentTitle
            title={t("userSettings.avatar.title")}
            description={
              <>
                {t("userSettings.avatar.description")}{" "}
                <ExternalLink
                  className="font-semibold underline-offset-4 hover:underline"
                  href="https://gravatar.com"
                >
                  {t("userSettings.avatar.gravatar")}
                </ExternalLink>
                .
              </>
            }
          />
          <Item variant="outline" size="sm" className="w-fit text-left">
            <ItemMedia>
              <UserAvatar
                username={clientInfo.username}
                email={clientInfo.email}
                className="size-10"
              />
            </ItemMedia>
            <ItemContent className="text-base leading-tight">
              <ItemTitle>{clientInfo.username}</ItemTitle>
              <ItemDescription>{clientInfo.email}</ItemDescription>
            </ItemContent>
          </Item>
        </div>
        <ProfileField
          name="username"
          label={t("userSettings.username.uiName")}
          description={t("userSettings.username.description")}
          value={clientInfo.username}
          schema={createUsernameSchema({
            min: t("admin:users.baseUserDialog.form.username.min"),
            max: t("admin:users.baseUserDialog.form.username.max"),
            pattern: t("admin:users.baseUserDialog.form.username.regex"),
          })}
          disabled={
            !hasGlobalPermission(
              clientInfo,
              GlobalPermission.UPDATE_SELF_USERNAME,
            )
          }
          onSave={setUsernameMutation.mutateAsync}
        />
        <ProfileField
          name="email"
          label={t("userSettings.email.uiName")}
          description={t("userSettings.email.description")}
          value={clientInfo.email}
          schema={userEmailSchema}
          disabled={
            !hasGlobalPermission(clientInfo, GlobalPermission.UPDATE_SELF_EMAIL)
          }
          onSave={setEmailMutation.mutateAsync}
        />
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
  onSave,
}: {
  name: "username" | "email";
  label: string;
  description: string;
  value: string;
  schema: z.ZodType<string, string>;
  disabled: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const form = useForm({
    defaultValues: { value },
    validators: { onSubmit: z.object({ value: schema }) },
    onSubmit: async ({ value: fields, formApi }) => {
      if (fields.value === value) return;
      try {
        await onSave(fields.value);
        formApi.reset({ value: fields.value });
        toast.success(t("userSettings.saved", { field: label }));
      } catch (error) {
        if (ConnectError.from(error).code === Code.AlreadyExists) {
          toast.error(t("userSettings.conflict", { field: label }));
        } else {
          console.error(error);
          toast.error(t("userSettings.saveError", { field: label }));
        }
      }
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <FieldGroup>
            <form.Field name="value">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field
                    data-invalid={invalid}
                    data-disabled={disabled || isSubmitting}
                  >
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={id}
                        name={name}
                        type={name === "email" ? "email" : "text"}
                        autoComplete={name}
                        value={field.state.value}
                        maxLength={name === "username" ? 32 : 255}
                        onChange={(event) =>
                          field.handleChange(event.currentTarget.value)
                        }
                        onBlur={field.handleBlur}
                        disabled={disabled || isSubmitting}
                        aria-invalid={invalid}
                        aria-describedby={`${id}-description`}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          type="submit"
                          disabled={disabled || isSubmitting}
                          aria-busy={isSubmitting}
                          aria-label={t("userSettings.saveField", {
                            field: label,
                          })}
                        >
                          {t(isSubmitting ? "saving" : "save")}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription id={`${id}-description`}>
                      {description}
                    </FieldDescription>
                    {invalid ? (
                      <FieldError errors={field.state.meta.errors} />
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
