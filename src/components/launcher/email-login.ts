import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { LoginService } from "@/generated/soulfire/login_pb";
import { createAddressOnlyTransport } from "@/lib/web-rpc.ts";

function loginClient(address: string) {
  return createRpcClient(LoginService, createAddressOnlyTransport(address));
}

/** Asks the server to email a sign-in code and returns the flow token. */
export async function requestEmailCode(
  address: string,
  email: string,
  signal: AbortSignal,
) {
  const response = await Effect.runPromise(
    loginClient(address).login({ email }, { signal, timeoutMs: 15_000 }),
  );
  return response.authFlowToken;
}

/** Returns the API token, or null when the server rejected the code. */
export async function verifyEmailCode(
  address: string,
  flowToken: string,
  code: string,
  signal: AbortSignal,
) {
  const response = await Effect.runPromise(
    loginClient(address).emailCode(
      { code, authFlowToken: flowToken },
      { signal, timeoutMs: 15_000 },
    ),
  );
  return response.next.case === "success" ? response.next.value.token : null;
}
