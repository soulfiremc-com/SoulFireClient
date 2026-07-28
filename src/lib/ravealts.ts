import { AccountTypeCredentials } from "@soulfiremc/sdk/generated/soulfire/common_pb";

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

async function ravealtsRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${RAVEALTS_BASE_URL}${path}`, options);
  const data = await response.json();
  if (isRavealtsError(data)) {
    throw new RavealtsApiError(data.error_type, data.message);
  }
  return data as T;
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
  return ravealtsRequest<RavealtsStockResponse>("/alts/stock");
}

export async function fetchKeyInfo(
  apiKey: string,
): Promise<RavealtsKeyInfoResponse> {
  return ravealtsRequest<RavealtsKeyInfoResponse>("/alts/key-info", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export async function purchaseAccounts(
  apiKey: string,
  accountType: string,
  amount: number,
): Promise<RavealtsPurchaseResponse> {
  return ravealtsRequest<RavealtsPurchaseResponse>("/alts/purchase", {
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
  });
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
