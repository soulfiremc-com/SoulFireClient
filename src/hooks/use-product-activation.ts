import { useQueryClient } from "@tanstack/react-query";
import { use, useEffect } from "react";
import { TransportContext } from "@/components/providers/transport-context";
import { isDesktopApp } from "@/lib/desktop";
import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import posthog, { analyticsConsent, isPostHogConfigured } from "@/lib/posthog";
import {
  createProductActivationTracker,
  watchProductActivation,
} from "@/lib/product-activation";

export function useProductActivation(userId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const consent = useAnalyticsConsent();

  useEffect(() => {
    // Demo fleets and impersonated users must never generate activation events.
    if (
      !enabled ||
      !transport ||
      !userId ||
      !isPostHogConfigured ||
      consent !== "granted"
    )
      return;

    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      // Tracking can continue without persistence when storage is unavailable.
    }

    const tracker = createProductActivationTracker({
      surface: isDesktopApp() ? "desktop" : "web",
      storage,
      capture: (event, properties) => {
        if (analyticsConsent.getStatus() !== "granted") return false;
        try {
          return posthog.capture(event, properties) !== undefined;
        } catch {
          return false;
        }
      },
    });
    tracker.start(userId);

    return watchProductActivation(queryClient, userId, tracker);
  }, [consent, enabled, queryClient, transport, userId]);
}
