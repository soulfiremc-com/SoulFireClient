import type { SettingsDefinition } from "@/generated/soulfire/common_pb";

export type SettingFocus = { namespace: string; key: string };

export function parseSettingFocusSearch(search: Record<string, unknown>): {
  focusNamespace?: string;
  focusKey?: string;
} {
  const valid = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= 256;
  return valid(search.focusNamespace) && valid(search.focusKey)
    ? { focusNamespace: search.focusNamespace, focusKey: search.focusKey }
    : {};
}

export function isFocusedSetting(
  entry: SettingFocus,
  focus: SettingFocus | undefined,
): boolean {
  return entry.namespace === focus?.namespace && entry.key === focus.key;
}

export function getSettingLabel(definition: SettingsDefinition): string {
  const type = definition.type;
  if (type.case === "minMax") {
    return (
      [type.value.minEntry?.uiName, type.value.maxEntry?.uiName]
        .filter(Boolean)
        .join(" / ") ||
      definition.id?.key ||
      ""
    );
  }
  return type.value?.uiName || definition.id?.key || "";
}

export function focusSettingElement(
  element: HTMLElement,
  onFocused: () => void,
): () => void {
  const control =
    element.querySelector<HTMLElement>(
      "[role=switch]:not([aria-disabled=true]), [role=combobox]:not([aria-disabled=true])",
    ) ??
    element.querySelector<HTMLElement>(
      "input:not([type=hidden]):not(:disabled), textarea:not(:disabled), button:not(:disabled):not([aria-disabled=true]), [tabindex]:not([tabindex='-1']):not([aria-disabled=true])",
    );
  const target = control ?? element;
  let observer: MutationObserver | undefined;
  let cancelled = false;
  let focused = false;
  const attempt = () => {
    if (
      cancelled ||
      focused ||
      !element.isConnected ||
      element.closest("[inert], [aria-hidden=true]") ||
      document.querySelector(
        '[role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden])',
      )
    )
      return;
    target.focus({ preventScroll: true });
    if (document.activeElement !== target) return;
    focused = true;
    observer?.disconnect();
    element.scrollIntoView({ block: "center", behavior: "auto" });
    onFocused();
  };
  attempt();
  // A closing dialog can still reclaim focus until its popup leaves the DOM.
  // Wait for that change instead of guessing an animation duration.
  if (!focused) {
    observer = new MutationObserver(attempt);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["inert", "aria-hidden"],
    });
  }
  return () => {
    cancelled = true;
    observer?.disconnect();
  };
}
