import { create, type JsonValue } from "@bufbuild/protobuf";
import {
  GlobalPermission,
  StringSetting_InputType,
  StringSettingSchema,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { use } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import {
  ComponentTitle,
  SettingTypeRenderer,
} from "@/components/settings-page.tsx";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";
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
  const { t } = useTranslation("common");
  const { clientDataQueryOptions } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const setUsernameMutation = useMutation({
    mutationKey: ["user", "self", "username"],
    scope: { id: "user-self-username" },
    mutationFn: async (value: JsonValue) => {
      await setSelfUsername(
        value as string,
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
    mutationFn: async (value: JsonValue) => {
      await setSelfEmail(
        value as string,
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
        <SettingTypeRenderer
          settingType={{
            case: "string",
            value: create(StringSettingSchema, {
              uiName: t("userSettings.username.uiName"),
              description: t("userSettings.username.description"),
              def: "",
              inputType: StringSetting_InputType.TEXT,
              placeholder: "username",
              minLength: 3,
              maxLength: 32,
              pattern: "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?",
              disabled: !hasGlobalPermission(
                clientInfo,
                GlobalPermission.UPDATE_SELF_USERNAME,
              ),
            }),
          }}
          value={clientInfo.username}
          changeCallback={setUsernameMutation.mutate}
        />
        <SettingTypeRenderer
          settingType={{
            case: "string",
            value: create(StringSettingSchema, {
              uiName: t("userSettings.email.uiName"),
              description: t("userSettings.email.description"),
              def: "",
              inputType: StringSetting_InputType.EMAIL,
              placeholder: "root@soulfiremc.com",
              minLength: 3,
              maxLength: 255,
              pattern: ".*",
              disabled: !hasGlobalPermission(
                clientInfo,
                GlobalPermission.UPDATE_SELF_EMAIL,
              ),
            }),
          }}
          value={clientInfo.email}
          changeCallback={setEmailMutation.mutate}
        />
      </div>
    </div>
  );
}
