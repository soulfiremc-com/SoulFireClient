import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import {
  executeProviderRequest,
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

export const requestProvider: ProviderFetch = async (request, signal) => {
  validateProviderRequest(request);
  signal?.throwIfAborted();
  try {
    let result: ProviderResponse;
    if (isDesktopApp()) {
      result = await desktop.providers.request(request);
    } else {
      result = await executeProviderRequest(request, fetch, signal);
    }
    signal?.throwIfAborted();
    return result;
  } catch {
    signal?.throwIfAborted();
    // Never expose vendor response bodies or URLs, which can contain credentials.
    throw new ProviderApiError("network");
  }
};

export async function providerText(
  request: ProviderRequest,
  signal?: AbortSignal,
  fetcher: ProviderFetch = requestProvider,
): Promise<string> {
  const result = await fetcher(request, signal);
  if (result.status === 401 || result.status === 403)
    throw new ProviderApiError("authentication");
  // A server failure can happen after a purchase was accepted.
  if (result.status >= 500) throw new ProviderApiError("response");
  if (result.status < 200 || result.status >= 300)
    throw new ProviderApiError("rejected");
  return result.body;
}

export async function providerJson(
  request: ProviderRequest,
  signal?: AbortSignal,
  fetcher?: ProviderFetch,
): Promise<unknown> {
  const text = await providerText(request, signal, fetcher);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderApiError("response");
  }
}
