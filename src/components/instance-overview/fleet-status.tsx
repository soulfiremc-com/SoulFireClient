import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  RotateCwIcon,
  SquareIcon,
} from "lucide-react";
import { type CSSProperties, use } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { BotService } from "@/generated/soulfire/bot_pb";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { useMutationScopePending } from "@/hooks/use-mutation-scope-pending";
import {
  type BotDisplayState,
  type BotFailureGroup,
  countBotFleet,
  groupBotFailures,
} from "@/lib/bot-fleet.ts";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import type { InstanceInfoQueryData } from "@/lib/types.ts";
import { BOT_STATE_META, getFailureFix } from "./fleet-status-meta.ts";
import { cn, hasInstancePermission } from "@/lib/utils.tsx";

const STATE_ORDER: readonly BotDisplayState[] = [
  "connected",
  "starting",
  "retrying",
  "failed",
  "stopping",
  "stopped",
];

function FailureGroupRow({
  group,
  instanceInfo,
  canControl,
}: {
  group: BotFailureGroup;
  instanceInfo: InstanceInfoQueryData;
  canControl: boolean;
}) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const queryClient = useQueryClient();
  const stateScope = `bot-state-${instanceInfo.id}`;
  const botStatePending = useMutationScopePending(stateScope);
  const restart = useMutation({
    mutationKey: ["bots", "restart-group", instanceInfo.id, group.id],
    scope: { id: stateScope },
    mutationFn: async () => {
      if (transport === null) return;
      await Effect.runPromise(
        createRpcClient(BotService, transport).restartBots({
          instanceId: instanceInfo.id,
          botIds: group.botIds,
        }),
      );
    },
    // The group often looks the same until the next status poll, so confirm
    // the request right away instead of leaving the click without a result.
    onSuccess: () => {
      if (transport === null) return;
      toast.success(
        t("fleet.restartRequested", { count: group.botIds.length }),
      );
    },
    onError: (error) =>
      toast.error(t("fleet.restartError"), { description: error.message }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ["bot-status", instanceInfo.id],
      }),
  });
  const fix = getFailureFix(group.kind, instanceInfo.id);
  const Icon = group.severity === "failed" ? CircleAlertIcon : RotateCwIcon;
  const names = group.botNames.slice(0, 3).join(", ");
  const extra = group.botNames.length - 3;

  return (
    <div role="listitem">
      <Item variant="outline" size="sm">
        <ItemMedia>
          <Icon
            aria-hidden="true"
            className={cn(
              "size-5",
              BOT_STATE_META[
                group.severity === "failed" ? "failed" : "retrying"
              ].text,
            )}
          />
        </ItemMedia>
        <ItemContent className="min-w-48">
          <ItemTitle className="flex-wrap">
            {t(`fleet.groupTitle.${group.severity}`, {
              count: group.botIds.length,
            })}
            <span className="font-normal">
              {t(`fleet.kind.${group.kind}.title`)}
            </span>
          </ItemTitle>
          <ItemDescription className="line-clamp-none">
            {t(`fleet.kind.${group.kind}.description`)}
          </ItemDescription>
          {group.message && (
            <p className="font-mono text-xs break-words text-muted-foreground select-text">
              {group.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {extra > 0 ? t("fleet.namesMore", { names, count: extra }) : names}
          </p>
        </ItemContent>
        <ItemActions className="flex-wrap">
          {fix && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link {...fix.link} />}
            >
              {t(fix.labelKey)}
            </Button>
          )}
          {canControl && (
            <Button
              size="sm"
              variant={group.severity === "failed" ? "default" : "outline"}
              disabled={botStatePending}
              onClick={() => restart.mutate()}
            >
              {restart.isPending ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="motion-safe:animate-spin"
                />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              {t("fleet.restartGroup", { count: group.botIds.length })}
            </Button>
          )}
        </ItemActions>
      </Item>
    </div>
  );
}

/** Explains desired state against connection readiness and what to do next. */
export function FleetStatus({
  instanceInfo,
}: {
  instanceInfo: InstanceInfoQueryData;
}) {
  const { t } = useTranslation("instance");
  const { data, isPending } = useQuery(botStatusQueryOptions(instanceInfo.id));
  const accountIds = new Set(
    instanceInfo.profile.accounts.map((account) => account.profileId),
  );
  const canControl = hasInstancePermission(
    instanceInfo,
    InstancePermission.CONTROL_BOTS,
  );

  if (isPending) {
    return <Skeleton className="h-14 w-full" />;
  }

  const bots = (data?.bots ?? []).filter((bot) =>
    accountIds.has(bot.profileId),
  );
  // Accounts without a live entry still count as stopped bots.
  const counts = countBotFleet([
    ...bots,
    ...Array.from(
      { length: Math.max(0, accountIds.size - bots.length) },
      () => undefined,
    ),
  ]);
  const groups = groupBotFailures(bots);

  const headline =
    counts.desired === 0
      ? t("fleet.headline.noneRunning", { count: counts.total })
      : counts.connected === counts.desired
        ? t("fleet.headline.allConnected", { count: counts.connected })
        : counts.starting > 0
          ? t("fleet.headline.connecting", {
              connected: counts.connected,
              count: counts.desired,
            })
          : t("fleet.headline.partial", {
              connected: counts.connected,
              count: counts.desired,
            });

  return (
    <section
      aria-labelledby="fleet-status-title"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-col gap-2">
        <h3 id="fleet-status-title" className="text-sm font-medium">
          {headline}
        </h3>
        {counts.total > 0 && (
          <div
            aria-hidden="true"
            className="flex h-2 w-full gap-px overflow-hidden rounded-sm bg-muted"
          >
            {STATE_ORDER.map(
              (state) =>
                counts[state] > 0 && (
                  <div
                    key={state}
                    className={cn(
                      "grow-(--bot-share) basis-0",
                      BOT_STATE_META[state].bar,
                    )}
                    // The share carries real fleet data, so it cannot be a class.
                    style={{ "--bot-share": counts[state] } as CSSProperties}
                  />
                ),
            )}
          </div>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {STATE_ORDER.filter((state) => counts[state] > 0).map((state) => {
            const meta = BOT_STATE_META[state];
            return (
              <li key={state}>
                <Link
                  to="/instance/$instance/bots"
                  params={{ instance: instanceInfo.id }}
                  search={{ status: state }}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <meta.icon
                    aria-hidden="true"
                    className={cn(
                      "size-3.5",
                      meta.text,
                      meta.spin && "motion-safe:animate-spin",
                    )}
                  />
                  <span className="font-medium tabular-nums">
                    {counts[state]}
                  </span>
                  <span className="text-muted-foreground">
                    {t(`fleet.state.${state}`)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {counts.starting > 0 && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 motion-safe:animate-spin"
          />
          {t("fleet.connectingHint", { count: counts.starting })}
        </p>
      )}
      {groups.length > 0 && (
        <ItemGroup className="gap-2" aria-label={t("fleet.attention")}>
          {groups.map((group) => (
            <FailureGroupRow
              key={group.id}
              group={group}
              instanceInfo={instanceInfo}
              canControl={canControl}
            />
          ))}
        </ItemGroup>
      )}
      {counts.desired === 0 && counts.stopped > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <SquareIcon aria-hidden="true" className="size-3.5" />
          {canControl ? t("fleet.startHint") : t("fleet.startHintNoPermission")}
        </p>
      )}
    </section>
  );
}
