import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BlocksIcon,
  CheckIcon,
  CircleAlertIcon,
  EyeIcon,
  ImportIcon,
  type LucideIcon,
  LoaderCircleIcon,
  NetworkIcon,
  PickaxeIcon,
  PlayIcon,
  ShoppingCartIcon,
  SkipForwardIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { use, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import GenerateAccountsDialog from "@/components/dialog/generate-accounts-dialog.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { InstanceSettingFieldByKey } from "@/components/settings-page.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { BotDesiredState, BotService } from "@/generated/soulfire/bot_pb";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { getFailureFix } from "@/components/instance-overview/fleet-status-meta.ts";
import {
  getBotDisplayState,
  groupBotFailures,
  parseBotStartCount,
  selectBotsToStart,
} from "@/lib/bot-fleet.ts";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import { botDisplayName } from "@/lib/bot-with-status.ts";
import {
  DemoReadOnlyError,
  isDemoReadOnlyError,
} from "@/lib/instance-mutations.ts";
import { isPostHogConfigured } from "@/lib/posthog.ts";
import {
  dismissFirstBotSetup,
  getFirstBotSetupState,
  type FirstBotSetupStep,
} from "@/lib/first-bot-setup.ts";
import type {
  GenerateAccountsMode,
  InstanceInfoQueryData,
  ProfileAccount,
} from "@/lib/types.ts";
import {
  applyGeneratedAccounts,
  cn,
  getSettingValue,
  hasInstancePermission,
  updateInstanceConfigEntry,
} from "@/lib/utils.tsx";
import { displayText } from "@/lib/display-text";

const STEPS: readonly { id: FirstBotSetupStep; icon: LucideIcon }[] = [
  { id: "server", icon: PickaxeIcon },
  { id: "accounts", icon: UsersIcon },
  { id: "proxies", icon: NetworkIcon },
  { id: "start", icon: PlayIcon },
];

function ActionRow(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- ItemGroup from shadcn/ui renders a div with the list role, so its items cannot be li elements
    <div role="listitem">
      <Item variant="outline" size="sm">
        <ItemMedia variant="icon">
          <props.icon />
        </ItemMedia>
        <ItemContent className="min-w-48">
          <ItemTitle>{props.title}</ItemTitle>
          <ItemDescription className="line-clamp-none">
            {props.description}
          </ItemDescription>
        </ItemContent>
        <ItemActions>{props.action}</ItemActions>
      </Item>
    </div>
  );
}

