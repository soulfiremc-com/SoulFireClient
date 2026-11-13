import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { QueryClient } from "@tanstack/react-query";
import {
  BotDesiredState,
  BotService,
  type RestartBotsRequest,
  type SetBotsDesiredStateRequest,
} from "@/generated/soulfire/bot_pb";
import {
  type DeactivateScriptRequest,
  ScriptService,
} from "@/generated/soulfire/script_pb";
import type { PaletteCommand, PaletteOperation } from "./command-palette";
import {
  InstanceConfigSchema,
  InstanceInfoSchema,
} from "@/generated/soulfire/instance_pb";
import { convertFromInstanceProto } from "./types";
import {
  isPaletteOperationPending,
  isPaletteOperationAvailable,
  needsPaletteConfirmation,
  runPaletteOperation,
  startPaletteOperation,
} from "./command-palette-operations";

test("selected operations must still be permitted and retain all of their original targets", () => {
  const command: PaletteCommand = {
    id: "stop-bots:farm",
    label: "Stop bots",
    icon: "square",
    group: "actions",
    projectId: "farm",
    operation: {
      kind: "bot",
      action: "stop",
      instanceId: "farm",
      botIds: ["a", "b"],
    },
  };
  const project = {
    ...create(InstanceInfoSchema),
    id: "farm",
    profile: convertFromInstanceProto(
      create(InstanceConfigSchema, {
        accounts: [{ profileId: "a" }, { profileId: "b" }, { profileId: "c" }],
      }),
    ),
  };
  assert.equal(isPaletteOperationAvailable(command, [command], project), true);
  assert.equal(isPaletteOperationAvailable(command, [], project), false);
  assert.equal(
    isPaletteOperationAvailable(command, [command], undefined),
    false,
  );
  assert.equal(
    isPaletteOperationAvailable(command, [command], {
      ...project,
      id: "other",
    }),
    false,
  );
  assert.equal(
    isPaletteOperationAvailable(
      command,
      [
        {
          ...command,
          operation: {
            ...command.operation!,
            kind: "bot",
            action: "stop",
            instanceId: "farm",
            botIds: ["b"],
          },
        },
      ],
      project,
    ),
    false,
  );
  assert.equal(
    isPaletteOperationAvailable(
      command,
      [
        {
          ...command,
          operation: {
            kind: "bot",
            action: "stop",
            instanceId: "farm",
            botIds: ["a", "b", "c"],
          },
        },
      ],
      project,
    ),
    true,
  );
  assert.equal(
    isPaletteOperationAvailable(command, [command], {
      ...project,
      profile: {
        ...project.profile,
        accounts: project.profile.accounts.filter(
          (account) => account.profileId !== "a",
        ),
      },
    }),
    false,
  );
  assert.equal(
    isPaletteOperationAvailable(
      command,
      [
        {
          ...command,
          operation: {
            kind: "bot",
            action: "start",
            instanceId: "farm",
            botIds: ["a", "b"],
          },
        },
      ],
      project,
    ),
    false,
  );
});

function recordingTransport() {
  const desired: SetBotsDesiredStateRequest[] = [];
  const restarts: RestartBotsRequest[] = [];
  const deactivations: DeactivateScriptRequest[] = [];
  const activations: string[] = [];
  const transport = createRouterTransport((router) => {
    router.service(BotService, {
      setBotsDesiredState: (request) => {
        desired.push(request);
        return {
          bots: request.botIds.map((profileId) => ({
            profileId,
            desiredState: request.desiredState,
          })),
        };
      },
      restartBots: (request) => {
        restarts.push(request);
        return { bots: request.botIds.map((profileId) => ({ profileId })) };
      },
    });
    router.service(ScriptService, {
      deactivateScript: (request) => {
        deactivations.push(request);
        return {};
      },
      async *activateScript(request) {
        activations.push(`${request.instanceId}/${request.scriptId}`);
        yield {
          event: {
            case: "scriptStarted",
            value: { scriptId: request.scriptId },
          },
        };
      },
    });
  });
  return { transport, desired, restarts, deactivations, activations };
}

