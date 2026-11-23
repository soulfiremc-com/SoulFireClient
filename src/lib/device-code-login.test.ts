import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { Stream } from "effect";
import { MinecraftAccountProtoSchema } from "@/generated/soulfire/common_pb";
import {
  type DeviceCodeAuthResponse,
  DeviceCodeAuthResponseSchema,
} from "@/generated/soulfire/mc-auth_pb";
import {
  type DeviceCodeData,
  watchDeviceCodeLogin,
} from "@/lib/device-code-login.ts";

const code = create(DeviceCodeAuthResponseSchema, {
  data: {
    case: "deviceCode",
    value: {
      userCode: "ABCD",
      verificationUri: "https://example.test",
      directVerificationUri: "https://example.test/?code=ABCD",
    },
  },
});

function account(profileId: string): DeviceCodeAuthResponse {
  return create(DeviceCodeAuthResponseSchema, {
    data: {
      case: "account",
      value: create(MinecraftAccountProtoSchema, { profileId }),
    },
  });
}

describe("watchDeviceCodeLogin", () => {
  test("shows the code, then resolves with the account", async () => {
    const codes: DeviceCodeData[] = [];
    const job = watchDeviceCodeLogin(
      () => Stream.fromIterable([code, account("a")]),
      (entry) => {
        codes.push(entry);
      },
    );

    const result = await job.result;
    expect(codes.map((entry) => entry.userCode)).toEqual(["ABCD"]);
    expect(result.outcome).toBe("account");
    expect(result.outcome === "account" && result.account.profileId).toBe("a");
  });

  test("reports an error when the stream ends without an account", async () => {
    const job = watchDeviceCodeLogin(
      () => Stream.fromIterable([code]),
      () => {},
    );
    expect((await job.result).outcome).toBe("error");
  });

  test("reports stream failures", async () => {
    const cause = new ConnectError("down", Code.Unavailable);
    const job = watchDeviceCodeLogin(
      () => Stream.fail(cause),
      () => {},
    );
    expect(await job.result).toEqual({ outcome: "error", error: cause });
  });

  test("cancel aborts the stream and settles as cancelled", async () => {
    let signal: AbortSignal | undefined;
    const job = watchDeviceCodeLogin(
      (abortSignal) => {
        signal = abortSignal;
        return Stream.concat(Stream.fromIterable([code]), Stream.never);
      },
      () => {},
    );
    job.cancel();
    expect(await job.result).toEqual({ outcome: "cancelled" });
    expect(signal?.aborted).toBe(true);
  });
});
