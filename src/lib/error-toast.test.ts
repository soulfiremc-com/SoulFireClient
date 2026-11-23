import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { init } from "i18next";
import { toast } from "sonner";
import { DemoReadOnlyError } from "@/lib/instance-mutations.ts";
import { describeError, toastMutation } from "./error-toast.ts";

// Sonner announces dismissals on the next frame.
if (!("requestAnimationFrame" in globalThis)) {
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) =>
      setTimeout(() => {
        callback(performance.now());
      }, 0),
  });
}

function shownToasts() {
  return toast.getToasts().flatMap((item) => ("dismiss" in item ? [] : [item]));
}

await init({
  lng: "en-US",
  resources: {
    "en-US": {
      common: {
        errorToast: {
          connection: "Could not reach the server.",
          authentication: "Sign in again.",
          permission: "No permission.",
        },
      },
    },
  },
});

test("connection problems get a fixed hint instead of the raw message", () => {
  assert.equal(
    describeError(new ConnectError("socket hang up", Code.Unavailable)),
    "Could not reach the server.",
  );
  assert.equal(
    describeError(new ConnectError("denied", Code.PermissionDenied)),
    "No permission.",
  );
});

test("other server errors show the server's message without the code prefix", () => {
  assert.equal(
    describeError(new ConnectError("Proxy address is invalid", Code.Internal)),
    "Proxy address is invalid",
  );
});

test("errors without a server message have no description", () => {
  assert.equal(describeError(new Error("boom")), undefined);
  assert.equal(describeError(new ConnectError("", Code.Internal)), undefined);
});

const messages = {
  loading: "Removing",
  success: "Removed",
  error: "Could not remove",
};

async function settle(promise: Promise<unknown>) {
  await promise.catch(() => undefined);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

test("a rejected demo write closes the loading toast without an error", async () => {
  const promise = Promise.reject(DemoReadOnlyError.make({}));
  await settle(toastMutation(promise, messages));
  const shown = new Set(shownToasts().map((item) => item.title));
  assert.ok(!shown.has("Removing"));
  assert.ok(!shown.has("Could not remove"));
});

test("a failed write replaces the loading toast with the reason", async () => {
  const promise = Promise.reject(
    new ConnectError("socket hang up", Code.Unavailable),
  );
  await settle(toastMutation(promise, messages));
  const failed = shownToasts().find(
    (item) => item.title === "Could not remove",
  );
  assert.equal(failed?.type, "error");
  assert.equal(failed.description, "Could not reach the server.");
  assert.ok(!shownToasts().some((item) => item.title === "Removing"));
});
