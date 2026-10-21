import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { ScriptService } from "@/generated/soulfire/script_pb";
import { resumeScript } from "./resume-script";

test("resume waits for acknowledgement and releases the monitoring stream", async () => {
  let acknowledge = () => {};
  const acknowledgement = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  let received = () => {};
  const requestReceived = new Promise<void>((resolve) => {
    received = resolve;
  });
  let completed = false;
  let signal: AbortSignal | undefined;
  const transport = createRouterTransport(
    (router) => {
      router.service(ScriptService, {
        async *activateScript(request) {
          assert.equal(request.instanceId, "instance");
          assert.equal(request.scriptId, "script");
          yield {
            event: { case: "nodeStarted", value: { nodeId: "trigger" } },
          };
          received();
          await acknowledgement;
          yield {
            event: {
              case: "scriptStarted",
              value: { scriptId: request.scriptId },
            },
          };
        },
      });
    },
    {
      transport: {
        interceptors: [
          (next) => (request) => {
            signal = request.signal;
            return next(request);
          },
        ],
      },
    },
  );
  const resumed = resumeScript(transport, "instance", "script").then(() => {
    completed = true;
  });
  await requestReceived;
  assert.equal(completed, false);
  acknowledge();
  await resumed;
  assert.equal(signal?.aborted, true);
});

test("resume propagates server rejection after progress events", async () => {
  const transport = createRouterTransport((router) => {
    router.service(ScriptService, {
      async *activateScript() {
        yield { event: { case: "nodeStarted", value: { nodeId: "trigger" } } };
        throw new ConnectError("Invalid graph", Code.InvalidArgument);
      },
    });
  });
  await assert.rejects(
    resumeScript(transport, "instance", "script"),
    (error) =>
      error instanceof ConnectError && error.code === Code.InvalidArgument,
  );
});

test("resume rejects a stream that ends before acknowledgement", async () => {
  const transport = createRouterTransport((router) => {
    router.service(ScriptService, {
      async *activateScript() {
        yield { event: { case: "nodeStarted", value: { nodeId: "trigger" } } };
      },
    });
  });
  await assert.rejects(resumeScript(transport, "instance", "script"));
});
