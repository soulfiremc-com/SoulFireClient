import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import type { Transport } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { ClientService } from "@/generated/soulfire/client_pb";

/** SoulFire servers speak gRPC-Web over HTTP(S), and tokens carry the credentials. */
export function isSupportedServerUrl(address: string) {
  if (!URL.canParse(address.trim())) return false;
  const url = new URL(address.trim());
  return (
    ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
  );
}

export function normalizeServerAddress(address: string) {
  if (!isSupportedServerUrl(address)) {
    throw new Error(`Unsupported SoulFire server URL: ${address}`);
  }
  const url = new URL(address.trim());
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
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
    client.getClientData({}, { ...(signal && { signal }), timeoutMs: 15_000 }),
  );
  return normalizedAddress;
}
