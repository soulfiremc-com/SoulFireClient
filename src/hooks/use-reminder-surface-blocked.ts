import { useSyncExternalStore } from "react";

export function isReminderSurfaceBlocked() {
  return (
    document.visibilityState !== "visible" ||
    document.fullscreenElement !== null ||
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [data-cookie-consent-banner]',
    ) !== null
  );
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "role",
      "hidden",
      "data-state",
      "data-cookie-consent-banner",
    ],
  });
  document.addEventListener("visibilitychange", onChange);
  document.addEventListener("fullscreenchange", onChange);
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", onChange);
    document.removeEventListener("fullscreenchange", onChange);
  };
}

export function useReminderSurfaceBlocked() {
  return useSyncExternalStore(subscribe, isReminderSurfaceBlocked);
}
