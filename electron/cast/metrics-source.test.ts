/// <reference types="bun" />
import { afterEach, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { Effect, Exit, ManagedRuntime, Scope } from "effect";
import { InstanceService } from "../../src/generated/soulfire/instance_pb";
import {
  MetricsService,
  MetricsSnapshotSchema,
  type GetInstanceMetricsRequest,
} from "../../src/generated/soulfire/metrics_pb";
import { MetricsSource, makeMetricsSource } from "./metrics-source";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
});
async function fixture(code?: Code) {
  const requests: GetInstanceMetricsRequest[] = [];
  let infoRequests = 0;
  const transport = createRouterTransport((router) => {
    router.service(MetricsService, {
      getInstanceMetrics: (request) => {
        requests.push(request);
        if (code !== undefined)
          throw new ConnectError("test service failure", code);
        return {
          snapshots: [
            create(MetricsSnapshotSchema, {
              timestamp: { seconds: BigInt(requests.length), nanos: 123456789 },
              botsOnline: requests.length,
            }),
          ],
          distributions: {
            botPositions: Array.from({ length: 150 }, () => ({
              x: 1,
              z: 2,
              dimension: "minecraft:overworld",
            })),
          },
        };
      },
    });
    router.service(InstanceService, {
      getInstanceInfo: () => {
        infoRequests++;
        return {
          result: { case: "info", value: { friendlyName: "Instance" } },
        };
      },
    });
  });
  const runtime = ManagedRuntime.make(makeMetricsSource(() => transport));
  const scope = Scope.makeUnsafe();
  cleanup.push(async () => {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await runtime.dispose();
  });
  const feed = await runtime.runPromise(
    Effect.gen(function* () {
      const source = yield* MetricsSource;
      return yield* source.open({
        address: "http://unused",
        token: "unused",
        instanceId: "instance",
      });
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  );
  return {
    read: () => runtime.runPromise(feed.read),
    requests,
    infoRequests: () => infoRequests,
  };
}

test("polling uses exact RPC timestamps, merges history, and bounds positions", async () => {
  const f = await fixture();
  const first = await f.read();
  const second = await f.read();
  expect(f.requests[0].since).toBeUndefined();
  expect(f.requests[1].since?.seconds).toBe(1n);
  expect(f.requests[1].since?.nanos).toBe(123456789);
  expect(second.snapshots.map((sample) => sample.botsOnline)).toEqual([1, 2]);
  expect(first.distributions.botPositions).toHaveLength(100);
  expect(f.infoRequests()).toBe(1);
});

test("permission and authentication errors do not retry; transient RPC errors can recover", async () => {
  for (const [code, retryable] of [
    [Code.PermissionDenied, false],
    [Code.Unauthenticated, false],
    [Code.Unavailable, true],
  ] as const) {
    const f = await fixture(code);
    const error = await f.read().then(
      () => null,
      (error: { retryable: boolean }) => error,
    );
    expect(error?.retryable).toBe(retryable);
    expect(f.requests).toHaveLength(1);
  }
});
