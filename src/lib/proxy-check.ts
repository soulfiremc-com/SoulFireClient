import type { ProxyCheckResponse } from "@/generated/soulfire/proxy-check_pb";
import type { ProfileProxy } from "@/lib/types";

export async function checkProxies(
  responses: AsyncIterable<ProxyCheckResponse>,
  signal: AbortSignal,
  removeFailed: (proxies: ProfileProxy[]) => Promise<unknown>,
  onProgress: (progress: { success: number; failed: number }) => void,
) {
  let success = 0;
  let failed = 0;
  const failedProxies: ProfileProxy[] = [];
  for await (const response of responses) {
    signal.throwIfAborted();
    if (response.data.case === "end") {
      // Persist once, after consuming the results, instead of pausing the stream
      // for a settings write and query invalidation for every failed proxy.
      if (failedProxies.length) await removeFailed(failedProxies);
      signal.throwIfAborted();
      return { success, failed };
    }
    if (response.data.case !== "single") continue;
    const result = response.data.value;
    if (result.valid) success++;
    else {
      failed++;
      if (result.proxy) failedProxies.push(result.proxy);
    }
    onProgress({ success, failed });
  }
  signal.throwIfAborted();
  throw new Error("Proxy check ended without a completion message");
}
