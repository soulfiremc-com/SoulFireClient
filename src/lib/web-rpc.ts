import type { Interceptor, Transport } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import i18n from "@/lib/i18n.ts";
import { analyticsConsent, isPostHogConfigured } from "@/lib/posthog.ts";
import { resetQuerySession } from "@/lib/query-session.ts";
import { SF_SERVER_TYPES, type SFServerType } from "@/lib/types.ts";
import { isDemo } from "@/lib/utils.tsx";
import { isOneOf } from "@/lib/is-one-of";
import { clearCommandHistory } from "@/lib/command-history.ts";

const LOCAL_STORAGE_SERVER_TYPE_KEY = "server-type";
const LOCAL_STORAGE_SERVER_ADDRESS_KEY = "server-address";
const LOCAL_STORAGE_SERVER_TOKEN_KEY = "server-token";
const LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY =
  "server-impersonation-token";
// Tokens that older clients wrote, including the token login form draft.
// Sign-in and sign-out remove them, so an upgraded install does not keep
// credentials that nothing reads any more.
const LEGACY_TOKEN_KEYS = [
  "form-server-token",
  "server-webdav-token",
  "form-mobile-integrated-server-token",
];

function removeLegacyTokens() {
  for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
}

const AUTHENTICATION_KEYS = [
  LOCAL_STORAGE_SERVER_TYPE_KEY,
  LOCAL_STORAGE_SERVER_ADDRESS_KEY,
  LOCAL_STORAGE_SERVER_TOKEN_KEY,
  LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY,
];

let sessionTransport:
  | { address: string; token: string; transport: Transport }
  | undefined;

function updateAuthentication(update: () => void) {
  const previous = AUTHENTICATION_KEYS.map((key) => localStorage.getItem(key));
  update();
  if (
    AUTHENTICATION_KEYS.some(
      (key, index) => localStorage.getItem(key) !== previous[index],
    )
  ) {
    sessionTransport = undefined;
    resetQuerySession();
  }
}

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
  updateAuthentication(() => {
    localStorage.setItem(LOCAL_STORAGE_SERVER_TYPE_KEY, type);
    localStorage.setItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY, address);
    localStorage.setItem(LOCAL_STORAGE_SERVER_TOKEN_KEY, token);
  });
  removeLegacyTokens();
};

export const getServerType = () => {
  const serverType = localStorage.getItem(LOCAL_STORAGE_SERVER_TYPE_KEY);
  return isOneOf(serverType, SF_SERVER_TYPES) ? serverType : null;
};

export const getServerAddress = () =>
  localStorage.getItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY);

export const logOut = () => {
  if (isPostHogConfigured && isAuthenticated()) {
    analyticsConsent.resetIdentity();
  }
  updateAuthentication(() => {
    localStorage.removeItem(LOCAL_STORAGE_SERVER_TYPE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY);
    localStorage.removeItem(LOCAL_STORAGE_SERVER_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY);
  });
  // Signing out must not leave a token or the typed commands, which can hold
  // secrets, for the next person to reuse.
  removeLegacyTokens();
  clearCommandHistory();
};

/**
 * Stops the local server, then signs out. Sign-out happens even when the
 * server does not stop, so a failed stop cannot keep the user signed in.
 * Returns the stop error so the caller can tell the user.
 */
const stopLocalServer = async () => {
  if (isDesktopApp()) await desktop.integratedServer.kill();
};

export async function disconnectSession(
  stopServer: () => Promise<unknown> = stopLocalServer,
): Promise<{ stopError: unknown }> {
  let stopError: unknown = null;
  try {
    await stopServer();
  } catch (error) {
    console.error(error);
    stopError = error;
  } finally {
    logOut();
  }
  return { stopError };
}

export const startImpersonation = (token: string) => {
  if (isPostHogConfigured) {
    analyticsConsent.resetIdentity();
  }
  updateAuthentication(() => {
    localStorage.setItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY, token);
  });
};

export const stopImpersonation = () => {
  if (isPostHogConfigured) {
    analyticsConsent.resetIdentity();
  }
  updateAuthentication(() => {
    localStorage.removeItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY);
  });
};

export const isImpersonating = () =>
  localStorage.getItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY) !== null;

/**
 * Returns the transport for the signed-in session. Polling queries call this
 * on every fetch, so the transport is reused until the address or the token
 * changes.
 */
export const createTransport = (): Transport | null => {
  if (isDemo()) {
    return null;
  }

  const address = localStorage.getItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY);
  const sessionToken = localStorage.getItem(LOCAL_STORAGE_SERVER_TOKEN_KEY);

  if (!address || !sessionToken) {
    throw new Error(i18n.t("common:error.noAddressOrToken"));
  }

  const token =
    localStorage.getItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY) ??
    sessionToken;
  if (
    sessionTransport?.address === address &&
    sessionTransport.token === token
  ) {
    return sessionTransport.transport;
  }

  const authInterceptor: Interceptor = (next) => (request) => {
    request.header.set("Authorization", `Bearer ${token}`);
    return next(request);
  };

  const transport = createGrpcWebTransport({
    baseUrl: address,
    interceptors: [authInterceptor],
  });
  sessionTransport = { address, token, transport };
  return transport;
};

export const createAddressOnlyTransport = (address: string): Transport =>
  createGrpcWebTransport({
    baseUrl: address,
  });

export function povInputUrl(): string {
  const address = localStorage.getItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY);
  if (!address) throw new Error("POV requires a server address.");
  const url = new URL(`${address.replace(/\/$/u, "")}/pov/input`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function getCastSource(instanceId: string) {
  if (isDemo()) return null;
  const address = localStorage.getItem(LOCAL_STORAGE_SERVER_ADDRESS_KEY);
  const token =
    localStorage.getItem(LOCAL_STORAGE_SERVER_IMPERSONATION_TOKEN_KEY) ??
    localStorage.getItem(LOCAL_STORAGE_SERVER_TOKEN_KEY);
  return address && token ? { address, token, instanceId } : null;
}
