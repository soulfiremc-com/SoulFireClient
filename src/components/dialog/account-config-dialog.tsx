import type { JsonValue } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { RotateCcwIcon, SearchIcon } from "lucide-react";
import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DynamicIcon from "@/components/dynamic-icon.tsx";
import { BotPluginInfoCard } from "@/components/instance-plugin-info-card.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { SettingTypeRenderer } from "@/components/settings-page.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type { Value } from "@/generated/google/protobuf/struct_pb.ts";
import {
  type ServerPlugin,
  type SettingsDefinition,
  type SettingsEntryIdentifier,
  type SettingsPage,
  SettingsPageEntryScopeType,
} from "@/generated/soulfire/common_pb.ts";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { valueToJson } from "@/lib/protobuf.ts";
import type { BaseSettings, ProfileAccount } from "@/lib/types.ts";
import {
  cn,
  getSettingIdentifierKey,
  getSettingValue,
  removeBotConfigEntry,
  updateBotConfigEntry,
} from "@/lib/utils.tsx";

type BotSettingsPage = SettingsPage & {
  plugin?: ServerPlugin;
};

type BotSettingsView = "overrides" | "all";

type ResolvedBotSetting = {
  page: BotSettingsPage;
  identifier: SettingsEntryIdentifier;
  definition: SettingsDefinition;
  source: "bot" | "instance" | "default";
  inheritedSource: "instance" | "default";
  effectiveValue: JsonValue;
  inheritedValue: JsonValue;
  defaultValue: JsonValue;
  botValue?: JsonValue;
  matchesInherited: boolean;
};

const EMPTY_SETTINGS: BaseSettings = { settings: {} };

function getBotSettingsPages(
  instanceSettings: SettingsPage[],
  settingsDefinitions: SettingsDefinition[],
  plugins: ServerPlugin[],
): BotSettingsPage[] {
  const perBotDefinitionIds = new Set(
    settingsDefinitions
      .filter((def) => def.scope === SettingsPageEntryScopeType.BOT)
      .map((def) => getSettingIdentifierKey(def.id as SettingsEntryIdentifier)),
  );

  return instanceSettings
    .map((page) => {
      const filteredEntries = page.entries.filter((entry) =>
        perBotDefinitionIds.has(getSettingIdentifierKey(entry)),
      );

      const plugin = page.owningPluginId
        ? plugins.find((candidate) => candidate.id === page.owningPluginId)
        : undefined;

      return {
        ...page,
        entries: filteredEntries,
        plugin,
      };
    })
    .filter((page) => page.entries.length > 0);
}

function convertAccountConfigToSettings(
  account: ProfileAccount,
): Record<string, Record<string, JsonValue>> {
  const settings: Record<string, Record<string, JsonValue>> = {};
  for (const namespace of account.config) {
    const entries: Record<string, JsonValue> = {};
    for (const entry of namespace.entries) {
      entries[entry.key] = valueToJson(entry.value as Value);
    }
    settings[namespace.namespace] = entries;
  }
  return settings;
}

function getDirectSettingValue(
  config: BaseSettings,
  identifier: SettingsEntryIdentifier,
): JsonValue | undefined {
  return config.settings[identifier.namespace]?.[identifier.key];
}

function getSettingDisplayName(definition: SettingsDefinition): string {
  switch (definition.type.case) {
    case "minMax":
      return (
        definition.type.value.minEntry?.uiName ||
        definition.type.value.maxEntry?.uiName ||
        definition.id?.key ||
        ""
      );
    default:
      return definition.type.value?.uiName ?? definition.id?.key ?? "";
  }
}

function getSettingDescription(definition: SettingsDefinition): string {
  switch (definition.type.case) {
    case "minMax":
      return (
        definition.type.value.minEntry?.description ||
        definition.type.value.maxEntry?.description ||
        ""
      );
    default:
      return definition.type.value?.description ?? "";
  }
}

function areJsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatSettingValue(
  definition: SettingsDefinition,
  value: JsonValue,
): string {
  if (value === null || value === undefined) {
    return "Not set";
  }

  switch (definition.type.case) {
    case "bool":
      return value ? "Enabled" : "Disabled";
    case "combo":
      return (
        definition.type.value.options.find((option) => option.id === value)
          ?.displayName ?? String(value)
      );
    case "string": {
      const stringValue = String(value);
      if (stringValue.length === 0) {
        return "Empty";
      }

      return stringValue.length > 64
        ? `${stringValue.slice(0, 61)}...`
        : stringValue;
    }
    case "stringList": {
      const listValue = Array.isArray(value) ? value : [];
      if (listValue.length === 0) {
        return "Empty";
      }

      if (listValue.length <= 2) {
        return listValue.join(", ");
      }

      return `${listValue.length} entries`;
    }
    case "minMax": {
      if (
        typeof value !== "object" ||
        value === null ||
        !("min" in value) ||
        !("max" in value)
      ) {
        return "Range";
      }

      return `${value.min} – ${value.max}`;
    }
    default:
      return String(value);
  }
}

function matchesSettingQuery(row: ResolvedBotSetting, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }

  return [
    row.page.pageName,
    row.identifier.namespace,
    row.identifier.key,
    getSettingDisplayName(row.definition),
    getSettingDescription(row.definition),
    formatSettingValue(row.definition, row.effectiveValue),
    formatSettingValue(row.definition, row.inheritedValue),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function sourceLabel(source: ResolvedBotSetting["source"]): string {
  switch (source) {
    case "bot":
      return "Bot override";
    case "instance":
      return "Inherited from instance";
    case "default":
      return "Using default";
  }
}

function BotSettingRow(props: {
  botId: string;
  instanceId: string;
  instanceInfoQueryKey: readonly unknown[];
  row: ResolvedBotSetting;
  showPage: boolean;
  transport: Transport | null;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const valueMutation = useMutation({
    mutationKey: [
      "bot-setting",
      props.botId,
      props.row.identifier.namespace,
      props.row.identifier.key,
    ],
    scope: {
      id: `bot-setting-${props.botId}-${props.row.identifier.namespace}-${props.row.identifier.key}`,
    },
    mutationFn: async (value: JsonValue) =>
      await updateBotConfigEntry(
        props.row.identifier.namespace,
        props.row.identifier.key,
        value,
        props.instanceId,
        props.botId,
        props.transport,
        queryClient,
        props.instanceInfoQueryKey,
      ),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: props.instanceInfoQueryKey,
      });
    },
  });
  const resetMutation = useMutation({
    mutationKey: [
      "bot-setting-reset",
      props.botId,
      props.row.identifier.namespace,
      props.row.identifier.key,
    ],
    scope: {
      id: `bot-setting-reset-${props.botId}-${props.row.identifier.namespace}-${props.row.identifier.key}`,
    },
    mutationFn: async () =>
      await removeBotConfigEntry(
        props.row.identifier.namespace,
        props.row.identifier.key,
        props.instanceId,
        props.botId,
        props.transport,
        queryClient,
        props.instanceInfoQueryKey,
      ),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: props.instanceInfoQueryKey,
      });
    },
  });

  return (
    <section className="border-b px-4 py-3 last:border-b-0">
      {props.showPage && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <DynamicIcon
              name={props.row.page.iconId}
              className="size-4 shrink-0"
            />
            <span className="truncate">{props.row.page.pageName}</span>
          </div>
          <div className="flex items-center gap-3">
            {props.row.matchesInherited && props.row.source === "bot" && (
              <span>
                {t("account.config.matchesInheritedValue", {
                  defaultValue: "Matches inherited value",
                })}
              </span>
            )}
            <span className="font-medium text-foreground">
              {sourceLabel(props.row.source)}
            </span>
          </div>
        </div>
      )}

      <div className={props.showPage ? "mt-2.5" : undefined}>
        <SettingTypeRenderer
          settingType={props.row.definition.type}
          value={props.row.effectiveValue}
          changeCallback={valueMutation.mutate}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {props.row.source === "bot" ? (
              <>
                {props.row.inheritedSource === "instance"
                  ? t("account.config.instanceValue", {
                      defaultValue: "Instance value",
                    })
                  : t("account.config.defaultValue", {
                      defaultValue: "Default value",
                    })}
                :{" "}
                {formatSettingValue(
                  props.row.definition,
                  props.row.inheritedValue,
                )}
              </>
            ) : props.row.source === "instance" ? (
              <>
                {t("account.config.instanceValue", {
                  defaultValue: "Instance value",
                })}
                :{" "}
                {formatSettingValue(
                  props.row.definition,
                  props.row.inheritedValue,
                )}
              </>
            ) : (
              <>
                {t("account.config.defaultValue", {
                  defaultValue: "Default value",
                })}
                :{" "}
                {formatSettingValue(
                  props.row.definition,
                  props.row.defaultValue,
                )}
              </>
            )}
          </span>
          {!props.showPage && (
            <>
              {props.row.matchesInherited && props.row.source === "bot" && (
                <span>
                  {t("account.config.matchesInheritedValue", {
                    defaultValue: "Matches inherited value",
                  })}
                </span>
              )}
              <span className="font-medium text-foreground">
                {sourceLabel(props.row.source)}
              </span>
            </>
          )}
        </div>

        {props.row.source === "bot" && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            <RotateCcwIcon className="size-3.5" />
            {t("account.config.resetOverride", {
              defaultValue: "Reset override",
            })}
          </Button>
        )}
      </div>
    </section>
  );
}

