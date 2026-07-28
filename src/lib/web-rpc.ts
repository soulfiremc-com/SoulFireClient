import type { Interceptor, Transport } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import type { ClientDataResponse } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import {
  AuthType,
  createClient as createWebDAV,
  type WebDAVClient,
} from "webdav";
import i18n from "@/lib/i18n.ts";
import type { SFServerType } from "@/lib/types.ts";
import { isDemo } from "@/lib/utils.tsx";

const LOCAL_STORAGE_SERVER_TYPE_KEY = "server-type";
const LOCAL_STORAGE_SERVER_ADDRESS_KEY = "server-address";
const LOCAL_STORAGE_SERVER_TOKEN_KEY = "server-token";
const LOCAL_STORAGE_SERVER_WEBDAV_TOKEN_KEY = "server-webdav-token";
const LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY =
  "server-impersonation-token";

export const isAuthenticated = () => {
  if (isDemo()) return true;

  return (
    localStorage.getItem(LOCAL_STORAGE_SERVER_TYPE_KEY) !== null &&
    localStorage.getItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY) !== null &&
    localStorage.getItem(LOCAL_STORAGE_SERVER_TOKEN_KEY) !== null
  );
};

export const setAuthentication = (
  type: SFServerType,
  address: string,
  token: string,
) => {
  localStorage.setItem(LOCAL_STORAGE_SERVER_TYPE_KEY, type);
  localStorage.setItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY, address);
  localStorage.setItem(LOCAL_STORAGE_SERVER_TOKEN_KEY, token);
};

export const getServerType = () => {
  return localStorage.getItem(
    LOCAL_STORAGE_SERVER_TYPE_KEY,
  ) as SFServerType | null;
};

export const getOrGenerateWebDAVToken = (generator: () => string): string => {
  let token = localStorage.getItem(LOCAL_STORAGE_SERVER_WEBDAV_TOKEN_KEY);
  if (!token) {
    token = generator();
    localStorage.setItem(LOCAL_STORAGE_SERVER_WEBDAV_TOKEN_KEY, token);
  }
  return token;
};

export function createWebDAVClient(
  clientInfo: ClientDataResponse,
  generator: () => string,
): WebDAVClient {
  const token = getOrGenerateWebDAVToken(generator);
  const address = clientInfo.serverInfo?.publicWebdavAddress;
  if (!address) {
    throw new Error("WebDAV address not available");
  }
  return createWebDAV(address, {
    authType: AuthType.Password,
    username: "ignored",
    password: token,
  });
}

export const logOut = () => {
  localStorage.removeItem(LOCAL_STORAGE_SERVER_TYPE_KEY);
  localStorage.removeItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY);
  localStorage.removeItem(LOCAL_STORAGE_SERVER_TOKEN_KEY);
  localStorage.removeItem(LOCAL_STORAGE_SERVER_WEBDAV_TOKEN_KEY);
  localStorage.removeItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY);
};

export const startImpersonation = (token: string) => {
  localStorage.setItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY, token);
};

export const stopImpersonation = () => {
  localStorage.removeItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY);
};

export const isImpersonating = () => {
  return (
    localStorage.getItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY) !== null
  );
};

export const createTransport = (): Transport | null => {
  if (isDemo()) {
    return null;
  }

  const address = localStorage.getItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY);
  let token = localStorage.getItem(LOCAL_STORAGE_SERVER_TOKEN_KEY);

  if (!address || !token) {
    throw new Error(i18n.t("common:error.noAddressOrToken"));
  }

  const impersonationToken = localStorage.getItem(
    LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY,
  );
  if (impersonationToken !== null) {
    token = impersonationToken;
  }

  const authInterceptor: Interceptor = (next) => (request) => {
    request.header.set("Authorization", `Bearer ${token}`);
    return next(request);
  };

  return createGrpcWebTransport({
    baseUrl: address,
    interceptors: [authInterceptor],
  });
};

export const createAddressOnlyTransport = (address: string): Transport => {
  return createGrpcWebTransport({
    baseUrl: address,
  });
};
