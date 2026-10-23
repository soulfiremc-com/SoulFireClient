import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  type CommandCompletion,
  CommandCompletionSchema,
} from "@/generated/soulfire/command_pb";
import { CommandCompletionRequest } from "./command-completion-request";

function deferred() {
  let resolve!: (value: CommandCompletion[]) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<CommandCompletion[]>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const suggestions = () => [create(CommandCompletionSchema)];

test("only the latest completion can survive out-of-order replies", async () => {
  const request = new CommandCompletionRequest();
  const old = deferred();
  let oldSignal!: AbortSignal;
  const pending = request.run((signal) => {
    oldSignal = signal;
    return old.promise;
  });
  const values = suggestions();
  const latest = await request.run(async () => values);
  assert.equal(oldSignal.aborted, true);
  assert.equal(latest?.suggestions, values);
  old.resolve(suggestions());
  assert.equal(await pending, undefined);
  request.cancel();
  assert.equal(latest?.signal.aborted, true);
});

test("cancellation suppresses late failures and successful replies", async () => {
  const request = new CommandCompletionRequest();
  const failed = deferred();
  const pendingFailure = request.run(() => failed.promise);
  request.cancel();
  failed.reject(new Error());
  assert.equal(await pendingFailure, undefined);
  const succeeded = deferred();
  const pendingSuccess = request.run(() => succeeded.promise);
  request.cancel();
  succeeded.resolve(suggestions());
  assert.equal(await pendingSuccess, undefined);
});

test("a current failure is reported and a retry can still succeed", async () => {
  const request = new CommandCompletionRequest();
  const failure = new Error();
  await assert.rejects(
    request.run(async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  const values = suggestions();
  assert.equal((await request.run(async () => values))?.suggestions, values);
});
