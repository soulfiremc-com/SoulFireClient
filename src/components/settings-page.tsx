import type { JsonValue } from "@bufbuild/protobuf";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useLocation, useRouteContext } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  ListFilterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useCommandPalette } from "@/components/command-palette-context.ts";
import {
  createSettingsRegistry,
  SettingsRegistryContext,
  useSettingsDefinition,
  useSettingsDefinitionByKey,
} from "@/components/providers/settings-registry-context.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { SettingStatusRow } from "@/components/settings/setting-status-row.tsx";
import { SettingTypeRenderer } from "@/components/settings/setting-type-renderer.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { FieldGroup } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import type {
  SettingsDefinition,
  SettingsEntryIdentifier,
  SettingsPage,
} from "@/generated/soulfire/common_pb";
import { useSettingValueMutation } from "@/hooks/use-setting-value-mutation.ts";
import {
  focusSettingElement,
  getSettingLabel,
  isFocusedSetting,
  type SettingFocus,
} from "@/lib/settings-focus";
import {
  settingMutationOptions,
  type SettingMutationTarget,
} from "@/lib/setting-mutation-options.ts";
import { settingDestination } from "@/lib/command-palette.ts";
import {
  filterSettingsEntries,
  findSettingsOnOtherPages,
  splitSettingsEntries,
  groupSettingsEntries,
} from "@/lib/settings-discovery.ts";
import type { BaseSettings } from "@/lib/types.ts";
import {
  updateInstanceConfigEntry,
  updateServerConfigEntry,
} from "@/lib/instance-mutations.ts";
import { cn, getSettingValue } from "@/lib/utils.tsx";

export { ComponentTitle } from "@/components/settings/setting-layout.tsx";

/** Settings pages edit project or server settings. Bot overrides use the account dialog. */
type SettingsPageTarget = Exclude<SettingMutationTarget, { type: "bot" }>;

interface SettingFieldProps {
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: BaseSettings;
  mutationTarget: SettingsPageTarget;
  persisted: boolean;
}

/**
 * Component that renders a setting field by its identifier.
 * This is the main component for mounting settings anywhere in the UI.
 * It looks up the setting definition from context and handles value management.
 */
function SettingField(
  props: SettingFieldProps & {
    definition: SettingsDefinition | undefined;
    namespace: string;
    settingKey: string;
    focused?: boolean;
    /** Changes on each jump to a setting, so a repeated jump focuses again. */
    focusRequest?: string | undefined;
  },
) {
  const { definition } = props;
  const fieldRef = useRef<HTMLDivElement>(null);
  // The focus request this field already handled, or undefined.
  const handledRequest = useRef<string | null | undefined>(undefined);
  const focusRequest = props.focusRequest ?? null;
  useEffect(() => {
    if (!props.focused) {
      // Focus again when a later navigation points at this setting.
      handledRequest.current = undefined;
      return undefined;
    }
    if (
      definition &&
      fieldRef.current &&
      handledRequest.current !== focusRequest
    ) {
      return focusSettingElement(fieldRef.current, () => {
        handledRequest.current = focusRequest;
      });
    }
    return undefined;
  }, [props.focused, focusRequest, definition]);
  const storedValue = useMemo(
    () => getSettingValue(props.config, definition),
    [props.config, definition],
  );
  const setting = useSettingValueMutation({
    definition,
    target: props.mutationTarget,
    namespace: props.namespace,
    settingKey: props.settingKey,
    storedValue,
    persisted: props.persisted,
    save: async (value) =>
      props.updateConfigEntry(props.namespace, props.settingKey, value),
    invalidate: props.invalidateQuery,
  });

  if (!definition) {
    return null;
  }

  return (
    <div
      ref={fieldRef}
      tabIndex={props.focused ? -1 : undefined}
      role={props.focused ? "group" : undefined}
      aria-label={props.focused ? getSettingLabel(definition) : undefined}
      data-setting-focused={props.focused || undefined}
      className={cn(
        "flex max-w-3xl min-w-0 flex-col has-[>[data-slot=setting-status]]:gap-2",
        props.focused && "scroll-mt-4 rounded-lg p-3 ring-2 ring-ring",
      )}
    >
      <SettingTypeRenderer
        settingType={definition.type}
        value={setting.value}
        pending={setting.pending}
        changeCallback={setting.changeCallback}
      />
      <SettingStatusRow
        definition={definition}
        value={setting.value}
        status={setting.status}
        persisted={props.persisted}
        onReset={setting.reset}
      />
    </div>
  );
}

