import type { PostHog } from "posthog-js";

type IdentityClient = Pick<PostHog, "get_property" | "identify">;

const IDENTITY_PREFIX = "soulfire:";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOT_USER_ID = "00000000-0000-0000-0000-000000000000";

export function getAnalyticsIdentity(
  installationId: string | undefined,
  userId: string,
): string | null {
  if (
    !installationId ||
    !UUID_PATTERN.test(installationId) ||
    installationId === ROOT_USER_ID ||
    !UUID_PATTERN.test(userId)
  ) {
    return null;
  }

  return `${IDENTITY_PREFIX}${installationId.toLowerCase()}:${userId.toLowerCase()}`;
}

export function resetLegacyAnalyticsIdentity(
  posthog: IdentityClient,
  resetIdentity: () => void,
) {
  const previousId: unknown = posthog.get_property("$user_id");
  if (
    typeof previousId === "string" &&
    !previousId.startsWith(IDENTITY_PREFIX)
  ) {
    // Replace the cached device ID too: it can already belong to the shared root profile.
    resetIdentity();
  }
}

export function syncAnalyticsIdentity(
  posthog: IdentityClient,
  identity: string | null,
  properties: Record<string, string | number>,
  resetIdentity: () => void,
) {
  const previousId: unknown = posthog.get_property("$user_id");
  if (typeof previousId === "string" && previousId !== identity) {
    // Keep server/user switches and legacy profiles from linking unrelated installations.
    resetIdentity();
  }
  if (identity) posthog.identify(identity, properties);
}