type AccountConfigDialogProps = {
  account: ProfileAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AccountConfigDialog({
  account,
  open,
  onOpenChange,
}: AccountConfigDialogProps) {
  const { t } = useTranslation("instance");
  const isMobile = useIsMobile();
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [view, setView] = useState<BotSettingsView>("overrides");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedPage(null);
      setView("overrides");
      setSearchQuery("");
    }
  }, [open]);

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="overflow-hidden p-0 md:max-h-[560px] md:max-w-[760px] lg:max-w-[980px]">
        <CredenzaTitle className="sr-only">
          {t("account.config.title", { name: account.lastKnownName })}
        </CredenzaTitle>
        <CredenzaDescription className="sr-only">
          {t("account.config.description")}
        </CredenzaDescription>
        <CredenzaBody>
          <Suspense fallback={<DialogSkeleton isMobile={isMobile} />}>
            <DialogContentInner
              account={account}
              isMobile={isMobile}
              searchQuery={searchQuery}
              selectedPage={selectedPage}
              setSearchQuery={setSearchQuery}
              setSelectedPage={setSelectedPage}
              setView={setView}
              view={view}
            />
          </Suspense>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}

function DialogSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="flex h-[540px] min-h-0 flex-col">
      <div className="pt-4">
        <div className="px-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
          <div className="-mb-px mt-4 flex gap-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
        <div className="border-b border-border/60" />
      </div>

      <div className="flex min-h-0 flex-1">
        {!isMobile && (
          <div className="hidden w-60 shrink-0 border-r md:block">
            <div className="space-y-1 p-2">
              {[1, 2, 3, 4].map((index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-md px-2 py-2"
                >
                  <Skeleton className="size-4" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isMobile && (
            <div className="border-b px-4 py-3">
              <Skeleton className="h-9 w-full" />
            </div>
          )}

          <div className="space-y-4 overflow-y-auto p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DialogContentInner({
  account,
  isMobile,
  searchQuery,
  selectedPage,
  setSearchQuery,
  setSelectedPage,
  setView,
  view,
}: {
  account: ProfileAccount;
  isMobile: boolean;
  searchQuery: string;
  selectedPage: string | null;
  setSearchQuery: (value: string) => void;
  setSelectedPage: (page: string | null) => void;
  setView: (view: BotSettingsView) => void;
  view: BotSettingsView;
}) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  const botSettingsPages = useMemo(
    () =>
      getBotSettingsPages(
        instanceInfo.instanceSettings,
        instanceInfo.settingsDefinitions,
        instanceInfo.plugins,
      ),
    [
      instanceInfo.instanceSettings,
      instanceInfo.settingsDefinitions,
      instanceInfo.plugins,
    ],
  );

  const botSettingsConfig: BaseSettings = useMemo(
    () => ({ settings: convertAccountConfigToSettings(account) }),
    [account],
  );

  const settingsDefinitionsById = useMemo(
    () =>
      new Map(
        instanceInfo.settingsDefinitions.map((definition) => [
          getSettingIdentifierKey(definition.id as SettingsEntryIdentifier),
          definition,
        ]),
      ),
    [instanceInfo.settingsDefinitions],
  );

  const resolvedSettings = useMemo(() => {
    return botSettingsPages.flatMap((page) =>
      page.entries.flatMap((identifier) => {
        const definition = settingsDefinitionsById.get(
          getSettingIdentifierKey(identifier),
        );
        if (!definition) {
          return [];
        }

        const botValue = getDirectSettingValue(botSettingsConfig, identifier);
        const instanceValue = getDirectSettingValue(
          instanceInfo.profile,
          identifier,
        );
        const inheritedValue = getSettingValue(
          instanceInfo.profile,
          definition,
        );
        const defaultValue = getSettingValue(EMPTY_SETTINGS, definition);
        const source =
          botValue !== undefined
            ? "bot"
            : instanceValue !== undefined
              ? "instance"
              : "default";

        return [
          {
            botValue,
            defaultValue,
            definition,
            effectiveValue: botValue !== undefined ? botValue : inheritedValue,
            identifier,
            inheritedSource:
              instanceValue !== undefined ? "instance" : "default",
            inheritedValue,
            matchesInherited:
              botValue !== undefined &&
              areJsonValuesEqual(botValue, inheritedValue),
            page,
            source,
          } satisfies ResolvedBotSetting,
        ];
      }),
    );
  }, [
    botSettingsConfig,
    botSettingsPages,
    instanceInfo.profile,
    settingsDefinitionsById,
  ]);

  const resolvedSettingsById = useMemo(
    () =>
      new Map(
        resolvedSettings.map((row) => [
          getSettingIdentifierKey(row.identifier),
          row,
        ]),
      ),
    [resolvedSettings],
  );

  const overrideSettings = useMemo(
    () =>
      resolvedSettings.filter(
        (row) => row.source === "bot" && matchesSettingQuery(row, searchQuery),
      ),
    [resolvedSettings, searchQuery],
  );

  const filteredPages = useMemo(
    () =>
      botSettingsPages
        .map((page) => ({
          ...page,
          entries: page.entries.filter((identifier) => {
            const row = resolvedSettingsById.get(
              getSettingIdentifierKey(identifier),
            );

            return row ? matchesSettingQuery(row, searchQuery) : false;
          }),
        }))
        .filter((page) => page.entries.length > 0),
    [botSettingsPages, resolvedSettingsById, searchQuery],
  );

  useEffect(() => {
    if (selectedPage === null && botSettingsPages.length > 0) {
      setSelectedPage(botSettingsPages[0].id);
    }
  }, [botSettingsPages, selectedPage, setSelectedPage]);

  useEffect(() => {
    if (view !== "all") {
      return;
    }

    if (filteredPages.length === 0) {
      setSelectedPage(null);
      return;
    }

    if (
      selectedPage === null ||
      !filteredPages.some((page) => page.id === selectedPage)
    ) {
      setSelectedPage(filteredPages[0].id);
    }
  }, [filteredPages, selectedPage, setSelectedPage, view]);

  const currentPage = filteredPages.find((page) => page.id === selectedPage);
  const currentPageMeta = botSettingsPages.find(
    (page) => page.id === currentPage?.id,
  );
  const pageItems = filteredPages.map((page) => ({
    iconId: page.iconId,
    label: page.pageName,
    value: page.id,
  }));

  return (
    <div className="flex h-[540px] min-h-0 flex-col bg-background">
      <div className="pt-4">
        <div className="px-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {t("account.config.title", { name: account.lastKnownName })}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("account.config.description")}
              </p>
            </div>

            <InputGroup className="w-full md:max-w-xs">
              <InputGroupAddon>
                <SearchIcon className="text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder={t("account.config.search", {
                  defaultValue: "Search settings",
                })}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
              />
            </InputGroup>
          </div>

          <ToggleGroup
            value={[view]}
            onValueChange={(value) => {
              const nextView = value[0] as BotSettingsView | undefined;
              if (nextView) {
                setView(nextView);
              }
            }}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            <ToggleGroupItem value="overrides">
              {t("account.config.overrides", {
                defaultValue: "Overrides",
              })}{" "}
              <span className="tabular-nums text-xs text-muted-foreground">
                {resolvedSettings.filter((row) => row.source === "bot").length}
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="all">
              {t("account.config.allSettings", {
                defaultValue: "All settings",
              })}{" "}
              <span className="tabular-nums text-xs text-muted-foreground">
                {resolvedSettings.length}
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="border-b border-border/60" />
      </div>

      {view === "overrides" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {overrideSettings.length > 0 ? (
            <div className="flex flex-col">
              {overrideSettings.map((row) => (
                <BotSettingRow
                  key={getSettingIdentifierKey(row.identifier)}
                  botId={account.profileId}
                  instanceId={instanceInfo.id}
                  instanceInfoQueryKey={instanceInfoQueryOptions.queryKey}
                  row={row}
                  showPage
                  transport={transport}
                />
              ))}
            </div>
          ) : (
            <Empty className="h-full items-start justify-center border-0 px-4 text-left">
              <EmptyHeader className="items-start">
                <EmptyTitle className="text-sm">
                  {searchQuery.trim().length > 0
                    ? t("account.config.noOverridesMatching", {
                        defaultValue: "No overrides match this search.",
                      })
                    : t("account.config.noOverrides", {
                        defaultValue:
                          "This bot does not have any explicit overrides yet.",
                      })}
                </EmptyTitle>
                <EmptyDescription>
                  {searchQuery.trim().length > 0
                    ? t("account.config.tryDifferentSearch", {
                        defaultValue: "Try a different search term.",
                      })
                    : t("account.config.noOverridesHelp", {
                        defaultValue:
                          "Open All settings to inherit values or create the first bot-specific override.",
                      })}
                </EmptyDescription>
              </EmptyHeader>

              {searchQuery.trim().length === 0 && (
                <EmptyContent className="items-start">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setView("all");
                    }}
                  >
                    {t("account.config.openAllSettings", {
                      defaultValue: "Open all settings",
                    })}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {!isMobile && (
            <aside className="hidden w-[248px] shrink-0 border-r md:block">
              <nav className="flex h-full flex-col overflow-y-auto py-1">
                {filteredPages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setSelectedPage(page.id)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                      page.id === currentPage?.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <DynamicIcon
                      name={page.iconId}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {page.pageName}
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {page.entries.length}
                    </span>
                  </button>
                ))}
              </nav>
            </aside>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isMobile && (
              <div className="border-b px-4 py-3">
                <Select
                  value={currentPage?.id}
                  onValueChange={(value) => setSelectedPage(value)}
                  items={pageItems}
                >
                  <SelectTrigger
                    aria-label={t("account.config.selectPage", {
                      defaultValue: "Select a settings page",
                    })}
                    className="w-full"
                  >
                    <SelectValue
                      placeholder={t("account.config.selectPage", {
                        defaultValue: "Select a settings page",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        {t("account.config.selectPage", {
                          defaultValue: "Settings pages",
                        })}
                      </SelectLabel>
                      {pageItems.map((page) => (
                        <SelectItem key={page.value} value={page.value}>
                          <div className="flex items-center gap-2">
                            <DynamicIcon
                              name={page.iconId}
                              className="size-4 shrink-0"
                            />
                            <span>{page.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {currentPage ? (
                <div className="flex flex-col">
                  {currentPageMeta?.plugin && (
                    <div className="border-b px-4 pt-2.5 pb-3">
                      <BotPluginInfoCard
                        settingsEntry={currentPageMeta}
                        plugin={currentPageMeta.plugin}
                        botConfig={botSettingsConfig}
                        cardSize="sm"
                        instanceId={instanceInfo.id}
                        botId={account.profileId}
                        instanceInfoQueryKey={instanceInfoQueryOptions.queryKey}
                        settingsDefinitions={instanceInfo.settingsDefinitions}
                      />
                    </div>
                  )}

                  {currentPage.entries.map((identifier) => {
                    const row = resolvedSettingsById.get(
                      getSettingIdentifierKey(identifier),
                    );
                    if (!row) {
                      return null;
                    }

                    return (
                      <BotSettingRow
                        key={getSettingIdentifierKey(identifier)}
                        botId={account.profileId}
                        instanceId={instanceInfo.id}
                        instanceInfoQueryKey={instanceInfoQueryOptions.queryKey}
                        row={row}
                        showPage={false}
                        transport={transport}
                      />
                    );
                  })}
                </div>
              ) : (
                <Empty className="h-full items-start justify-center border-0 px-4 text-left">
                  <EmptyHeader className="items-start">
                    <EmptyTitle className="text-sm">
                      {searchQuery.trim().length > 0
                        ? t("account.config.noSearchResults", {
                            defaultValue: "No settings match this search.",
                          })
                        : t("account.config.noSettings")}
                    </EmptyTitle>
                    {searchQuery.trim().length > 0 ? (
                      <EmptyDescription>
                        {t("account.config.tryDifferentSearch", {
                          defaultValue: "Try a different search term.",
                        })}
                      </EmptyDescription>
                    ) : null}
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
