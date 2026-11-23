import type { JsonValue } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { type ClassValue, clsx } from "clsx";
import { Schema } from "effect";
import { sha256 } from "js-sha256";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import type { ClientDataResponse } from "@/generated/soulfire/client_pb";
import type {
  GlobalPermission,
  InstancePermission,
  SettingsDefinition,
  SettingsEntryIdentifier,
} from "@/generated/soulfire/common_pb";
import type {
  InstanceInfo,
  InstanceListResponse_Instance,
} from "@/generated/soulfire/instance_pb";
import { isDemoHostname } from "@/lib/app-deployment.ts";
import { desktop } from "@/lib/desktop.ts";
import { getPseudoLocale, toIntlLocale } from "@/lib/intl-locale.ts";
import { getLanguageFlag } from "@/lib/language-flags.ts";
import type { BaseSettings } from "@/lib/types.ts";

export {
  addInstanceAccountsBatch,
  applyGeneratedAccounts,
  removeInstanceAccountsBatch,
  setInstanceFriendlyName,
  setInstanceIcon,
  updateBotConfigEntry,
  updateInstanceConfigEntry,
  updateServerConfigEntry,
} from "@/lib/instance-mutations.ts";

export const ROOT_USER_ID = "00000000-0000-0000-0000-000000000000";
const LOCAL_STORAGE_TERMINAL_THEME_KEY = "terminal-theme";
const LOCAL_STORAGE_DEMO_MODE_KEY = "demo-mode";

export function setTerminalTheme(theme: string) {
  localStorage.setItem(LOCAL_STORAGE_TERMINAL_THEME_KEY, theme);
}

export function getTerminalTheme() {
  return localStorage.getItem(LOCAL_STORAGE_TERMINAL_THEME_KEY) ?? "mocha";
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function openExternalUrl(url: string) {
  if (desktop.available()) {
    void desktop.shell.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function isDemo() {
  return (
    isDemoHostname(document.location.hostname) ||
    localStorage.getItem(LOCAL_STORAGE_DEMO_MODE_KEY) === "true"
  );
}

export function hasGlobalPermission(
  clientData: ClientDataResponse,
  permission: GlobalPermission,
) {
  if (isDemo()) {
    return true;
  }

  return clientData.serverPermissions
    .filter((p) => p.granted)
    .map((p) => p.globalPermission)
    .includes(permission);
}

export function hasInstancePermission(
  instanceInfo: InstanceInfo | InstanceListResponse_Instance,
  permission: InstancePermission,
) {
  if (isDemo()) {
    return true;
  }

  return instanceInfo.instancePermissions
    .filter((p) => p.granted)
    .map((p) => p.instancePermission)
    .includes(permission);
}

export function getGravatarUrl(email: string) {
  return `https://www.gravatar.com/avatar/${sha256(email)}?d=404`;
}

export function languageEmoji(locale: string): ReactNode {
  const pseudoLocale = getPseudoLocale(locale);
  if (pseudoLocale) return pseudoLocale.emoji;

  const Flag = getLanguageFlag(locale);
  if (!Flag) return "";

  return <Flag className="mx-1 size-4 align-middle" />;
}

export function getLanguageName(languageCode: string, displayLanguage: string) {
  const pseudoLocale = getPseudoLocale(languageCode);
  if (pseudoLocale) return pseudoLocale.name;

  const displayNames = new Intl.DisplayNames([toIntlLocale(displayLanguage)], {
    type: "language",
  });
  return displayNames.of(languageCode) ?? languageCode;
}

export function getSettingValue(
  config: BaseSettings,
  definition: SettingsDefinition | undefined,
): JsonValue {
  const namespace = definition?.id?.namespace;
  const key = definition?.id?.key;
  const type = definition?.type;
  if (!namespace || !key || type?.case === undefined) {
    return null;
  }

  const defaultValue: JsonValue =
    type.case === "minMax"
      ? {
          min: type.value.minEntry?.def ?? null,
          max: type.value.maxEntry?.def ?? null,
        }
      : type.value.def;
  const stored = config.settings[namespace]?.[key];
  return stored === undefined ? defaultValue : stored;
}

export function getSettingIdentifierKey(id: SettingsEntryIdentifier): string {
  return `${id.namespace}:${id.key}`;
}

export function timestampToDate(timestamp: Timestamp): Date {
  return new Date(
    Number(timestamp.seconds) * 1000 + Math.floor((timestamp.nanos || 0) / 1e6),
  );
}

export function runAsync(fn: () => Promise<void>) {
  void fn().catch(console.error);
}

export function formatIconName(text: string): string {
  return text
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Decode only the fields the upload action reads.
const McLogsResponseSchema = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    url: Schema.String,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    error: Schema.String,
  }),
]);
type McLogsResponse = typeof McLogsResponseSchema.Type;

export async function uploadToMcLogs(content: string): Promise<McLogsResponse> {
  const response = await fetch("https://api.mclo.gs/1/log", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ content }),
  });

  return Schema.decodeUnknownPromise(McLogsResponseSchema)(
    await response.json(),
  );
}
