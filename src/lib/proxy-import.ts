import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import { parseNormalProxy, parseURIProxy } from "@/lib/proxy-format";
import type { ProfileProxy } from "@/lib/types";

export type ProxyImport = {
  proxies: ProfileProxy[];
  rejectedLines: number[];
};

export function parseProxyImport(
  text: string,
  type: ProxyProto_Type | "uri",
): ProxyImport {
  const result: ProxyImport = { proxies: [], rejectedLines: [] };
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const proxy =
        type === "uri" ? parseURIProxy(line) : parseNormalProxy(line, type);
      if (proxy) result.proxies.push(proxy);
      else result.rejectedLines.push(index + 1);
    } catch {
      result.rejectedLines.push(index + 1);
    }
  }
  return result;
}