function FirstBotConnecting({
  instanceInfo,
  onDone,
}: {
  instanceInfo: InstanceInfoQueryData;
  onDone: () => void;
}) {
  const { t } = useTranslation("instance");
  const { data } = useQuery(botStatusQueryOptions(instanceInfo.id));
  const bots = data?.bots ?? [];
  const connected = bots.find((bot) => getBotDisplayState(bot) === "connected");
  const [failure] = groupBotFailures(bots);

  if (connected) {
    return (
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Alert renders a div, and the status role announces this update
      <Alert role="status">
        <CheckIcon />
        <AlertTitle>
          {t("setup.connected.title", {
            name: botDisplayName(
              instanceInfo.profile.accounts.find(
                (account) => account.profileId === connected.profileId,
              ),
              connected,
            ),
          })}
        </AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-3">
            {t("setup.connected.description")}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/instance/$instance/bot/$botId"
                    params={{
                      instance: instanceInfo.id,
                      botId: connected.profileId,
                    }}
                  />
                }
              >
                <EyeIcon data-icon="inline-start" />
                {t("setup.connected.open")}
              </Button>
              <Button size="sm" variant="outline" onClick={onDone}>
                {t("setup.connected.done")}
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (failure) {
    const fix = getFailureFix(failure.kind, instanceInfo.id);
    return (
      <Alert role="alert">
        <CircleAlertIcon className="text-destructive" />
        <AlertTitle>{t(`fleet.kind.${failure.kind}.title`)}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-2">
            {t(`fleet.kind.${failure.kind}.description`)}
            {failure.message && (
              <span className="font-mono text-xs wrap-break-word">
                {failure.message}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {fix && (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link {...fix.link} />}
                >
                  {t(fix.labelKey)}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onDone}>
                {t("setup.connecting.seeStatus")}
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Alert renders a div, and the status role announces this update
    <Alert role="status">
      <LoaderCircleIcon className="motion-safe:animate-spin" />
      <AlertTitle>{t("setup.connecting.title")}</AlertTitle>
      <AlertDescription>{t("setup.connecting.description")}</AlertDescription>
    </Alert>
  );
}

/**
 * Guides a new instance from "no bots" to a first connected bot. Everything
 * here writes the normal instance settings and accounts, so the expert pages
 * stay the single source of truth.
 */
export function FirstBotSetup({
  instanceInfo,
  onDismiss,
}: {
  instanceInfo: InstanceInfoQueryData;
  onDismiss: () => void;
}) {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  // The demo cannot save, so the guide previews each step instead.
  const demo = transport === null;
  const posthog = usePostHog();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const [generateOpen, setGenerateOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startCount, setStartCount] = useState("1");
  const [proxiesSkipped, setProxiesSkipped] = useState(false);
  const definitions = instanceInfo.settingsDefinitions;
  const addressDefinition = definitions.find(
    (d) => d.id?.namespace === "bot" && d.id.key === "address",
  );
  const versionDefinition = definitions.find(
    (d) => d.id?.namespace === "bot" && d.id.key === "protocol-version",
  );
  const address = displayText(
    getSettingValue(instanceInfo.profile, addressDefinition) ?? "",
  );
  const defaultAddress =
    addressDefinition?.type.case === "string"
      ? addressDefinition.type.value.def
      : "";
  const version = displayText(
    getSettingValue(instanceInfo.profile, versionDefinition) ?? "",
  );
  const versionName =
    versionDefinition?.type.case === "combo"
      ? versionDefinition.type.value.options.find((o) => o.id === version)
          ?.displayName
      : undefined;
  const accounts = instanceInfo.profile.accounts;
  const proxies = instanceInfo.profile.proxies;
  const setup = getFirstBotSetupState({
    address,
    defaultAddress,
    accountCount: accounts.length,
    proxyCount: proxies.length,
    proxiesSkipped,
  });
  // Pick the step once. Typing an address must not move the guide on.
  const [activeStep, setActiveStep] = useState<FirstBotSetupStep>(
    setup.nextStep,
  );
  const canConfigure = hasInstancePermission(
    instanceInfo,
    InstancePermission.UPDATE_INSTANCE_CONFIG,
  );
  const canControl = hasInstancePermission(
    instanceInfo,
    InstancePermission.CONTROL_BOTS,
  );
  const existingUsernames = useMemo(
    () => new Set(accounts.map((account) => account.lastKnownName)),
    [accounts],
  );
  const instanceParams = { instance: instanceInfo.id };
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: instanceInfoQueryOptions.queryKey,
    });

  const generate = useMutation({
    mutationKey: ["instance", "accounts", "generate", instanceInfo.id],
    scope: { id: `instance-accounts-${instanceInfo.id}` },
    mutationFn: ({
      newAccounts,
      mode,
    }: {
      newAccounts: ProfileAccount[];
      mode: GenerateAccountsMode;
    }) =>
      applyGeneratedAccounts(
        newAccounts,
        mode,
        instanceInfo,
        transport,
        queryClient,
        instanceInfoQueryOptions.queryKey,
      ),
    onSuccess: () => {
      setActiveStep("proxies");
    },
    onSettled: invalidate,
  });

  const start = useMutation({
    mutationKey: ["bots", "start", instanceInfo.id],
    scope: { id: `bot-state-${instanceInfo.id}` },
    mutationFn: async (count: number) => {
      if (transport === null) throw DemoReadOnlyError.make({});
      const client = createRpcClient(BotService, transport);
      const latest = await Effect.runPromise(
        client.getBotList({ instanceId: instanceInfo.id }),
      );
      const response = await Effect.runPromise(
        client.setBotsDesiredState({
          instanceId: instanceInfo.id,
          botIds: selectBotsToStart(
            latest.bots,
            count,
            instanceInfo.profile.settings["account"]?.["shuffle-accounts"] ===
              true,
          ),
          desiredState: BotDesiredState.RUNNING,
        }),
      );
      return response.bots;
    },
    onSuccess: (bots) => {
      // With no started bot, the connecting card would wait forever.
      if (bots.length === 0) {
        toast.info(t("setup.start.noneStarted"));
        return;
      }
      setStarting(true);
      // Count guide starts too, or the first-run funnel misses these users.
      if (isPostHogConfigured) {
        posthog.capture("bot_start_completed", {
          bot_count: bots.length,
          source: "setup_guide",
        });
      }
    },
    onError: (error) => {
      // The app explains demo writes once, for every page.
      if (isDemoReadOnlyError(error)) return;
      toast.error(t("setup.start.error"), { description: error.message });
    },
    onSettled: async () => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({
          queryKey: ["bot-status", instanceInfo.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["instance-list"] }),
      ]);
    },
  });

  const requestedCount = parseBotStartCount(startCount, accounts.length);
  const validCount = requestedCount !== null;
  // Each bot needs its own account, so the count cannot pass the account total.
  const atAccountLimit =
    requestedCount === accounts.length || Number(startCount) > accounts.length;

  const summaries: Record<FirstBotSetupStep, string> = {
    server: t("setup.server.summary", {
      address,
      version: versionName ?? version,
    }),
    accounts:
      accounts.length > 0
        ? t("setup.accounts.summary", { count: accounts.length })
        : t("setup.accounts.summaryEmpty"),
    proxies:
      proxies.length > 0
        ? t("setup.proxies.summary", { count: proxies.length })
        : t("setup.proxies.summaryNone"),
    start: t("setup.start.summary"),
  };

  return (
    <section
      aria-labelledby="first-bot-setup-title"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 id="first-bot-setup-title" className="text-base font-semibold">
            {t("setup.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("setup.description")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dismissFirstBotSetup(instanceInfo.id);
            onDismiss();
          }}
        >
          {t("setup.later")}
        </Button>
      </div>
      {demo && (
        <Alert>
          <CircleAlertIcon />
          <AlertDescription>{t("common:demoReadOnly")}</AlertDescription>
        </Alert>
      )}
      {starting ? (
        <FirstBotConnecting
          instanceInfo={instanceInfo}
          onDone={() => {
            dismissFirstBotSetup(instanceInfo.id);
            onDismiss();
          }}
        />
      ) : (
        <ol className="flex flex-col rounded-lg border bg-card">
          {STEPS.map((step, index) => {
            const isActive = activeStep === step.id;
            const done = setup.done[step.id];
            return (
              <li
                key={step.id}
                className={cn(index > 0 && "border-t")}
                aria-current={isActive ? "step" : undefined}
              >
                <button
                  type="button"
                  aria-expanded={isActive}
                  onClick={() => {
                    setActiveStep(step.id);
                  }}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-medium tabular-nums",
                      done && "border-success/40 text-success-emphasis",
                      isActive && !done && "bg-primary text-primary-foreground",
                    )}
                  >
                    {done ? (
                      <>
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{t("setup.stepDone")}</span>
                      </>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">
                      {t(`setup.${step.id}.title`)}
                    </span>
                    {!isActive && (
                      <span className="truncate text-xs text-muted-foreground">
                        {summaries[step.id]}
                      </span>
                    )}
                  </span>
                  {step.id === "proxies" && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t("setup.optional")}
                    </span>
                  )}
                </button>
                {isActive && (
                  <div className="flex flex-col gap-4 px-3 pb-4 sm:pl-12">
                    {step.id === "server" && (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {t("setup.server.description")}
                        </p>
                        {canConfigure ? (
                          <>
                            {(["address", "protocol-version"] as const).map(
                              (settingKey) => (
                                <InstanceSettingFieldByKey
                                  key={settingKey}
                                  namespace="bot"
                                  settingKey={settingKey}
                                  config={instanceInfo.profile}
                                  invalidateQuery={invalidate}
                                  updateConfigEntry={(namespace, key, value) =>
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
                                />
                              ),
                            )}
                            <p className="text-xs text-muted-foreground">
                              {t("setup.server.versionHint")}
                            </p>
                            <Button
                              className="w-fit"
                              onClick={() => {
                                setActiveStep("accounts");
                              }}
                            >
                              {t("setup.continue")}
                              <ArrowRightIcon data-icon="inline-end" />
                            </Button>
                          </>
                        ) : (
                          <p className="text-sm">{t("setup.noPermission")}</p>
                        )}
                      </>
                    )}
                    {step.id === "accounts" && (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {t("setup.accounts.description")}
                        </p>
                        <ItemGroup className="gap-2">
                          <ActionRow
                            icon={SparklesIcon}
                            title={t("setup.accounts.offline.title")}
                            description={t(
                              "setup.accounts.offline.description",
                            )}
                            action={
                              <Button
                                size="sm"
                                disabled={
                                  demo || !canConfigure || generate.isPending
                                }
                                onClick={() => {
                                  setGenerateOpen(true);
                                }}
                              >
                                {t("setup.accounts.offline.action")}
                              </Button>
                            }
                          />
                          <ActionRow
                            icon={ImportIcon}
                            title={t("setup.accounts.existing.title")}
                            description={t(
                              "setup.accounts.existing.description",
                            )}
                            action={
                              <Button
                                size="sm"
                                variant="outline"
                                nativeButton={false}
                                render={
                                  <Link
                                    to="/instance/$instance/accounts"
                                    params={instanceParams}
                                    search={{ guide: "setup" }}
                                  />
                                }
                              >
                                {t("setup.accounts.existing.action")}
                              </Button>
                            }
                          />
                          <ActionRow
                            icon={ShoppingCartIcon}
                            title={t("setup.accounts.provider.title")}
                            description={t(
                              "setup.accounts.provider.description",
                            )}
                            action={
                              <Button
                                size="sm"
                                variant="outline"
                                nativeButton={false}
                                render={
                                  <Link
                                    to="/instance/$instance/accounts"
                                    params={instanceParams}
                                    search={{ guide: "providers" }}
                                  />
                                }
                              >
                                {t("setup.accounts.provider.action")}
                              </Button>
                            }
                          />
                        </ItemGroup>
                        {(accounts.length > 0 || demo) && (
                          <Button
                            className="w-fit"
                            onClick={() => {
                              setActiveStep("proxies");
                            }}
                          >
                            {t("setup.continue")}
                            <ArrowRightIcon data-icon="inline-end" />
                          </Button>
                        )}
                      </>
                    )}
                    {step.id === "proxies" && (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {t("setup.proxies.description")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => {
                              setProxiesSkipped(true);
                              setActiveStep("start");
                            }}
                          >
                            <SkipForwardIcon data-icon="inline-start" />
                            {t(
                              proxies.length > 0
                                ? "setup.continue"
                                : "setup.proxies.skip",
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            nativeButton={false}
                            render={
                              <Link
                                to="/instance/$instance/proxies"
                                params={instanceParams}
                                search={{ guide: "setup" }}
                              />
                            }
                          >
                            {t("setup.proxies.add")}
                          </Button>
                          <Button
                            variant="outline"
                            nativeButton={false}
                            render={
                              <Link
                                to="/instance/$instance/proxies"
                                params={instanceParams}
                                search={{ guide: "providers" }}
                              />
                            }
                          >
                            <ShoppingCartIcon data-icon="inline-start" />
                            {t("setup.proxies.provider")}
                          </Button>
                        </div>
                      </>
                    )}
                    {step.id === "start" && (
                      <>
                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                          <dt className="text-muted-foreground">
                            {t("setup.start.reviewServer")}
                          </dt>
                          <dd className="truncate font-mono text-xs/5 select-text">
                            {address}
                          </dd>
                          <dt className="text-muted-foreground">
                            {t("setup.start.reviewVersion")}
                          </dt>
                          <dd className="truncate">{versionName ?? version}</dd>
                          <dt className="text-muted-foreground">
                            {t("setup.start.reviewAccounts")}
                          </dt>
                          <dd>{summaries.accounts}</dd>
                          <dt className="text-muted-foreground">
                            {t("setup.start.reviewProxies")}
                          </dt>
                          <dd>{summaries.proxies}</dd>
                        </dl>
                        {address === defaultAddress && (
                          <Alert>
                            <CircleAlertIcon />
                            <AlertDescription>
                              {t("setup.start.defaultAddress", { address })}
                            </AlertDescription>
                          </Alert>
                        )}
                        {accounts.length === 0 ? (
                          <Button
                            className="w-fit"
                            variant="outline"
                            onClick={() => {
                              setActiveStep("accounts");
                            }}
                          >
                            <UsersIcon data-icon="inline-start" />
                            {t("setup.start.needAccounts")}
                          </Button>
                        ) : canControl ? (
                          <form
                            className="flex flex-wrap items-end gap-3"
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (requestedCount !== null && !start.isPending) {
                                start.mutate(requestedCount);
                              }
                            }}
                          >
                            <Field className="w-40" data-invalid={!validCount}>
                              <FieldLabel htmlFor="first-bot-start-count">
                                {t("setup.start.count")}
                              </FieldLabel>
                              <Input
                                id="first-bot-start-count"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={accounts.length}
                                step={1}
                                value={startCount}
                                aria-invalid={!validCount}
                                aria-describedby="first-bot-start-count-limit"
                                onChange={(event) => {
                                  setStartCount(event.target.value);
                                }}
                              />
                            </Field>
                            <Button
                              type="submit"
                              disabled={demo || !validCount || start.isPending}
                            >
                              {start.isPending ? (
                                <LoaderCircleIcon
                                  className="animate-spin"
                                  data-icon="inline-start"
                                />
                              ) : (
                                <PlayIcon data-icon="inline-start" />
                              )}
                              {t("setup.start.action", {
                                count: requestedCount ?? 1,
                              })}
                            </Button>
                            <div className="flex w-full flex-col gap-1">
                              {validCount ? (
                                <FieldDescription id="first-bot-start-count-limit">
                                  {t("setup.start.countLimit", {
                                    count: accounts.length,
                                  })}
                                </FieldDescription>
                              ) : (
                                <FieldError id="first-bot-start-count-limit">
                                  {t("setup.start.countInvalid", {
                                    count: accounts.length,
                                  })}
                                </FieldError>
                              )}
                              {atAccountLimit && canConfigure && (
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  className="h-auto w-fit p-0"
                                  onClick={() => {
                                    setActiveStep("accounts");
                                  }}
                                >
                                  <UsersIcon data-icon="inline-start" />
                                  {t("setup.start.addAccounts")}
                                </Button>
                              )}
                              <FieldDescription>
                                {t("setup.start.help")}
                              </FieldDescription>
                            </div>
                          </form>
                        ) : (
                          <p className="text-sm">{t("setup.noPermission")}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <BlocksIcon aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {t("setup.expert")}{" "}
          <Link
            className="underline underline-offset-3"
            to="/instance/$instance/settings/$pageId"
            params={{ ...instanceParams, pageId: "bot" }}
          >
            {t("setup.expertLink")}
          </Link>
        </span>
      </p>
      <GenerateAccountsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerate={(newAccounts, mode) =>
          generate.mutateAsync({ newAccounts, mode })
        }
        existingUsernames={existingUsernames}
      />
    </section>
  );
}
