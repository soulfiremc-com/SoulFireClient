import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import type { Transport } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { ClientService } from "@/generated/soulfire/client_pb";

export function normalizeServerAddress(address: string) {
  const url = new URL(address.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Use an HTTP or HTTPS SoulFire server URL without credentials.",
    );
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function verifyServerConnection(
  address: string,
  token: string,
  signal?: AbortSignal,
  transport?: Transport,
) {
  const normalizedAddress = normalizeServerAddress(address);
  const client = createRpcClient(
    ClientService,
    transport ??
      createGrpcWebTransport({
        baseUrl: normalizedAddress,
        interceptors: [
          (next) => (request) => {
            request.header.set("Authorization", `Bearer ${token.trim()}`);
            return next(request);
          },
        ],
      }),
  );
  await Effect.runPromise(
    client.getClientData({}, { signal, timeoutMs: 15_000 }),
  );
  return normalizedAddress;
}
