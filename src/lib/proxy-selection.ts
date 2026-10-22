import type { ProfileProxy } from "@/lib/types.ts";

export function getProxyKey(proxy: ProfileProxy): string {
  return JSON.stringify([
    proxy.type,
    proxy.address,
    proxy.username ?? null,
    proxy.password ?? null,
  ]);
}

export type ProxyTableRow = ProfileProxy & { rowId: string };

export function getProxyRows(proxies: ProfileProxy[]): ProxyTableRow[] {
  const occurrences = new Map<string, number>();
  return proxies.map((proxy) => {
    const key = getProxyKey(proxy);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return { ...proxy, rowId: JSON.stringify([key, occurrence]) };
  });
}

export function removeProxyEntries(
  proxies: ProfileProxy[],
  selected: ProfileProxy[],
): ProfileProxy[] {
  const remaining = new Map<string, number>();
  for (const proxy of selected) {
    const key = getProxyKey(proxy);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return proxies.filter((proxy) => {
    const key = getProxyKey(proxy);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    if (count === 1) remaining.delete(key);
    else remaining.set(key, count - 1);
    return false;
  });
}
