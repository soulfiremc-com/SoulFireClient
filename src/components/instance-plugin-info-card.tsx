import type { JsonValue } from "@bufbuild/protobuf";
import type {
  ServerPlugin,
  SettingsDefinition,
  SettingsPage,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import {
  ClipboardCopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  PowerIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { use, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  MenuItem,
  MenuSeparator,
} from "@/components/context-menu-primitives.tsx";
import { ExternalLink } from "@/components/external-link.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import type { BaseSettings } from "@/lib/types.ts";
import {
  getSettingValue,
  openExternalUrl,
  updateBotConfigEntry,
  updateInstanceConfigEntry,
  updateServerConfigEntry,
} from "@/lib/utils.tsx";
import DynamicIcon from "./dynamic-icon";

function PluginInfoCardContent(props: {
  settingsEntry: SettingsPage;
  plugin: ServerPlugin;
  link: ReactNode;
  enabledValue: boolean;
  onEnabledChange: (value: boolean) => void;
  cardSize?: "default" | "sm";
  settingsUrl?: string;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<null>();
  const copyToClipboard = useCopyToClipboard();

  return (
    <>
      <Card
        className="container"
        size={props.cardSize}
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        <CardHeader>
          <div className="flex flex-row items-center justify-between gap-2">
            {props.link}
            <Switch
              checked={props.enabledValue}
              onCheckedChange={props.onEnabledChange}
            />
          </div>
          <CardDescription className="whitespace-pre-line">
            {props.plugin.description}
          </CardDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary" className="select-text">
              {t("pluginCard.version", {
                version: props.plugin.version,
              })}
            </Badge>
            <Badge variant="secondary" className="select-text">
              {t("pluginCard.author", {
                author: props.plugin.author,
              })}
            </Badge>
            <Badge variant="secondary" className="select-text">
              {t("pluginCard.license", {
                license: props.plugin.license,
              })}
            </Badge>
            {props.plugin.website && (
              <ExternalLink
                href={props.plugin.website}
                className="inline-flex items-center"
              >
                <Badge variant="secondary">
                  {t("pluginCard.website", {
                    website: props.plugin.website,
                  })}
                </Badge>
              </ExternalLink>
            )}
          </div>
        </CardHeader>
      </Card>
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <MenuItem
            onClick={() => {
              props.onEnabledChange(!props.enabledValue);
              dismiss();
            }}
          >
            <PowerIcon />
            {props.enabledValue
              ? t("contextMenu.plugin.disable")
              : t("contextMenu.plugin.enable")}
          </MenuItem>
          <MenuSeparator />
          {props.settingsUrl && (
            <>
              <MenuItem
                onClick={() => {
                  void navigate({ to: props.settingsUrl });
                  dismiss();
                }}
              >
                <ExternalLinkIcon />
                {t("contextMenu.plugin.openSettings")}
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          <MenuItem
            onClick={() => {
              copyToClipboard(props.settingsEntry.pageName);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("contextMenu.plugin.copyPluginName")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              copyToClipboard(props.plugin.version);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {t("contextMenu.plugin.copyVersion")}
          </MenuItem>
          {props.plugin.website && (
            <MenuItem
              onClick={() => {
                openExternalUrl(props.plugin.website);
                dismiss();
              }}
            >
              <GlobeIcon />
              {t("contextMenu.plugin.openWebsite")}
            </MenuItem>
          )}
        </ContextMenuPortal>
      )}
    </>
  );
}

function PluginCardTitle(props: { settingsEntry: SettingsPage }) {
  return (
    <CardTitle className="flex flex-row items-center gap-2 text-xl">
      <DynamicIcon
        className="size-6 shrink-0"
        name={props.settingsEntry.iconId}
      />
      {props.settingsEntry.pageName}
    </CardTitle>
  );
}

function usePluginEnabledState(
  settingsEntry: SettingsPage,
  profile: BaseSettings,
  settingsDefinitions: SettingsDefinition[],
) {
  const enabledIdentifier = settingsEntry.enabledIdentifier;
  const enabledDefinition = useMemo(
    () =>
      settingsDefinitions.find(
        (def) =>
          def.id?.key === enabledIdentifier?.key &&
          def.id?.namespace === enabledIdentifier?.namespace,
      ),
    [settingsDefinitions, enabledIdentifier],
  );
  const enabledValue = useMemo(
    () => getSettingValue(profile, enabledDefinition) === true,
    [profile, enabledDefinition],
  );
  return { enabledIdentifier, enabledValue };
}

export function InstancePluginInfoCard(props: {
  settingsEntry: SettingsPage;
  plugin: ServerPlugin;
}) {
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const profile = instanceInfo.profile;
  const transport = use(TransportContext);
  const queryClient = useQueryClient();

  const { enabledIdentifier, enabledValue } = usePluginEnabledState(
    props.settingsEntry,
    profile,
    instanceInfo.settingsDefinitions,
  );

  const setEnabledMutation = useMutation({
    mutationKey: [
      "instance",
      "plugin",
      "enabled",
      instanceInfo.id,
      props.settingsEntry.id,
    ],
    scope: {
      id: `instance-plugin-${instanceInfo.id}-${props.settingsEntry.id}`,
    },
    mutationFn: async (value: JsonValue) => {
      if (!enabledIdentifier) return;
      await updateInstanceConfigEntry(
        enabledIdentifier.namespace,
        enabledIdentifier.key,
        value,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: instanceInfoQueryOptions.queryKey,
      });
    },
  });

  return (
    <PluginInfoCardContent
      settingsEntry={props.settingsEntry}
      plugin={props.plugin}
      enabledValue={enabledValue}
      onEnabledChange={setEnabledMutation.mutate}
      settingsUrl={`/instance/${instanceInfo.id}/settings/${props.settingsEntry.id}`}
      link={
        <Link
          to="/instance/$instance/settings/$pageId"
          params={{
            instance: instanceInfo.id,
            pageId: props.settingsEntry.id,
          }}
          search={{}}
        >
          <PluginCardTitle settingsEntry={props.settingsEntry} />
        </Link>
      }
    />
  );
}

export function BotPluginInfoCard(props: {
  settingsEntry: SettingsPage;
  plugin: ServerPlugin;
  botConfig: BaseSettings;
  instanceId: string;
  botId: string;
  cardSize?: "default" | "sm";
  instanceInfoQueryKey: readonly unknown[];
  settingsDefinitions: SettingsDefinition[];
}) {
  const transport = use(TransportContext);
  const queryClient = useQueryClient();

  const { enabledIdentifier, enabledValue } = usePluginEnabledState(
    props.settingsEntry,
    props.botConfig,
    props.settingsDefinitions,
  );

  const setEnabledMutation = useMutation({
    mutationKey: [
      "bot",
      "plugin",
      "enabled",
      props.instanceId,
      props.botId,
      props.settingsEntry.id,
    ],
    scope: {
      id: `bot-plugin-${props.instanceId}-${props.botId}-${props.settingsEntry.id}`,
    },
    mutationFn: async (value: JsonValue) => {
      if (!enabledIdentifier) return;
      await updateBotConfigEntry(
        enabledIdentifier.namespace,
        enabledIdentifier.key,
        value,
        props.instanceId,
        props.botId,
        transport,
        queryClient,
        props.instanceInfoQueryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: props.instanceInfoQueryKey,
      });
    },
  });

  return (
    <PluginInfoCardContent
      settingsEntry={props.settingsEntry}
      plugin={props.plugin}
      cardSize={props.cardSize}
      enabledValue={enabledValue}
      onEnabledChange={setEnabledMutation.mutate}
      link={<PluginCardTitle settingsEntry={props.settingsEntry} />}
    />
  );
}

export function ServerPluginInfoCard(props: {
  settingsEntry: SettingsPage;
  plugin: ServerPlugin;
}) {
  const serverInfoQueryOptions = useRouteContext({
    from: "/_dashboard/user/admin",
    select: (context) => context.serverInfoQueryOptions,
  });
  const { data: serverInfo } = useSuspenseQuery(serverInfoQueryOptions);
  const profile = serverInfo.profile;
  const transport = use(TransportContext);
  const queryClient = useQueryClient();

  const { enabledIdentifier, enabledValue } = usePluginEnabledState(
    props.settingsEntry,
    profile,
    serverInfo.settingsDefinitions,
  );

  const setEnabledMutation = useMutation({
    mutationKey: ["server", "plugin", "enabled", props.settingsEntry.id],
    scope: { id: `server-plugin-${props.settingsEntry.id}` },
    mutationFn: async (value: JsonValue) => {
      if (!enabledIdentifier) return;
      await updateServerConfigEntry(
        enabledIdentifier.namespace,
        enabledIdentifier.key,
        value,
        transport,
        queryClient,
        serverInfoQueryOptions.queryKey,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: serverInfoQueryOptions.queryKey,
      });
    },
  });

  return (
    <PluginInfoCardContent
      settingsEntry={props.settingsEntry}
      plugin={props.plugin}
      enabledValue={enabledValue}
      onEnabledChange={setEnabledMutation.mutate}
      settingsUrl={`/user/admin/settings/${props.settingsEntry.id}`}
      link={
        <Link
          to="/user/admin/settings/$pageId"
          params={{
            pageId: props.settingsEntry.id,
          }}
          search={{}}
        >
          <PluginCardTitle settingsEntry={props.settingsEntry} />
        </Link>
      }
    />
  );
}
