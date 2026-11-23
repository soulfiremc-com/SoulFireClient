import { expect, mock, test } from "bun:test";

const values = new Map<string, string>();
const storage: Storage = {
  get length() {
    return values.size;
  },
  key: (index) => Array.from(values.keys())[index] ?? null,
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    values.set(key, value);
  },
  removeItem: (key) => {
    values.delete(key);
  },
  clear: () => {
    values.clear();
  },
};
Object.assign(globalThis, {
  localStorage: storage,
  window: Object.assign(new EventTarget(), { localStorage: storage }),
});

void mock.module("@/lib/i18n.ts", () => ({
  default: { t: (key: string) => key },
}));
void mock.module("@/lib/posthog.ts", () => ({
  analyticsConsent: { resetIdentity: () => undefined },
  isPostHogConfigured: false,
}));

let killServer: () => Promise<undefined> = async () => undefined;
void mock.module("@/lib/desktop.ts", () => ({
  isDesktopApp: () => true,
  desktop: {
    cast: { stopAll: async () => undefined },
    integratedServer: { kill: () => killServer() },
  },
}));

const { disconnectSession, logOut, setAuthentication } =
  await import("./web-rpc.ts");

test("log out removes every stored token, including an old login form draft", () => {
  setAuthentication("dedicated", "https://example.com", "session-token");
  storage.setItem("form-server-token", "draft-token");
  storage.setItem("server-webdav-token", "legacy-token");
  storage.setItem("form-mobile-integrated-server-token", "legacy-token");
  storage.setItem("form-server-address", "https://example.com");

  logOut();

  for (const key of [
    "server-token",
    "form-server-token",
    "server-webdav-token",
    "form-mobile-integrated-server-token",
  ]) {
    expect(storage.getItem(key)).toBeNull();
  }
  // The address is not a secret, so the form keeps it for the next login.
  expect(storage.getItem("form-server-address")).toBe("https://example.com");
});

test("sign-in removes a token draft that older versions saved", () => {
  storage.setItem("form-server-token", "draft-token");

  setAuthentication("dedicated", "https://example.com", "session-token");

  expect(storage.getItem("form-server-token")).toBeNull();
  expect(storage.getItem("server-token")).toBe("session-token");
});

test("disconnecting signs out even when the local server does not stop", async () => {
  const failure = new Error("kill failed");
  killServer = () => Promise.reject(failure);
  const consoleError = console.error;
  console.error = () => undefined;
  try {
    setAuthentication("integrated", "http://127.0.0.1:38765", "local-token");

    const result = await disconnectSession();

    expect(result.stopError).toBe(failure);
    expect(storage.getItem("server-type")).toBeNull();
    expect(storage.getItem("server-token")).toBeNull();
  } finally {
    console.error = consoleError;
    killServer = async () => undefined;
  }
});

test("disconnecting reports no error when the local server stops", async () => {
  setAuthentication("integrated", "http://127.0.0.1:38765", "local-token");

  expect(await disconnectSession()).toEqual({ stopError: null });
  expect(storage.getItem("server-type")).toBeNull();
});
