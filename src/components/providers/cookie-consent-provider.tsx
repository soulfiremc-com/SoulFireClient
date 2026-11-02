import { createContext, type ReactNode, useEffect, useState } from "react";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import { analyticsConsent, isPostHogConfigured } from "@/lib/posthog";

export const CookieConsentContext = createContext<{
  openCookiePreferences: () => void;
}>(null as never);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const consent = useAnalyticsConsent();
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    if (!isPostHogConfigured) return;
    const consentKey = `__ph_opt_in_out_${import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN}`;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === consentKey) {
        // Reinitialize the SDK so another tab's choice also clears old identity.
        window.location.reload();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function choose(accepted: boolean) {
    analyticsConsent.setConsent(accepted);
    setPreferencesOpen(false);
  }

  return (
    <CookieConsentContext
      value={{ openCookiePreferences: () => setPreferencesOpen(true) }}
    >
      {children}
      {isPostHogConfigured && (consent === "pending" || preferencesOpen) && (
        <CookieConsentBanner
          onAccept={() => choose(true)}
          onDecline={() => choose(false)}
          onClose={
            consent === "pending" ? undefined : () => setPreferencesOpen(false)
          }
        />
      )}
    </CookieConsentContext>
  );
}
