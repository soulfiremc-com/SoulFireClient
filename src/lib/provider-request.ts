import { TaggedError as TaggedFailure } from "effect/Schema";
import { Context, Effect, Schema } from "effect";
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

const providerFailureReason = Schema.Literals([
  "network",
  "authentication",
  "rejected",
  "response",
  "empty",
  "limit",
  "priceChanged",
]);

export class ProviderApiError extends TaggedFailure<
  ProviderApiError,
  { readonly brand: unique symbol }
>()("ProviderApiError", {
  reason: providerFailureReason,
  message: Schema.String,
}) {
  static new(reason: typeof providerFailureReason.Type) {
    return ProviderApiError.make({
      reason,
      message: `Provider request failed: ${reason}`,
    });
  }
}

export class ProviderHttp extends Context.Service<
  ProviderHttp,
  {
    readonly request: (
      request: ProviderRequest,
    ) => Effect.Effect<ProviderResponse, ProviderApiError>;
  }
>()("soulfire/lib/provider-request/ProviderHttp") {}

const providerHttp: Context.Service.Shape<typeof ProviderHttp> = {
  request: (request) =>
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => {
          validateProviderRequest(request);
        },
        catch: () => ProviderApiError.new("network"),
      });
      if (isDesktopApp())
        return yield* Effect.tryPromise({
          try: () => desktop.providers.request(request),
          catch: () => ProviderApiError.new("network"),
        });
      return yield* executeProviderRequestEffect(request).pipe(
        Effect.mapError(() => ProviderApiError.new("network")),
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
            try: (requestSignal) => fetcher(request, requestSignal),
            catch: (error) =>
              error instanceof ProviderApiError
                ? error
                : ProviderApiError.new("network"),
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
      return Effect.fail(ProviderApiError.new("authentication"));
    // A server failure can happen after a purchase was accepted. Never retry it.
    if (result.status >= 500)
      return Effect.fail(ProviderApiError.new("response"));
    if (result.status < 200 || result.status >= 300)
      return Effect.fail(ProviderApiError.new("rejected"));
    return Effect.succeed(result.body);
  });

export const decodeProviderJson = (text: string) =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
    Effect.mapError(() => ProviderApiError.new("response")),
  );

export const providerJsonEffect = (request: ProviderRequest) =>
  Effect.flatMap(providerTextEffect(request), (text) =>
    decodeProviderJson(text),
  );

export function providerJson(
  request: ProviderRequest,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<unknown> {
  return runProviderEffect(providerJsonEffect(request), signal, fetcher);
}
