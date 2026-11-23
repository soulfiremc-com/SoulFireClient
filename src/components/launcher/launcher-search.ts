import { Schema } from "effect";

/** An in-app path. Protocol-relative paths such as `//host` would leave the app. */
const RedirectPath = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.startsWith("/\\"),
  ),
);
const isRedirectPath = Schema.is(RedirectPath);
const isTrue = Schema.is(Schema.Literal("true"));

export interface LauncherSearch {
  /** In-app path to open after sign-in. */
  redirect?: string;
  /** Shows the connection choices even when a server is saved. */
  configure?: "true";
  /** Starts the saved local server without asking. */
  startLocal?: "true";
}

/**
 * Reads the launcher's search parameters. Each malformed value is dropped on
 * its own, so a crafted link cannot send the user to another site after
 * sign-in, and one bad value does not discard the others.
 */
export function parseLauncherSearch(
  search: Record<string, unknown>,
): LauncherSearch {
  const { redirect, configure, startLocal } = search;
  return {
    ...(isRedirectPath(redirect) && { redirect }),
    ...(isTrue(configure) && { configure }),
    ...(isTrue(startLocal) && { startLocal }),
  };
}