function SettingFieldById(
  props: SettingFieldProps & {
    settingId: SettingsEntryIdentifier;
    focused: boolean;
    focusRequest: string | undefined;
  },
) {
  const { settingId, ...rest } = props;
  const definition = useSettingsDefinition(settingId);
  return (
    <SettingField
      {...rest}
      definition={definition}
      namespace={settingId.namespace}
      settingKey={settingId.key}
    />
  );
}

/**
 * Component that renders a setting field by namespace and key strings.
 * Convenience wrapper around SettingField for when you have separate strings.
 */
function SettingFieldByKey(
  props: SettingFieldProps & { namespace: string; settingKey: string },
) {
  const definition = useSettingsDefinitionByKey(
    props.namespace,
    props.settingKey,
  );
  return <SettingField {...props} definition={definition} />;
}

export function InstanceSettingFieldByKey(props: {
  namespace: string;
  settingKey: string;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: BaseSettings;
}) {
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const persisted = use(TransportContext) !== null;
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(instanceInfo.settingsDefinitions),
    [instanceInfo.settingsDefinitions],
  );

  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <SettingFieldByKey
        key={
          settingMutationOptions(
            { type: "instance", instanceId: instanceInfo.id },
            props.namespace,
            props.settingKey,
            "value",
          ).scope.id
        }
        {...props}
        persisted={persisted}
        mutationTarget={{ type: "instance", instanceId: instanceInfo.id }}
      />
    </SettingsRegistryContext.Provider>
  );
}

export interface DisabledSettingId {
  namespace: string;
  key: string;
}

const NO_DISABLED_IDS: readonly DisabledSettingId[] = [];

