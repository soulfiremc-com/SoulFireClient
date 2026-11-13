import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import type { Transport } from "@connectrpc/connect";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { BotDesiredState, BotService } from "@/generated/soulfire/bot_pb";
import { ScriptService } from "@/generated/soulfire/script_pb";
import type { PaletteCommand, PaletteOperation } from "@/lib/command-palette";
import { resumeScript } from "@/lib/resume-script";
import type { InstanceInfoQueryData } from "@/lib/types";

const BULK_BOT_COMMAND = /^(start|stop|retry)-bots:/;

/** Revalidate a selected request against the current permitted catalog and targets. */
export function isPaletteOperationAvailable(
  command: PaletteCommand,
  commands: readonly PaletteCommand[],
  project: InstanceInfoQueryData | undefined,
): boolean {
  const operation = command.operation;
  const liveCommand = commands.find((entry) => entry.id === command.id);
  const live = liveCommand?.operation;
  if (
    !operation ||
    !live ||
    !project ||
    command.projectId !== operation.instanceId ||
    liveCommand?.projectId !== command.projectId ||
    project.id !== operation.instanceId ||
    live.instanceId !== operation.instanceId ||
    live.kind !== operation.kind ||
    live.action !== operation.action
  )
    return false;
  if (operation.kind === "script")
    return live.kind === "script" && live.scriptId === operation.scriptId;
  if (live.kind !== "bot" || !operation.botIds.length) return false;
  const accounts = new Set(
    project.profile.accounts.map((account) => account.profileId),
  );
  const eligible = new Set(live.botIds);
  return operation.botIds.every((id) => accounts.has(id) && eligible.has(id));
}

/** Bulk bot commands change a fixed group of bots, so they need confirmation. */
export function needsPaletteConfirmation(
  command: Pick<PaletteCommand, "id" | "operation">,
): boolean {
  return (
    command.operation?.kind === "bot" &&
    (command.operation.botIds.length > 1 || BULK_BOT_COMMAND.test(command.id))
  );
}

/** Share the bot controls scope so palette and page requests run in order. */
export function paletteOperationScope(operation: PaletteOperation): string {
  return operation.kind === "bot"
    ? `bot-state-${operation.instanceId}`
    : `script-state-${operation.instanceId}-${operation.scriptId}`;
}

export function paletteOperationQueryKeys(
  operation: PaletteOperation,
): QueryKey[] {
  const id = operation.instanceId;
  return operation.kind === "bot"
    ? [
        ["bot-status", id],
        ["instance-info", id],
        ["instance-metrics", id],
        ["instance-list"],
      ]
    : [
        ["scripts", id],
        ["script", id, operation.scriptId],
        ["script-status", id, operation.scriptId],
      ];
}

/**
 * Send one palette operation with the explicit project and target IDs.
 * Resolves with the number of bots or scripts the server accepted.
 */
export async function runPaletteOperation(
  transport: Transport,
  operation: PaletteOperation,
  signal?: AbortSignal,
): Promise<number> {
  if (!operation.instanceId) throw new Error("The operation has no project.");
  if (operation.kind === "script") {
    if (!operation.scriptId) throw new Error("The operation has no script.");
    if (operation.action === "activate") {
      await resumeScript(transport, operation.instanceId, operation.scriptId);
    } else {
      await Effect.runPromise(
        createRpcClient(ScriptService, transport).deactivateScript(
          { instanceId: operation.instanceId, scriptId: operation.scriptId },
          { signal },
        ),
      );
    }
    return 1;
  }
  // An empty list can mean every bot to the server, so never send one.
  const botIds = [...new Set(operation.botIds.filter(Boolean))];
  if (!botIds.length) throw new Error("The operation has no target bots.");
  const client = createRpcClient(BotService, transport);
  const response =
    operation.action === "restart"
      ? await Effect.runPromise(
          client.restartBots(
            { instanceId: operation.instanceId, botIds },
            { signal },
          ),
        )
      : await Effect.runPromise(
          client.setBotsDesiredState(
            {
              instanceId: operation.instanceId,
              botIds,
              desiredState:
                operation.action === "start"
                  ? BotDesiredState.RUNNING
                  : BotDesiredState.STOPPED,
            },
            { signal },
          ),
        );
  return response.bots.length;
}

export function isPaletteOperationPending(
  queryClient: QueryClient,
  operation: PaletteOperation,
): boolean {
  const scope = paletteOperationScope(operation);
  return (
    queryClient.isMutating({
      predicate: (mutation) => mutation.options.scope?.id === scope,
    }) > 0
  );
}

/**
 * Run an operation as a scoped mutation. It keeps running and refreshes the
 * affected queries after the command menu closes.
 */
export function startPaletteOperation(
  queryClient: QueryClient,
  transport: Transport,
  operation: PaletteOperation,
): Promise<number> {
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationKey: [
      "command-palette",
      operation.kind,
      operation.action,
      operation.instanceId,
    ],
    scope: { id: paletteOperationScope(operation) },
    mutationFn: () => runPaletteOperation(transport, operation),
    onSettled: () =>
      Promise.all(
        paletteOperationQueryKeys(operation).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
  return mutation.execute(undefined);
}
