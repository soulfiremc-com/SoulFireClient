import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { Effect, Stream } from "effect";
import { Atom, AtomRegistry } from "effect/reactivity";
import {
  makeScriptActivationAtom,
  makeScriptValidationAtom,
  SCRIPT_VALIDATION_DELAY_MS,
  type ScriptActivation,
} from "./script-editor-atoms";

const settle = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function mounted(atom: Atom.Atom<unknown>) {
  const registry = AtomRegistry.make();
  registry.mount(atom);
  return registry;
}

function activation(
  events: Stream.Stream<string, unknown>,
  calls: string[],
  name: string,
): ScriptActivation<string> {
  return {
    events,
    onEvent: (event) => {
      calls.push(`${name}:${event}`);
    },
    onError: (error) => {
      calls.push(`${name}:error:${ConnectError.from(error).rawMessage}`);
    },
    onComplete: () => {
      calls.push(`${name}:complete`);
    },
  };
}

test("a newer activation stops the stream of the older one", async () => {
  const atom = makeScriptActivationAtom<string>();
  const registry = mounted(atom);
  const calls: string[] = [];
  registry.set(
    atom,
    activation(
      Stream.concat(Stream.make("started"), Stream.never),
      calls,
      "old",
    ),
  );
  await settle();
  registry.set(atom, activation(Stream.make("started"), calls, "new"));
  await settle();
  registry.set(atom, Atom.Interrupt);
  await settle();
  assert.deepEqual(calls, ["old:started", "new:started", "new:complete"]);
});

test("stopping an activation calls none of its handlers", async () => {
  const atom = makeScriptActivationAtom<string>();
  const registry = mounted(atom);
  const calls: string[] = [];
  registry.set(atom, activation(Stream.never, calls, "run"));
  registry.set(atom, Atom.Interrupt);
  await settle();
  assert.deepEqual(calls, []);
});

test("activation failures reach the error handler except server cancellation", async () => {
  const atom = makeScriptActivationAtom<string>();
  const registry = mounted(atom);
  const calls: string[] = [];
  registry.set(
    atom,
    activation(
      Stream.fail(new ConnectError("stopped", Code.Canceled)),
      calls,
      "canceled",
    ),
  );
  await settle();
  registry.set(
    atom,
    activation(
      Stream.fail(new ConnectError("offline", Code.Unavailable)),
      calls,
      "failed",
    ),
  );
  await settle();
  registry.set(atom, {
    ...activation(Stream.make("bad"), calls, "throws"),
    onEvent: () => {
      throw new Error("handler failed");
    },
  });
  await settle();
  assert.deepEqual(calls, [
    "failed:error:offline",
    "throws:error:handler failed",
  ]);
});

test("validation waits for a pause and a newer graph replaces the older one", async () => {
  const atom = makeScriptValidationAtom<string>();
  const registry = mounted(atom);
  const validated: string[] = [];
  const results: string[] = [];
  const validate = (graph: string) => ({
    validate: Effect.sync(() => {
      validated.push(graph);
      return graph;
    }),
    onDiagnostics: (diagnostics: string) => {
      results.push(diagnostics);
    },
  });
  registry.set(atom, validate("first"));
  await settle(SCRIPT_VALIDATION_DELAY_MS / 2);
  registry.set(atom, validate("second"));
  await settle(SCRIPT_VALIDATION_DELAY_MS / 2);
  assert.deepEqual(validated, []);
  await settle(SCRIPT_VALIDATION_DELAY_MS);
  assert.deepEqual(validated, ["second"]);
  assert.deepEqual(results, ["second"]);
});

test("a failed validation keeps the last successful diagnostics", async () => {
  const atom = makeScriptValidationAtom<string[]>();
  const registry = mounted(atom);
  let diagnostics = ["unchanged"];
  registry.set(atom, {
    validate: Effect.fail(new ConnectError("offline", Code.Unavailable)),
    onDiagnostics: (next) => {
      diagnostics = next;
    },
  });
  await settle(SCRIPT_VALIDATION_DELAY_MS + 50);
  assert.deepEqual(diagnostics, ["unchanged"]);
  registry.set(atom, {
    validate: Effect.succeed(["fresh"]),
    onDiagnostics: (next) => {
      diagnostics = next;
    },
  });
  await settle(SCRIPT_VALIDATION_DELAY_MS + 50);
  assert.deepEqual(diagnostics, ["fresh"]);
});
