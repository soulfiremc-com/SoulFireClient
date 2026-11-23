import { afterAll, expect, mock, test } from "bun:test";

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
const originalGlobals = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
};
Object.assign(globalThis, {
  localStorage: storage,
  window: Object.assign(new EventTarget(), { localStorage: storage }),
});
// Other test files share this process, so put the real globals back.
afterAll(() => {
  for (const [name, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

// i18n.ts and posthog.ts need Vite build-time globals, so no other bun test
// can load them. Mocking them here cannot change another file's results.
// Do not mock shared modules such as desktop.ts: bun keeps module mocks for
// the whole test process.
void mock.module("@/lib/i18n.ts", () => ({
  default: { t: (key: string) => key },
}));
void mock.module("@/lib/posthog.ts", () => ({
  analyticsConsent: { resetIdentity: () => undefined },
  isPostHogConfigured: false,
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
  const consoleError = console.error;
  console.error = () => undefined;
  try {
    setAuthentication("integrated", "http://127.0.0.1:38765", "local-token");

    const result = await disconnectSession(() => Promise.reject(failure));

    expect(result.stopError).toBe(failure);
    expect(storage.getItem("server-type")).toBeNull();
    expect(storage.getItem("server-token")).toBeNull();
  } finally {
    console.error = consoleError;
  }
});

test("disconnecting reports no error when the local server stops", async () => {
  setAuthentication("integrated", "http://127.0.0.1:38765", "local-token");

  expect(await disconnectSession(async () => undefined)).toEqual({
    stopError: null,
  });
  expect(storage.getItem("server-type")).toBeNull();
});
