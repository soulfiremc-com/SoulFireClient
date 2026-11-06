import { Effect } from "effect";

export type ProviderRequest = {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
};

export type ProviderResponse = { status: number; body: string };

export function executeProviderRequestEffect(
  request: ProviderRequest,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Effect.Effect<ProviderResponse, Error> {
  return Effect.gen(function* () {
    yield* Effect.try({
      try: () => validateProviderRequest(request),
      catch: (error) =>
        error instanceof Error ? error : new Error("Invalid provider request"),
    });
    return yield* Effect.tryPromise({
      try: async (signal) => {
        const response = await fetcher(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal,
        });
        const body = await response.text();
        if (body.length > 8_000_000)
          throw new Error("Provider response too large");
        return { status: response.status, body };
      },
      // Fetch errors can include the credential-bearing request URL.
      catch: () => new Error("Provider connection failed"),
    }).pipe(
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => Effect.fail(new Error("Provider connection failed")),
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
  ["https://proxy.webshare.io", /^\/api\/v2\/proxy\/list\/$/, ["GET"]],
  [
    "https://proxy-seller.com",
    /^\/personal\/api\/v2\/[\w-]+\/(?:proxy\/list\/(?:ipv4|ipv6|isp|mobile|mix|mix_isp)|reference\/list\/(?:ipv4|ipv6|isp))$/,
    ["GET"],
  ],
  [
    "https://proxy-seller.com",
    /^\/personal\/api\/v2\/[\w-]+\/order\/(?:calc|make)$/,
    ["POST"],
  ],
  [
    "https://api.proxyscrape.com",
    /^\/v4\/account\/[\w-]+\/(?:datacenter_shared|datacenter_dedicated)\/proxy-list$/,
    ["GET"],
  ],
  ["https://apid.iproyal.com", /^\/v1\/reseller\/orders\/\d+$/, ["GET"]],
  ["https://api.decodo.com", /^\/v2\/endpoints-custom\/back-connect$/, ["GET"]],
  ["https://api.oxylabs.io", /^\/v1\/proxies\/lists(?:\/[\w-]+)?$/, ["GET"]],
  ["https://api.thordata.com", /^\/api\/gateway\/queryListIsp$/, ["POST"]],
  ["https://api.ravealts.com", /^\/alts\/(?:stock|key-info)$/, ["GET"]],
  ["https://api.ravealts.com", /^\/alts\/purchase$/, ["POST"]],
  [
    "https://localts.store",
    /^\/v1\/(?:me|products|orders|orders\/get-order)$/,
    ["GET"],
  ],
  ["https://localts.store", /^\/v1\/products\/[\w-]+\/purchase$/, ["POST"]],
  [
    "https://api.fernan.club",
    /^\/api\/v1\/(?:user\/me|store\/(?:stock|cooldown|purchases))$/,
    ["GET"],
  ],
  [
    "https://api.fernan.club",
    /^\/api\/v1\/store\/purchases\/[\da-f-]{36}$/i,
    ["GET"],
  ],
  ["https://api.fernan.club", /^\/api\/v1\/store\/purchase$/, ["POST"]],
];

export function validateProviderRequest(value: ProviderRequest): void {
  if (
    !value ||
    typeof value.url !== "string" ||
    typeof value.method !== "string"
  ) {
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
      header.length > 8_192 ||
      /[\r\n]/.test(header)
    ) {
      throw new Error("Invalid provider request headers");
    }
  }
}
