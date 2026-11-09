import type { ConnectError } from "@connectrpc/connect";
import { Effect, Stream } from "effect";
import type { ProxyCheckResponse } from "@/generated/soulfire/proxy-check_pb";
import type { ProfileProxy } from "@/lib/types";

export async function checkProxies(
  responses: Stream.Stream<ProxyCheckResponse, ConnectError>,
  signal: AbortSignal,
  removeFailed: (proxies: ProfileProxy[]) => Promise<unknown>,
  onProgress: (progress: { success: number; failed: number }) => void,
) {
  let success = 0;
  let failed = 0;
  const failedProxies: ProfileProxy[] = [];
  let completed = false;
  try {
    await Effect.runPromise(
      responses.pipe(
        Stream.takeUntil((response) => response.data.case === "end"),
        Stream.runForEach((response) =>
          Effect.tryPromise({
            try: async () => {
              signal.throwIfAborted();
              if (response.data.case === "end") {
                // Persist once, after consuming the results, instead of pausing the stream
                // for a settings write and query invalidation for every failed proxy.
                if (failedProxies.length) await removeFailed(failedProxies);
                signal.throwIfAborted();
                completed = true;
                return;
              }
              if (response.data.case !== "single") return;
              const result = response.data.value;
              if (result.valid) success++;
              else {
                failed++;
                if (result.proxy) failedProxies.push(result.proxy);
              }
              onProgress({ success, failed });
            },
            catch: (error) => error,
          }),
        ),
      ),
      { signal },
    );
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  }
  signal.throwIfAborted();
  if (completed) return { success, failed };
  throw new Error("Proxy check ended without a completion message");
}
