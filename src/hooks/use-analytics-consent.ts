import { useSyncExternalStore } from "react";
import { analyticsConsent } from "@/lib/posthog";

export function useAnalyticsConsent() {
  return useSyncExternalStore(
    analyticsConsent.subscribe,
    analyticsConsent.getStatus,
  );
}
