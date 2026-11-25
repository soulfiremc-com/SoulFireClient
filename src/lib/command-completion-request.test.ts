import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { ConnectError } from "@connectrpc/connect";
import { Effect } from "effect";
import { Atom, AtomRegistry } from "effect/reactivity";
import {
  type CommandCompletion,
  CommandCompletionSchema,
} from "@/generated/soulfire/command_pb";
import {
  type CommandCompletionRequest,
  makeCommandCompletionAtom,
} from "./command-completion-request";

const settle = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const suggestions = () => [create(CommandCompletionSchema)];

function recorder() {
  const received: CommandCompletion[][] = [];
  const failures: unknown[] = [];
  return {
    received,
    failures,
    request: (
      load: CommandCompletionRequest["load"],
      delayMs = 0,
    ): CommandCompletionRequest => ({
      delayMs,
      load,
      onSuggestions: (values) => {
        received.push(values);
      },
      onFailure: (error) => {
        failures.push(error);
      },
    }),
  };
}

function setup() {
  const atom = makeCommandCompletionAtom();
  const registry = AtomRegistry.make();
  registry.mount(atom);
  return { atom, registry };
}

test("a newer completion request interrupts the older one", async () => {
  const { atom, registry } = setup();
  const { received, failures, request } = recorder();
  let oldInterrupted = false;
  registry.set(
    atom,
    request(
      Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            oldInterrupted = true;
          }),
        ),
      ),
    ),
  );
  await settle();
  const values = suggestions();
  registry.set(atom, request(Effect.succeed(values)));
  await settle();
  assert.equal(oldInterrupted, true);
  assert.deepEqual(received, [values]);
  assert.deepEqual(failures, []);
});

test("debounced requests start only after typing pauses", async () => {
  const { atom, registry } = setup();
  const { received, request } = recorder();
  let loads = 0;
  const load = Effect.sync(() => {
    loads++;
    return suggestions();
  });
  registry.set(atom, request(load, 20));
  await settle(5);
  registry.set(atom, request(load, 20));
  await settle(5);
  assert.equal(loads, 0);
  await settle(30);
  assert.equal(loads, 1);
  assert.equal(received.length, 1);
});

test("interrupting suppresses a late failure, and a later request still works", async () => {
  const { atom, registry } = setup();
  const { received, failures, request } = recorder();
  registry.set(
    atom,
    request(Effect.fail(new ConnectError("Test failure")), 10),
  );
  registry.set(atom, Atom.Interrupt);
  await settle(20);
  assert.deepEqual(failures, []);
  const failure = new ConnectError("Current failure");
  registry.set(atom, request(Effect.fail(failure)));
  await settle();
  assert.deepEqual(failures, [failure]);
  const values = suggestions();
  registry.set(atom, request(Effect.succeed(values)));
  await settle();
  assert.deepEqual(received, [values]);
});