test("bot operations send explicit project and bot IDs with the requested state", async () => {
  const rpc = recordingTransport();
  assert.equal(
    await runPaletteOperation(rpc.transport, {
      kind: "bot",
      instanceId: "farm",
      botIds: ["a", "b", "a"],
      action: "start",
    }),
    2,
  );
  await runPaletteOperation(rpc.transport, {
    kind: "bot",
    instanceId: "farm",
    botIds: ["c"],
    action: "stop",
  });
  await runPaletteOperation(rpc.transport, {
    kind: "bot",
    instanceId: "farm",
    botIds: ["d"],
    action: "restart",
  });
  assert.deepEqual(
    rpc.desired.map(({ instanceId, botIds, desiredState }) => ({
      instanceId,
      botIds,
      desiredState,
    })),
    [
      {
        instanceId: "farm",
        botIds: ["a", "b"],
        desiredState: BotDesiredState.RUNNING,
      },
      {
        instanceId: "farm",
        botIds: ["c"],
        desiredState: BotDesiredState.STOPPED,
      },
    ],
  );
  assert.deepEqual(
    rpc.restarts.map(({ instanceId, botIds }) => ({ instanceId, botIds })),
    [{ instanceId: "farm", botIds: ["d"] }],
  );
});

test("an empty bot target list is rejected before any request", async () => {
  const rpc = recordingTransport();
  for (const botIds of [[], [""]])
    await assert.rejects(
      runPaletteOperation(rpc.transport, {
        kind: "bot",
        instanceId: "farm",
        botIds,
        action: "stop",
      }),
      /no target bots/,
    );
  await assert.rejects(
    runPaletteOperation(rpc.transport, {
      kind: "bot",
      instanceId: "",
      botIds: ["a"],
      action: "stop",
    }),
    /no project/,
  );
  assert.equal(rpc.desired.length, 0);
});

test("script activation waits for the server acknowledgment and deactivation targets one script", async () => {
  const rpc = recordingTransport();
  await runPaletteOperation(rpc.transport, {
    kind: "script",
    instanceId: "farm",
    scriptId: "reconnect",
    action: "activate",
  });
  await runPaletteOperation(rpc.transport, {
    kind: "script",
    instanceId: "farm",
    scriptId: "reconnect",
    action: "deactivate",
  });
  assert.deepEqual(rpc.activations, ["farm/reconnect"]);
  assert.deepEqual(
    rpc.deactivations.map(({ instanceId, scriptId }) => ({
      instanceId,
      scriptId,
    })),
    [{ instanceId: "farm", scriptId: "reconnect" }],
  );
});

test("only bulk bot commands need confirmation", () => {
  const stop: PaletteOperation = {
    kind: "bot",
    instanceId: "farm",
    botIds: ["a"],
    action: "stop",
  };
  assert.equal(
    needsPaletteConfirmation({ id: "stop-bot:farm:a", operation: stop }),
    false,
  );
  assert.equal(
    needsPaletteConfirmation({ id: "stop-bots:farm", operation: stop }),
    true,
  );
  assert.equal(
    needsPaletteConfirmation({
      id: "retry-bots:farm",
      operation: { ...stop, botIds: ["a", "b"], action: "restart" },
    }),
    true,
  );
  assert.equal(
    needsPaletteConfirmation({
      id: "deactivate-script:farm:s",
      operation: {
        kind: "script",
        instanceId: "farm",
        scriptId: "s",
        action: "deactivate",
      },
    }),
    false,
  );
});

test("scoped operations report pending work and refresh affected queries when done", async () => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = createRouterTransport((router) =>
    router.service(BotService, {
      setBotsDesiredState: async (request) => {
        await released;
        return { bots: request.botIds.map((profileId) => ({ profileId })) };
      },
    }),
  );
  const queryClient = new QueryClient();
  const operation: PaletteOperation = {
    kind: "bot",
    instanceId: "farm",
    botIds: ["a", "b"],
    action: "stop",
  };
  for (const key of [
    ["bot-status", "farm"],
    ["instance-info", "farm"],
    ["instance-list"],
    ["bot-status", "other"],
  ])
    queryClient.setQueryData(key, {});
  const result = startPaletteOperation(queryClient, transport, operation);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(isPaletteOperationPending(queryClient, operation), true);
  assert.equal(
    isPaletteOperationPending(queryClient, { ...operation, instanceId: "x" }),
    false,
  );
  release();
  assert.equal(await result, 2);
  assert.equal(isPaletteOperationPending(queryClient, operation), false);
  const invalidated = (key: string[]) =>
    queryClient.getQueryState(key)?.isInvalidated;
  assert.equal(invalidated(["bot-status", "farm"]), true);
  assert.equal(invalidated(["instance-info", "farm"]), true);
  assert.equal(invalidated(["instance-list"]), true);
  assert.equal(invalidated(["bot-status", "other"]), false);
});
