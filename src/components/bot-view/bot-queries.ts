import { create } from "@bufbuild/protobuf";
import { ConnectError } from "@connectrpc/connect";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { toast } from "sonner";
import { demoBotInfo } from "@/demo-data.ts";
import {
  type BotGetDialogResponse,
  BotGetDialogResponseSchema,
  type BotInfoResponse,
  type BotInventoryStateResponse,
  BotService,
} from "@/generated/soulfire/bot_pb";
import { isBotNotReadyError } from "@/lib/bot-availability";
import { toastError as sharedToastError } from "@/lib/error-toast.ts";
import i18n from "@/lib/i18n";
import { createRpcClient } from "@/lib/rpc";
import { createTransport } from "@/lib/web-rpc.ts";

export function botInfoQueryOptions(instanceId: string, botId: string) {
  return queryOptions({
    queryKey: ["bot-info", instanceId, botId],
    queryFn: async ({ signal }): Promise<BotInfoResponse> => {
      const transport = createTransport();
      if (transport === null) return demoBotInfo;
      return Effect.runPromise(
        createRpcClient(BotService, transport).getBotInfo(
          { instanceId, botId },
          { signal },
        ),
      );
    },
    refetchInterval: 1000,
  });
}

// The online state stays out of these keys. A bot that connects or disconnects
// keeps its cached state, so panels neither suspend nor lose drafts. The server
// answers an offline bot with FAILED_PRECONDITION, which reads as "no state".

/** Inventory and open container. Callers poll it only while the bot is online. */
export function inventoryStateQueryOptions(instanceId: string, botId: string) {
  return queryOptions({
    queryKey: ["inventory-state", instanceId, botId],
    queryFn: async ({ signal }): Promise<BotInventoryStateResponse | null> => {
      const transport = createTransport();
      if (transport === null) return null;
      try {
        return await Effect.runPromise(
          createRpcClient(BotService, transport).getInventoryState(
            { instanceId, botId },
            { signal },
          ),
        );
      } catch (error) {
        // The bot can go offline or leave its world between status polls.
        if (isBotNotReadyError(error)) return null;
        throw error;
      }
    },
  });
}

/** The server dialog on screen. Callers poll it only while the bot is online. */
export function botDialogQueryOptions(instanceId: string, botId: string) {
  return queryOptions({
    queryKey: ["bot-dialog", instanceId, botId],
    queryFn: async ({ signal }): Promise<BotGetDialogResponse> => {
      const transport = createTransport();
      if (transport === null) return create(BotGetDialogResponseSchema);
      try {
        return await Effect.runPromise(
          createRpcClient(BotService, transport).getDialog(
            { instanceId, botId },
            { signal },
          ),
        );
      } catch (error) {
        if (isBotNotReadyError(error))
          return create(BotGetDialogResponseSchema);
        throw error;
      }
    },
  });
}

/** Creates a bot RPC client, or fails with a translated message in the demo. */
export function createBotClient() {
  const transport = createTransport();
  if (transport === null) throw new Error(i18n.t("instance:bots.notConnected"));
  return createRpcClient(BotService, transport);
}

/**
 * Shows a failed bot action. Connection and permission errors get the shared
 * hints. A rejected action shows the server's reason from its response.
 */
export function toastError(
  title: string,
  error: Error,
  options?: { id?: string | number },
) {
  if (error instanceof ConnectError) {
    sharedToastError(title, error, options);
    return;
  }
  toast.error(title, { ...options, description: error.message || undefined });
}