export function ClientSettingsPageComponent({
  data,
  invalidateQuery,
  updateConfigEntry,
  config,
  mutationTarget,
  disabledIds = NO_DISABLED_IDS,
  definitions,
  allPages,
  persisted,
  linkToPage,
  focusSetting,
  focusRequest,
}: {
  data: SettingsPage;
  invalidateQuery: () => Promise<void>;
  updateConfigEntry: (
    namespace: string,
    key: string,
    value: JsonValue,
  ) => Promise<void>;
  config: BaseSettings;
  mutationTarget: SettingsPageTarget;
  disabledIds?: readonly DisabledSettingId[] | undefined;
  definitions: readonly SettingsDefinition[];
  allPages?: readonly SettingsPage[];
  persisted: boolean;
  linkToPage?: (page: SettingsPage, label: ReactNode) => ReactNode;
  focusSetting?: SettingFocus | undefined;
  /** Changes on each jump to a setting, so a repeated jump focuses again. */
  focusRequest?: string | undefined;
}) {
  const { t } = useTranslation("common");
  const openCommandPalette = useCommandPalette();
  const [query, setQuery] = useState("");
  // The filter stays visible while it has text, so no field is hidden silently.
  const [filterOpen, setFilterOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFilterFocus = useRef(false);
  useEffect(() => {
    if (filterOpen || !restoreFilterFocus.current) return;
    restoreFilterFocus.current = false;
    filterButtonRef.current?.focus();
  }, [filterOpen]);
  const closeFilter = () => {
    restoreFilterFocus.current = true;
    setQuery("");
    setFilterOpen(false);
  };
  const enabledIdentifier = data.enabledIdentifier;
  const visibleEntries = useMemo(() => {
    const hidden = [...disabledIds];
    if (enabledIdentifier) hidden.push(enabledIdentifier);
    return data.entries.filter(
      (entryId) =>
        !hidden.some(
          (id) => entryId.namespace === id.namespace && entryId.key === id.key,
        ),
    );
  }, [data.entries, disabledIds, enabledIdentifier]);
  const matches = useMemo(
    () => filterSettingsEntries(visibleEntries, definitions, query),
    [visibleEntries, definitions, query],
  );
  const { common, advanced } = useMemo(
    () => splitSettingsEntries(data.id, matches),
    [data.id, matches],
  );
  const otherPages = useMemo(
    () =>
      allPages
        ? findSettingsOnOtherPages(data.id, allPages, definitions, query)
        : [],
    [allPages, data.id, definitions, query],
  );
  const searching = query.trim() !== "";
  const renderEntry = (entryId: SettingsEntryIdentifier) => (
    <SettingFieldById
      key={
        settingMutationOptions(
          mutationTarget,
          entryId.namespace,
          entryId.key,
          "value",
        ).scope.id
      }
      settingId={entryId}
      mutationTarget={mutationTarget}
      updateConfigEntry={updateConfigEntry}
      invalidateQuery={invalidateQuery}
      config={config}
      persisted={persisted}
      focused={isFocusedSetting(entryId, focusSetting)}
      focusRequest={focusRequest}
    />
  );

  const renderEntries = (entries: SettingsEntryIdentifier[]) => (
    <FieldGroup className="gap-5">
      {entries.map((entryId) => renderEntry(entryId))}
    </FieldGroup>
  );

  const sections = groupSettingsEntries(data.id, common);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
          <span>{t(`settingsPage.scope.${mutationTarget.type}`)}</span>{" "}
          <span>
            {t(
              persisted ? "settingsPage.autoSave" : "settingsPage.demoNotSaved",
            )}
          </span>
        </p>
        {filterOpen ? (
          <InputGroup className="w-full sm:w-xs">
            <InputGroupAddon>
              <ListFilterIcon />
            </InputGroupAddon>
            <InputGroupInput
              // A search input adds its own clear button next to ours.
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- type="search" would add a second clear button
              role="searchbox"
              autoFocus
              aria-label={t("settingsPage.filter")}
              placeholder={t("settingsPage.filterPlaceholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || event.nativeEvent.isComposing)
                  return;
                // Escape clears the text first, then closes the filter.
                event.preventDefault();
                event.stopPropagation();
                if (query) setQuery("");
                else closeFilter();
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={t("settingsPage.closeFilter")}
                onClick={closeFilter}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <Button
            ref={filterButtonRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFilterOpen(true);
            }}
          >
            <ListFilterIcon data-icon="inline-start" />
            {t("settingsPage.filter")}
          </Button>
        )}
      </div>
      {matches.length === 0 && searching && (
        <div className="flex max-w-3xl flex-wrap items-center gap-3">
          <output className="block text-sm text-muted-foreground">
            {t("settingsPage.noMatches", { query: query.trim() })}
          </output>
          {openCommandPalette && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                openCommandPalette({ search: query.trim() });
              }}
            >
              <SearchIcon data-icon="inline-start" />
              {t("settingsPage.searchEverywhere")}
            </Button>
          )}
        </div>
      )}
      {otherPages.length > 0 && linkToPage && (
        <p className="text-sm text-muted-foreground">
          {t("settingsPage.otherPages")}{" "}
          {otherPages.map(({ page, count }, index) => (
            <span key={page.id}>
              {index > 0 && ", "}
              {linkToPage(page, `${page.pageName} (${count})`)}
            </span>
          ))}
        </p>
      )}
      {common.length > 0 && (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section
              key={section.id}
              className="flex flex-col gap-5"
              aria-label={
                section.id === "other"
                  ? undefined
                  : t(`settingsPage.sections.${section.id}.title`)
              }
            >
              {section.id !== "other" && (
                <div className="flex max-w-3xl flex-col gap-1">
                  <h3 className="text-base font-semibold">
                    {t(`settingsPage.sections.${section.id}.title`)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t(`settingsPage.sections.${section.id}.description`)}
                  </p>
                </div>
              )}
              {renderEntries(section.entries)}
            </section>
          ))}
        </div>
      )}
      {advanced.length > 0 &&
        (searching ||
        advanced.some((entry) => isFocusedSetting(entry, focusSetting)) ? (
          renderEntries(advanced)
        ) : (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className="group/advanced"
                />
              }
            >
              <ChevronRightIcon
                data-icon="inline-start"
                className="group-data-panel-open/advanced:rotate-90"
              />
              {t("settingsPage.advanced", { count: advanced.length })}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-6">
              {renderEntries(advanced)}
            </CollapsibleContent>
          </Collapsible>
        ))}
    </div>
  );
}

