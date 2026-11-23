import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { Stream } from "effect";
import { MinecraftAccountProtoSchema } from "@/generated/soulfire/common_pb";
import {
  type CredentialsAuthResponse,
  CredentialsAuthResponseSchema,
} from "@/generated/soulfire/mc-auth_pb";
import {
  type CredentialLoginProgress,
  collectCredentialLogins,
} from "@/lib/credential-login-stream.ts";

function success(profileId: string): CredentialsAuthResponse {
  return create(CredentialsAuthResponseSchema, {
    data: {
      case: "oneSuccess",
      value: {
        account: create(MinecraftAccountProtoSchema, { profileId }),
      },
    },
  });
}

const failure = create(CredentialsAuthResponseSchema, {
  data: { case: "oneFailure", value: {} },
});
const end = create(CredentialsAuthResponseSchema, {
  data: { case: "end", value: {} },
});

function profileIds(accounts: { profileId: string }[]) {
  return accounts.map((account) => account.profileId);
}

describe("collectCredentialLogins", () => {
  test("completes on end and reports progress", async () => {
    const progress: CredentialLoginProgress[] = [];
    const job = collectCredentialLogins(
      () => Stream.fromIterable([success("a"), failure, success("b"), end]),
      3,
      (entry) => {
        progress.push(entry);
      },
    );

    const result = await job.result;
    expect(result.outcome).toBe("complete");
    expect(profileIds(result.accounts)).toEqual(["a", "b"]);
    expect(result.failed).toBe(1);
    expect(progress.at(-1)).toEqual({
      checked: 3,
      total: 3,
      success: 2,
      failed: 1,
    });
  });

  test("keeps signed in accounts when the stream fails", async () => {
    const cause = new ConnectError("down", Code.Unavailable);
    const job = collectCredentialLogins(
      () =>
        Stream.concat(Stream.fromIterable([success("a")]), Stream.fail(cause)),
      2,
      () => {},
    );

    const result = await job.result;
    expect(result.outcome).toBe("error");
    expect(result.error).toBe(cause);
    expect(profileIds(result.accounts)).toEqual(["a"]);
  });

  test("treats a stream that closes without end as an error", async () => {
    const job = collectCredentialLogins(
      () => Stream.fromIterable([success("a")]),
      2,
      () => {},
    );

    const result = await job.result;
    expect(result.outcome).toBe("error");
    expect(profileIds(result.accounts)).toEqual(["a"]);
  });

  test("keeps signed in accounts on cancel and ignores later messages", async () => {
    let signal: AbortSignal | undefined;
    const job = collectCredentialLogins(
      (abortSignal) => {
        signal = abortSignal;
        return Stream.concat(Stream.fromIterable([success("a")]), Stream.never);
      },
      2,
      () => {},
    );
    // Let the first message arrive before the cancel.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    job.cancel();

    const result = await job.result;
    expect(signal?.aborted).toBe(true);
    expect(result.outcome).toBe("cancelled");
    expect(profileIds(result.accounts)).toEqual(["a"]);
  });
});
