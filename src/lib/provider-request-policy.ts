import { TaggedError as TaggedFailure } from "effect/Schema";
import { Effect, Schema } from "effect";

export class ProviderRequestError extends TaggedFailure<
  ProviderRequestError,
  { readonly brand: unique symbol }
>()("ProviderRequestError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown),
}) {}

export interface ProviderRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
}

export interface ProviderResponse {
  status: number;
  body: string;
}

export function executeProviderRequestEffect(
  request: ProviderRequest,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Effect.Effect<ProviderResponse, ProviderRequestError> {
  return Effect.gen(function* () {
    yield* Effect.try({
      try: () => {
        validateProviderRequest(request);
      },
      catch: (error) =>
        new ProviderRequestError({
          message:
            error instanceof Error ? error.message : "Invalid provider request",
          cause: error,
        }),
    });
    return yield* Effect.tryPromise({
      try: async (signal) => {
        const response = await fetcher(request.url, {
          method: request.method,
          ...(request.headers && { headers: request.headers }),
          ...(request.body !== undefined && { body: request.body }),
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal,
        });
        const body = await response.text();
        if (body.length > 8_000_000)
          throw new ProviderRequestError({
            message: "Provider response too large",
          });
        return { status: response.status, body };
      },
      // Fetch errors can include the credential-bearing request URL.
      catch: () =>
        new ProviderRequestError({ message: "Provider connection failed" }),
    }).pipe(
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () =>
          Effect.fail(
            new ProviderRequestError({ message: "Provider connection failed" }),
          ),
      }),
    );
  });
}

export async function executeProviderRequest(
  request: ProviderRequest,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  signal?: AbortSignal,
): Promise<ProviderResponse> {
  validateProviderRequest(request);
  try {
    return await Effect.runPromise(
      executeProviderRequestEffect(request, fetcher),
      { signal },
    );
  } catch {
    throw new Error("Provider connection failed");
  }
}

const routes: [string, RegExp, ProviderRequest["method"][]][] = [
  ["https://proxy.webshare.io", /^\/api\/v2\/proxy\/list\/$/u, ["GET"]],
  [
    "https://proxy-seller.com",
    /^\/personal\/api\/v2\/[\w-]+\/(?:proxy\/list\/(?:ipv4|ipv6|isp|mobile|mix|mix_isp)|reference\/list\/(?:ipv4|ipv6|isp))$/u,
    ["GET"],
  ],
  [
    "https://proxy-seller.com",
    /^\/personal\/api\/v2\/[\w-]+\/order\/(?:calc|make)$/u,
    ["POST"],
  ],
  [
    "https://api.proxyscrape.com",
    /^\/v4\/account\/[\w-]+\/(?:datacenter_shared|datacenter_dedicated)\/proxy-list$/u,
    ["GET"],
  ],
  ["https://apid.iproyal.com", /^\/v1\/reseller\/orders\/\d+$/u, ["GET"]],
  [
    "https://api.decodo.com",
    /^\/v2\/endpoints-custom\/back-connect$/u,
    ["GET"],
  ],
  ["https://api.oxylabs.io", /^\/v1\/proxies\/lists(?:\/[\w-]+)?$/u, ["GET"]],
  ["https://api.thordata.com", /^\/api\/gateway\/queryListIsp$/u, ["POST"]],
  ["https://api.ravealts.com", /^\/alts\/(?:stock|key-info)$/u, ["GET"]],
  ["https://api.ravealts.com", /^\/alts\/purchase$/u, ["POST"]],
  [
    "https://localts.store",
    /^\/v1\/(?:me|products|orders|orders\/get-order)$/u,
    ["GET"],
  ],
  ["https://localts.store", /^\/v1\/products\/[\w-]+\/purchase$/u, ["POST"]],
  [
    "https://api.fernan.club",
    /^\/api\/v1\/(?:user\/me|store\/(?:stock|cooldown|purchases))$/u,
    ["GET"],
  ],
  [
    "https://api.fernan.club",
    /^\/api\/v1\/store\/purchases\/[\da-f-]{36}$/iu,
    ["GET"],
  ],
  ["https://api.fernan.club", /^\/api\/v1\/store\/purchase$/u, ["POST"]],
];

// Requests can come from the renderer over IPC, so the shape is decoded first.
const isProviderRequestShape = Schema.is(
  Schema.Struct({
    url: Schema.String,
    method: Schema.Literals(["GET", "POST"]),
    headers: Schema.optional(Schema.Unknown),
    body: Schema.optional(Schema.Unknown),
  }),
);

export function validateProviderRequest(
  value: unknown,
): asserts value is ProviderRequest {
  if (!isProviderRequestShape(value)) {
    throw new Error("Invalid provider request");
  }
  const url = new URL(value.url);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !routes.some(
      ([origin, path, methods]) =>
        origin === url.origin &&
        path.test(url.pathname) &&
        methods.includes(value.method),
    )
  )
    throw new Error("Unsupported provider endpoint");
  if (
    value.body !== undefined &&
    (typeof value.body !== "string" ||
      value.body.length > 16_384 ||
      value.method !== "POST")
  ) {
    throw new Error("Invalid provider request body");
  }
  const allowedHeaders = new Set([
    "authorization",
    "content-type",
    "accept",
    "api-token",
    "x-access-token",
    "sign",
    "apikey",
    "x-api-key",
  ]);
  if (
    value.headers !== undefined &&
    (typeof value.headers !== "object" ||
      value.headers === null ||
      Array.isArray(value.headers))
  ) {
    throw new Error("Invalid provider request headers");
  }
  for (const [key, header] of Object.entries(value.headers ?? {})) {
    if (
      !allowedHeaders.has(key.toLowerCase()) ||
      typeof header !== "string" ||
      header.length > 8192 ||
      /[\r\n]/u.test(header)
    ) {
      throw new Error("Invalid provider request headers");
    }
  }
}