export function InstanceSettingsPageComponent({
  data,
  disabledIds,
  focusSetting,
}: {
  data: SettingsPage;
  disabledIds?: readonly DisabledSettingId[] | undefined;
  focusSetting?: SettingFocus | undefined;
}) {
  const queryClient = useQueryClient();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const transport = use(TransportContext);
  const profile = instanceInfo.profile;
  const focusRequest = useLocation({
    select: (location) => location.state.settingFocusRequest,
  });
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(instanceInfo.settingsDefinitions),
    [instanceInfo.settingsDefinitions],
  );
  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <ClientSettingsPageComponent
        key={JSON.stringify([instanceInfo.id, data.id])}
        data={data}
        focusSetting={focusSetting}
        focusRequest={focusRequest}
        mutationTarget={{ type: "instance", instanceId: instanceInfo.id }}
        updateConfigEntry={async (namespace, key, value) =>
          updateInstanceConfigEntry(
            namespace,
            key,
            value,
            instanceInfo,
            transport,
            queryClient,
            instanceInfoQueryOptions.queryKey,
          )
        }
        invalidateQuery={async () => {
          await queryClient.invalidateQueries({
            queryKey: instanceInfoQueryOptions.queryKey,
          });
        }}
        config={profile}
        disabledIds={disabledIds}
        definitions={instanceInfo.settingsDefinitions}
        allPages={instanceInfo.instanceSettings}
        persisted={transport !== null}
        linkToPage={(page, label) => (
          <Link
            className="underline underline-offset-3"
            {...settingDestination(
              { kind: "project", id: instanceInfo.id },
              page.id,
            )}
          >
            {label}
          </Link>
        )}
      />
    </SettingsRegistryContext.Provider>
  );
}

export function AdminSettingsPageComponent({
  data,
  focusSetting,
}: {
  data: SettingsPage;
  focusSetting?: SettingFocus | undefined;
}) {
  const queryClient = useQueryClient();
  const serverInfoQueryOptions = useRouteContext({
    from: "/_dashboard/user/admin",
    select: (context) => context.serverInfoQueryOptions,
  });
  const { data: serverInfo } = useSuspenseQuery(serverInfoQueryOptions);
  const serverConfig = serverInfo.profile;
  const transport = use(TransportContext);
  const focusRequest = useLocation({
    select: (location) => location.state.settingFocusRequest,
  });
  const settingsRegistry = useMemo(
    () => createSettingsRegistry(serverInfo.settingsDefinitions),
    [serverInfo.settingsDefinitions],
  );
  return (
    <SettingsRegistryContext.Provider value={settingsRegistry}>
      <ClientSettingsPageComponent
        key={data.id}
        data={data}
        focusSetting={focusSetting}
        focusRequest={focusRequest}
        mutationTarget={{ type: "server" }}
        updateConfigEntry={async (namespace, key, value) =>
          updateServerConfigEntry(
            namespace,
            key,
            value,
            transport,
            queryClient,
            serverInfoQueryOptions.queryKey,
          )
        }
        invalidateQuery={async () => {
          await queryClient.invalidateQueries({
            queryKey: serverInfoQueryOptions.queryKey,
          });
        }}
        config={serverConfig}
        definitions={serverInfo.settingsDefinitions}
        allPages={serverInfo.serverSettings}
        persisted={transport !== null}
        linkToPage={(page, label) => (
          <Link
            className="underline underline-offset-3"
            to="/user/admin/settings/$pageId"
            params={{ pageId: page.id }}
          >
            {label}
          </Link>
        )}
      />
    </SettingsRegistryContext.Provider>
  );
}
