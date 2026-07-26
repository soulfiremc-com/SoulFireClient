import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  BotDesiredState,
  BotFleetSummarySchema,
  type BotListResponse,
  BotListResponseSchema,
  BotRuntimeState,
  BotService,
  type BotStatus,
} from "@/generated/soulfire/bot_pb.ts";
import {
  type InstanceListResponse,
  InstanceListResponseSchema,
} from "@/generated/soulfire/instance_pb.ts";
import type { InstanceInfoQueryData } from "@/lib/types.ts";
import { createTransport } from "@/lib/web-rpc.ts";

function summarizeBots(bots: BotListResponse["bots"]) {
  return create(BotFleetSummarySchema, {
    totalBots: bots.length,
    desiredBots: bots.filter(
      (bot) => bot.status?.desiredState === BotDesiredState.RUNNING,
    ).length,
    onlineBots: bots.filter(
      (bot) => bot.status?.runtimeState === BotRuntimeState.RUNNING,
    ).length,
    startingBots: bots.filter(
      (bot) =>
        bot.status?.runtimeState === BotRuntimeState.QUEUED ||
        bot.status?.runtimeState === BotRuntimeState.STARTING,
    ).length,
    retryingBots: bots.filter(
      (bot) => bot.status?.runtimeState === BotRuntimeState.RETRYING,
    ).length,
    failedBots: bots.filter(
      (bot) => bot.status?.runtimeState === BotRuntimeState.FAILED,
    ).length,
  });
}

export function useBotStatusStream(instanceId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const transport = createTransport();
    if (transport === null) return;

    const abortController = new AbortController();
    const client = createClient(BotService, transport);
    const patchStatuses = (
      statuses: readonly BotStatus[],
      removedBotId?: string,
    ) => {
      const statusById = new Map(
        statuses.map((status) => [status.profileId, status]),
      );
      const updatedList = queryClient.setQueryData<BotListResponse>(
        ["bot-status", instanceId],
        (current) => {
          if (current === undefined) return current;
          return create(BotListResponseSchema, {
            bots: current.bots
              .filter((bot) => bot.profileId !== removedBotId)
              .map((bot) => ({
                ...bot,
                status: statusById.get(bot.profileId) ?? bot.status,
              })),
          });
        },
      );
      if (updatedList === undefined) return;
      const summary = summarizeBots(updatedList.bots);
      queryClient.setQueryData<InstanceInfoQueryData>(
        ["instance-info", instanceId],
        (current) =>
          current === undefined ? current : { ...current, botSummary: summary },
      );
      queryClient.setQueryData<InstanceListResponse>(
        ["instance-list"],
        (current) =>
          current === undefined
            ? current
            : create(InstanceListResponseSchema, {
                instances: current.instances.map((instance) =>
                  instance.id === instanceId
                    ? { ...instance, botSummary: summary }
                    : instance,
                ),
              }),
      );
    };

    void (async () => {
      try {
        for await (const event of client.watchBotStatuses(
          { instanceId },
          { signal: abortController.signal },
        )) {
          switch (event.event.case) {
            case "snapshot":
              patchStatuses(event.event.value.bots);
              break;
            case "update":
              patchStatuses([event.event.value]);
              break;
            case "removedBotId":
              patchStatuses([], event.event.value);
              break;
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Bot status stream ended", error);
        }
      }
    })();

    return () => abortController.abort();
  }, [instanceId, queryClient]);
}
