import type {
  SettingsDefinition,
  SettingsEntryIdentifier,
  SettingsPage,
} from "@/generated/soulfire/common_pb";

/**
 * Settings most people need first on built-in pages. The server still owns all
 * definitions. Anything not listed, including new server settings, stays
 * reachable under Advanced. Pages that are not listed show every setting.
 */
const COMMON_SETTINGS: Readonly<Record<string, readonly string[]>> = {
  bot: ["address", "protocol-version", "join-delay", "concurrent-connects"],
};

function identifierKey(id: SettingsEntryIdentifier): string {
  return `${id.namespace}:${id.key}`;
}

export function splitSettingsEntries(
  pageId: string,
  entries: readonly SettingsEntryIdentifier[],
): {
  common: SettingsEntryIdentifier[];
  advanced: SettingsEntryIdentifier[];
} {
  const commonKeys = COMMON_SETTINGS[pageId];
  if (!commonKeys) return { common: [...entries], advanced: [] };
  return {
    common: entries.filter((entry) => commonKeys.includes(entry.key)),
    advanced: entries.filter((entry) => !commonKeys.includes(entry.key)),
  };
}

/** All text a person might search for, as provided by the server. */
export function getSettingSearchText(definition: SettingsDefinition): string {
  const type = definition.type;
  const parts: string[] = [definition.id?.key ?? ""];
  switch (type.case) {
    case "minMax":
      parts.push(
        type.value.minEntry?.uiName ?? "",
        type.value.minEntry?.description ?? "",
        type.value.maxEntry?.uiName ?? "",
        type.value.maxEntry?.description ?? "",
      );
      break;
    case "combo":
      parts.push(
        type.value.uiName,
        type.value.description,
        ...type.value.options.map((option) => option.displayName),
      );
      break;
    case undefined:
      break;
    default:
      parts.push(type.value.uiName, type.value.description);
  }
  return parts.join(" ").toLowerCase();
}

export function filterSettingsEntries(
  entries: readonly SettingsEntryIdentifier[],
  definitions: readonly SettingsDefinition[],
  query: string,
): SettingsEntryIdentifier[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...entries];
  const byId = new Map(
    definitions.flatMap((definition) =>
      definition.id
        ? [[identifierKey(definition.id), definition] as const]
        : [],
    ),
  );
  return entries.filter((entry) => {
    const definition = byId.get(identifierKey(entry));
    if (!definition) return false;
    const text = getSettingSearchText(definition);
    return terms.every((term) => text.includes(term));
  });
}

/** Finds other settings pages with matches, so search works across pages. */
export function findSettingsOnOtherPages(
  currentPageId: string,
  pages: readonly SettingsPage[],
  definitions: readonly SettingsDefinition[],
  query: string,
): { page: SettingsPage; count: number }[] {
  if (query.trim() === "") return [];
  return pages.flatMap((page) => {
    if (page.id === currentPageId) return [];
    const count = filterSettingsEntries(
      page.entries,
      definitions,
      query,
    ).length;
    return count > 0 ? [{ page, count }] : [];
  });
}

export type PluginTask = "chat" | "survive" | "connect" | "diagnose" | "other";

export const PLUGIN_TASKS: readonly PluginTask[] = [
  "connect",
  "survive",
  "chat",
  "diagnose",
  "other",
];

// Logging comes first because a chat logger is a diagnostic tool, not chat.
const PLUGIN_TASK_PATTERNS: readonly (readonly [PluginTask, RegExp])[] = [
  ["diagnose", /\blog(s|ger|ging)?\b/i],
  ["chat", /\bchat|message|dialog|\bai\b/i],
  [
    "survive",
    /eat|food|armor|totem|respawn|attack|aura|afk|jump|combat|health/i,
  ],
  [
    "connect",
    /reconnect|register|captcha|bypass|virtual host|forwarding|client brand|client settings|connect|login|join/i,
  ],
];

/** Sorts plugins by the job they help with, from their server-provided text. */
export function classifyPluginTask(text: string): PluginTask {
  return (
    PLUGIN_TASK_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ??
    "other"
  );
}
