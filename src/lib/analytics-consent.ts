import type { PostHog, PostHogConfig } from "posthog-js";

export type AnalyticsConsentStatus = "pending" | "granted" | "denied";

export const analyticsConsentConfig = {
  cookieless_mode: "on_reject",
  person_profiles: "never",
} satisfies Partial<PostHogConfig>;

type ConsentClient = Pick<
  PostHog,
  | "get_explicit_consent_status"
  | "opt_in_capturing"
  | "opt_out_capturing"
  | "reset"
  | "set_config"
>;

export function createAnalyticsConsent(
  client: ConsentClient,
  configured: boolean,
) {
  const listeners = new Set<() => void>();

  const getStatus = (): AnalyticsConsentStatus =>
    configured ? client.get_explicit_consent_status() : "pending";

  function synchronize() {
    if (!configured) return;
    client.set_config({
      person_profiles: getStatus() === "granted" ? "identified_only" : "never",
    });
    listeners.forEach((listener) => {
      listener();
    });
  }

  // `restore` re-applies an earlier choice, which must not record a new
  // opt-in event.
  function applyConsent(accepted: boolean, restore: boolean) {
    if (!configured) return;
    // Disable identification before the SDK starts sending cookieless events.
    client.set_config({
      person_profiles: accepted ? "identified_only" : "never",
    });
    if (accepted)
      client.opt_in_capturing(restore ? { captureEventName: false } : {});
    else client.opt_out_capturing();
    synchronize();
  }

  function setConsent(accepted: boolean) {
    applyConsent(accepted, false);
  }

  function resetIdentity(resetDeviceId = false) {
    if (!configured) return;
    const status = getStatus();
    client.reset(resetDeviceId);
    // The SDK clears consent on reset. Keep the browser's choice across logins.
    if (status === "pending") synchronize();
    else applyConsent(status === "granted", true);
  }

  return {
    getStatus,
    setConsent,
    resetIdentity,
    synchronize,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
