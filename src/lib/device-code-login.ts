import type { ConnectError } from "@connectrpc/connect";
import type { Stream } from "effect";
import type { DeviceCodeAuthResponse } from "@/generated/soulfire/mc-auth_pb";
import { observeServerStream } from "@/lib/protobuf.ts";
import type { ProfileAccount } from "@/lib/types.ts";

export interface DeviceCodeData {
  userCode: string;
  verificationUri: string;
  directVerificationUri: string;
}

export type DeviceCodeLoginResult =
  | { outcome: "account"; account: ProfileAccount }
  | { outcome: "cancelled" }
  | { outcome: "error"; error: unknown };

export interface DeviceCodeLoginJob {
  result: Promise<DeviceCodeLoginResult>;
  cancel: () => void;
}

/**
 * Reads one device code login stream. The job settles once: with the signed
 * in account, when cancel() runs, or when the stream fails or ends without
 * an account.
 */
export function watchDeviceCodeLogin(
  open: (
    signal: AbortSignal,
  ) => Stream.Stream<DeviceCodeAuthResponse, ConnectError>,
  onCode: (code: DeviceCodeData) => void,
): DeviceCodeLoginJob {
  const controller = new AbortController();
  let settled = false;
  // The Promise executor runs at once, so this is set before any use.
  let resolveResult: ((result: DeviceCodeLoginResult) => void) | undefined;
  const result = new Promise<DeviceCodeLoginResult>((resolve) => {
    resolveResult = resolve;
  });
  const finish = (next: DeviceCodeLoginResult) => {
    if (settled) return;
    settled = true;
    resolveResult?.(next);
  };

  void observeServerStream(open(controller.signal), {
    onMessage: (response) => {
      if (settled) return;
      const data = response.data;
      if (data.case === "account") {
        finish({ outcome: "account", account: data.value });
      } else if (data.case === "deviceCode") {
        onCode({
          userCode: data.value.userCode,
          verificationUri: data.value.verificationUri,
          directVerificationUri: data.value.directVerificationUri,
        });
      }
    },
    onError: (error) => {
      finish({ outcome: "error", error });
    },
  }).then(() => {
    // A stream that closes without an account did not sign in.
    finish(
      controller.signal.aborted
        ? { outcome: "cancelled" }
        : { outcome: "error", error: new Error("Sign-in ended early") },
    );
  });

  return {
    result,
    cancel: () => {
      controller.abort();
      finish({ outcome: "cancelled" });
    },
  };
}
