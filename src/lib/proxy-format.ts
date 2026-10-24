import URI from "urijs";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import { stripAddressPrefix } from "@/lib/proxy-address";
import type { ProfileProxy } from "@/lib/types";

const URI_PROXY_TYPES = new Map([
  ["http", ProxyProto_Type.HTTP],
  ["socks4", ProxyProto_Type.SOCKS4],
  ["socks5", ProxyProto_Type.SOCKS5],
]);

export function parseNormalProxy(
  line: string,
  type: ProxyProto_Type,
): ProfileProxy {
  const endpointPattern = /^(\[[^\]]+\]|[^:@\s]+):(\d+)(?::(.*))?$/;
  const flatParts = endpointPattern.exec(line);
  const atIndex = flatParts ? -1 : line.lastIndexOf("@");
  const endpoint = atIndex === -1 ? line : line.slice(atIndex + 1);
  const parts = flatParts ?? endpointPattern.exec(endpoint);
  if (!parts || (atIndex !== -1 && parts[3] !== undefined)) {
    throw new Error("Invalid proxy format");
  }
  const port = Number(parts[2]);
  if (port < 1 || port > 65535) throw new Error("Invalid proxy port");

  const credentials = atIndex === -1 ? parts[3] : line.slice(0, atIndex);
  const separator = credentials?.indexOf(":") ?? -1;
  const username =
    separator === -1 ? credentials : credentials?.slice(0, separator);
  const password =
    separator === -1 ? undefined : credentials?.slice(separator + 1);
  const address = `${parts[1]}:${parts[2]}`;
  return {
    type,
    address: address.startsWith("/")
      ? `unix://${address}`
      : `inet://${address}`,
    username,
    password,
  };
}

export function parseURIProxy(line: string): ProfileProxy | null {
  const uri = new URI(line);
  const type = URI_PROXY_TYPES.get(uri.protocol());
  if (type === undefined) return null;
  // URI.js normalizes hostless HTTP URLs; read Unix socket paths from the input.
  const unixPath = /^[^:]+:\/\/(?:[^/]*@)?(\/[^?#]*)/.exec(line)?.[1];
  const host = uri.host();
  if (!unixPath && !host) throw new Error("Invalid proxy address");
  return {
    type,
    address: unixPath ? `unix://${unixPath}` : `inet://${host}`,
    username: uri.username() === "" ? undefined : uri.username(),
    password: uri.password() === "" ? undefined : uri.password(),
  };
}

export function formatProxyAsURI(proxy: ProfileProxy): string {
  const address = stripAddressPrefix(proxy.address);
  const protocol = ProxyProto_Type[proxy.type].toLowerCase();
  if (proxy.username) {
    const username = encodeURIComponent(proxy.username);
    const credentials = proxy.password
      ? `${username}:${encodeURIComponent(proxy.password)}`
      : username;
    return `${protocol}://${credentials}@${address}`;
  }
  return `${protocol}://${address}`;
}

export function formatProxyAsFlat(proxy: ProfileProxy): string {
  const address = stripAddressPrefix(proxy.address);
  if (proxy.username && proxy.password) {
    return `${address}:${proxy.username}:${proxy.password}`;
  }
  return proxy.username ? `${address}:${proxy.username}` : address;
}
