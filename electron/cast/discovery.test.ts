/// <reference types="bun" />
import { EventEmitter } from "node:events";
import { expect, test } from "bun:test";
import type { CastDevice } from "@soulfiremc/cast-protocol";
import { Effect, Exit, Fiber } from "effect";
import {
  CastDiscovery,
  makeCastDiscovery,
  type ServiceRecord,
} from "./discovery";

function fakeBonjour() {
  const mdns = new EventEmitter();
  const browser = new EventEmitter();
  let onUp: ((service: ServiceRecord) => void) | undefined;
  const state = { destroyed: false, stopped: false };
  const bonjour = {
    server: { mdns },
    destroy: () => {
      state.destroyed = true;
    },
    find: (_options: unknown, callback: (service: ServiceRecord) => void) => {
      onUp = callback;
      return {
        on: (event: "down", listener: (service: ServiceRecord) => void) => {
          browser.on(event, listener);
        },
        stop: () => {
          state.stopped = true;
        },
      };
    },
  };
  return {
    bonjour,
    mdns,
    browser,
    state,
    up: (service: ServiceRecord) => onUp?.(service),
  };
}

function browse(fake: ReturnType<typeof fakeBonjour>) {
  const up: CastDevice[] = [];
  const down: string[] = [];
  const fiber = Effect.runFork(
    Effect.flatMap(CastDiscovery, (service) =>
      service.browse({
        up: (device) => {
          up.push(device);
        },
        down: (id) => {
          down.push(id);
        },
      }),
    ).pipe(Effect.provide(makeCastDiscovery(() => fake.bonjour))),
  );
  return { fiber, up, down };
}

test("an mDNS socket error ends discovery and releases the socket", async () => {
  const fake = fakeBonjour();
  const { fiber } = browse(fake);
  await Bun.sleep(1);
  // Without a listener, Node would throw this event and end the process.
  fake.mdns.emit(
    "error",
    Object.assign(new Error("bind EADDRINUSE"), { code: "EADDRINUSE" }),
  );
  const exit = await Effect.runPromise(Fiber.await(fiber));
  expect(Exit.isFailure(exit)).toBe(true);
  expect(fake.state).toEqual({ destroyed: true, stopped: true });
});

test("only displays with video output and an address are reported", async () => {
  const fake = fakeBonjour();
  const { fiber, up, down } = browse(fake);
  await Bun.sleep(1);
  fake.up({
    name: "Living room",
    addresses: ["fe80::1", "192.0.2.10"],
    port: 8009,
    txt: { id: "tv", fn: "Living room TV", ca: "4101" },
  });
  fake.up({
    name: "Speaker",
    addresses: ["192.0.2.11"],
    port: 8009,
    txt: { id: "speaker", ca: "2052" },
  });
  fake.up({ name: "No id", addresses: ["192.0.2.12"], port: 8009 });
  fake.browser.emit("down", {
    name: "Living room",
    port: 8009,
    txt: { id: "tv" },
  });
  expect(up).toEqual([
    { id: "tv", name: "Living room TV", address: "192.0.2.10", port: 8009 },
  ]);
  expect(down).toEqual(["tv"]);
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(fake.state).toEqual({ destroyed: true, stopped: true });
});
