import { Effect } from "effect";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  ProviderApiError,
  providerResponseEffect,
  runProviderEffect,
} from "@/lib/provider-request.ts";

const RAVEALTS_BASE_URL = "https://api.ravealts.com";
const LOCAL_STORAGE_RAVEALTS_API_KEY = "ravealts-api-key";

export type RavealtsStock = Record<string, number>;

export type RavealtsStockResponse = {
  status: "success";
  stock: RavealtsStock;
};

export type RavealtsKeyInfoResponse = {
  status: "success";
  available_credits: number;
};

export type RavealtsPurchasedAccount =
  | { cookie: string; filename: string }
  | { email: string; password: string; auth_token: string }
  | { email: string; password: string }
  | { raw: string };

export type RavealtsPurchaseResponse = {
  status: "success";
  accounts: RavealtsPurchasedAccount[];
};

export type RavealtsErrorResponse = {
  status: "error";
  error_type: string;
  message: string;
};

export function getRavealtsApiKey(): string {
  return localStorage.getItem(LOCAL_STORAGE_RAVEALTS_API_KEY) ?? "";
}

export function setRavealtsApiKey(key: string): void {
  localStorage.setItem(LOCAL_STORAGE_RAVEALTS_API_KEY, key);
}

function isRavealtsError(data: unknown): data is RavealtsErrorResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "status" in data &&
    (data as RavealtsErrorResponse).status === "error"
  );
}

function ravealtsRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  },
) {
  return Effect.gen(function* () {
    const response = yield* providerResponseEffect({
      url: `${RAVEALTS_BASE_URL}${path}`,
      method: "GET",
      ...options,
    });
    if (response.status >= 500)
      return yield* Effect.fail(new ProviderApiError("response"));
    const data = yield* Effect.try({
      try: () => JSON.parse(response.body) as unknown,
      catch: () => new ProviderApiError("response"),
    });
    if (isRavealtsError(data))
      return yield* Effect.fail(
        new RavealtsApiError(data.error_type, data.message),
      );
    if (response.status < 200 || response.status >= 300)
      return yield* Effect.fail(new ProviderApiError("rejected"));
    return data as T;
  });
}

export class RavealtsApiError extends Error {
  constructor(
    public readonly errorType: string,
    message: string,
  ) {
    super(message);
    this.name = "RavealtsApiError";
  }
}

export async function fetchStock(): Promise<RavealtsStockResponse> {
  return runProviderEffect(
    ravealtsRequest<RavealtsStockResponse>("/alts/stock"),
  );
}

export async function fetchKeyInfo(
  apiKey: string,
): Promise<RavealtsKeyInfoResponse> {
  return runProviderEffect(
    ravealtsRequest<RavealtsKeyInfoResponse>("/alts/key-info", {
      headers: { Authorization: `Bearer ${apiKey}` },
    }),
  );
}

export async function purchaseAccounts(
  apiKey: string,
  accountType: string,
  amount: number,
): Promise<RavealtsPurchaseResponse> {
  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 10 ||
    !apiKey.trim() ||
    !accountType.trim()
  ) {
    throw new Error("Invalid Ravealts purchase");
  }
  return runProviderEffect(
    ravealtsRequest<RavealtsPurchaseResponse>("/alts/purchase", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_request: {
          account_type: accountType,
          amount,
        },
      }),
    }),
  );
}

export function mapPurchasedAccounts(accounts: RavealtsPurchasedAccount[]): {
  payload: string[];
  credentialType: AccountTypeCredentials;
} {
  const payload: string[] = [];
  let credentialType: AccountTypeCredentials =
    AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN;

  for (const account of accounts) {
    if ("cookie" in account) {
      credentialType = AccountTypeCredentials.MICROSOFT_JAVA_COOKIES;
      payload.push(account.cookie);
    } else if ("auth_token" in account) {
      credentialType = AccountTypeCredentials.MICROSOFT_JAVA_REFRESH_TOKEN;
      payload.push(account.auth_token);
    } else if ("email" in account) {
      credentialType = AccountTypeCredentials.MICROSOFT_JAVA_CREDENTIALS;
      payload.push(`${account.email}:${account.password}`);
    } else {
      credentialType = AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN;
      payload.push(account.raw);
    }
  }

  return { payload, credentialType };
}

export function formatStockType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
