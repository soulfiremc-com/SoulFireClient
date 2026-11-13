import posthog from "posthog-js";
import {
  analyticsConsentConfig,
  createAnalyticsConsent,
} from "@/lib/analytics-consent";
import { resetLegacyAnalyticsIdentity } from "@/lib/analytics-identity";

const projectToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

export const isPostHogConfigured = Boolean(projectToken && host);
export const analyticsConsent = createAnalyticsConsent(
  posthog,
  isPostHogConfigured,
);

if (!isPostHogConfigured) {
  if (import.meta.env.DEV) {
    const missingVariable = projectToken
      ? "VITE_PUBLIC_POSTHOG_HOST"
      : "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN";

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    );
  }
} else {
  posthog.init(projectToken, {
    ...analyticsConsentConfig,
    api_host: host,
    ui_host: "https://eu.posthog.com",
    capture_exceptions: true,
    debug: import.meta.env.DEV,
    defaults: "2026-01-30",
    loaded: (client) => {
      client.register({
        app_version: APP_VERSION,
        app_environment: APP_ENVIRONMENT,
      });
      resetLegacyAnalyticsIdentity(client, () =>
        analyticsConsent.resetIdentity(true),
      );
      analyticsConsent.synchronize();
    },
  });
}

export default posthog;
