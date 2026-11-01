import { useQueryClient } from "@tanstack/react-query";
import { use, useEffect } from "react";
import { TransportContext } from "@/components/providers/transport-context";
import { isDesktopApp } from "@/lib/desktop";
import posthog, { isPostHogConfigured } from "@/lib/posthog";
import {
  createProductActivationTracker,
  watchProductActivation,
} from "@/lib/product-activation";

export function useProductActivation(userId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const transport = use(TransportContext);

  useEffect(() => {
    // Demo fleets and impersonated users must never generate activation events.
    if (!enabled || !transport || !userId || !isPostHogConfigured) return;

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
        try {
          return posthog.capture(event, properties) !== undefined;
        } catch {
          return false;
        }
      },
    });
    tracker.start(userId);

    return watchProductActivation(queryClient, userId, tracker);
  }, [enabled, queryClient, transport, userId]);
}
