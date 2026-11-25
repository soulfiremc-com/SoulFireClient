import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { jest } from "bun:test";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { AtomRegistry } from "effect/reactivity";
import { InstanceLiveService } from "@/generated/soulfire/instance_live_pb";
import { liveFeedAtom } from "./live-feed-atom.ts";

function chat(botName: string, text: string) {
  return {
    botName,
    event: { case: "chat" as const, value: { plainText: text } },
  };
}

/** Runs fake timers and lets the stream react between steps. */
async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    jest.advanceTimersByTime(50);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

const { requestAnimationFrame, cancelAnimationFrame } = globalThis;

beforeEach(() => {
  jest.useFakeTimers();
  const frames = new Map<number, ReturnType<typeof setTimeout>>();
  let nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => {
    const frame = ++nextFrame;
    frames.set(
      frame,
      setTimeout(() => {
        frames.delete(frame);
        callback(Date.now());
      }, 16),
    );
    return frame;
  };
  globalThis.cancelAnimationFrame = (frame) => {
    clearTimeout(frames.get(frame));
    frames.delete(frame);
  };
});

afterEach(() => {
  jest.useRealTimers();
  globalThis.requestAnimationFrame = requestAnimationFrame;
  globalThis.cancelAnimationFrame = cancelAnimationFrame;
});

test("the feed reconnects 3 seconds after an error and 1 second after the stream ends", async () => {
  const opened: number[] = [];
  let open = true;
  const transport = createRouterTransport((router) => {
    router.service(InstanceLiveService, {
      async *watchInstanceEvents(_request, context) {
        opened.push(Date.now());
        if (opened.length === 1) throw new ConnectError("", Code.Unavailable);
        yield chat("bot", `line ${opened.length}`);
        if (opened.length === 2) return;
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              open = false;
              resolve();
            },
            { once: true },
          );
        });
      },
    });
  });
  const registry = AtomRegistry.make();
  const atom = liveFeedAtom(transport, "instance", undefined);
  const unmount = registry.mount(atom);
  await advance(100);
  assert.equal(registry.get(atom).reconnecting, true);
  await advance(3000);
  assert.equal(opened.length, 2);
  // The second stream ends after its event, so the feed waits again.
  assert.equal(registry.get(atom).reconnecting, true);
  await advance(1000);
  assert.equal(opened.length, 3);
  assert.deepEqual(
    opened.slice(1).map((time, index) => time - (opened[index] ?? 0)),
    [3000, 1000],
  );
  const state = registry.get(atom);
  assert.equal(state.reconnecting, false);
  assert.deepEqual(
    state.entries.map((entry) => (entry.kind === "chat" ? entry.text : "")),
    ["line 2", "line 3"],
  );
  unmount();
  await advance(100);
  assert.equal(open, false);
  await advance(5000);
  assert.equal(opened.length, 3);
});

test("a bot feed shows only that bot and renders a burst of events once", async () => {
  const transport = createRouterTransport((router) => {
    router.service(InstanceLiveService, {
      async *watchInstanceEvents(_request, context) {
        for (const bot of ["a", "b", "a"]) yield chat(bot, `from ${bot}`);
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true },
          );
        });
      },
    });
  });
  const registry = AtomRegistry.make();
  const atom = liveFeedAtom(transport, "instance", "a");
  let renders = 0;
  const unmount = registry.subscribe(atom, () => {
    renders++;
  });
  try {
    await advance(200);
    assert.equal(renders, 1);
    assert.deepEqual(
      registry.get(atom).entries.map((entry) => entry.botNames),
      [["a"], ["a"]],
    );
  } finally {
    unmount();
  }
});
