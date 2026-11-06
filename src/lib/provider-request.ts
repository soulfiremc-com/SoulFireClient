import { Context, Effect } from "effect";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import {
  executeProviderRequestEffect,
  type ProviderRequest,
  type ProviderResponse,
  validateProviderRequest,
} from "@/lib/provider-request-policy.ts";

export type ProviderFetch = (
  request: ProviderRequest,
  signal?: AbortSignal,
) => Promise<ProviderResponse>;

export class ProviderApiError extends Error {
  constructor(
    readonly reason:
      | "network"
      | "authentication"
      | "rejected"
      | "response"
      | "empty"
      | "limit"
      | "priceChanged",
  ) {
    super(`Provider request failed: ${reason}`);
    this.name = "ProviderApiError";
  }
}

export class ProviderHttp extends Context.Service<
  ProviderHttp,
  {
    readonly request: (
      request: ProviderRequest,
    ) => Effect.Effect<ProviderResponse, ProviderApiError>;
  }
>()("soulfire/ProviderHttp") {}

const providerHttp: Context.Service.Shape<typeof ProviderHttp> = {
  request: (request) =>
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => validateProviderRequest(request),
        catch: () => new ProviderApiError("network"),
      });
      if (isDesktopApp())
        return yield* Effect.tryPromise({
          try: () => desktop.providers.request(request),
          catch: () => new ProviderApiError("network"),
        });
      return yield* executeProviderRequestEffect(request).pipe(
        Effect.mapError(() => new ProviderApiError("network")),
      );
    }),
};

export async function runProviderEffect<A, E>(
  effect: Effect.Effect<A, E, ProviderHttp>,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<A> {
  signal?.throwIfAborted();
  const service = fetcher
    ? {
        request: (request: ProviderRequest) =>
          Effect.tryPromise({
            try: (signal) => fetcher(request, signal),
            catch: (error) =>
              error instanceof ProviderApiError
                ? error
                : new ProviderApiError("network"),
          }),
      }
    : providerHttp;
  try {
    const result = await Effect.runPromise(
      Effect.provideService(effect, ProviderHttp, service),
      { signal },
    );
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
}

export const providerResponseEffect = (request: ProviderRequest) =>
  Effect.flatMap(ProviderHttp, (service) => service.request(request));

export const providerTextEffect = (request: ProviderRequest) =>
  Effect.flatMap(providerResponseEffect(request), (result) => {
    if (result.status === 401 || result.status === 403)
      return Effect.fail(new ProviderApiError("authentication"));
    // A server failure can happen after a purchase was accepted. Never retry it.
    if (result.status >= 500)
      return Effect.fail(new ProviderApiError("response"));
    if (result.status < 200 || result.status >= 300)
      return Effect.fail(new ProviderApiError("rejected"));
    return Effect.succeed(result.body);
  });

export const providerJsonEffect = (request: ProviderRequest) =>
  Effect.flatMap(providerTextEffect(request), (text) =>
    Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => new ProviderApiError("response"),
    }),
  );

export const requestProvider: ProviderFetch = async (request, signal) => {
  validateProviderRequest(request);
  return runProviderEffect(providerResponseEffect(request), signal);
};

export function providerText(
  request: ProviderRequest,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<string> {
  return runProviderEffect(providerTextEffect(request), signal, fetcher);
}

export function providerJson(
  request: ProviderRequest,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<unknown> {
  return runProviderEffect(providerJsonEffect(request), signal, fetcher);
}
