import { rankItem } from "@tanstack/match-sorter-utils";
import type { LinkOptions } from "@tanstack/react-router";
import type { ClientDataResponse } from "@/generated/soulfire/client_pb";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import type { InstanceListResponse_Instance } from "@/generated/soulfire/instance_pb";
import type { ScriptInfo } from "@/generated/soulfire/script_pb";
import type { InstanceInfoQueryData } from "@/lib/types";

export type PaletteAction =
  | "create-project"
  | "about"
  | "copy-url"
  | "copy-project-id"
  | "refresh"
  | "theme-light"
  | "theme-dark"
  | "theme-system"
  | "clear-recents";
export type PaletteGroup =
  | "navigation"
  | "currentProject"
  | "projects"
  | "settings"
  | "bots"
  | "scripts"
  | "admin"
  | "actions";
export type PaletteCommand = {
  id: string;
  label: string;
  context?: string;
  icon: string;
  group: PaletteGroup;
  keywords?: readonly string[];
} & (
  | { destination: LinkOptions; action?: never }
  | { destination?: never; action: PaletteAction }
);

type CatalogOptions = {
  t: (key: string) => string;
  client?: ClientDataResponse;
  instances: InstanceListResponse_Instance[];
  current?: InstanceInfoQueryData;
  scripts?: ScriptInfo[];
  demo?: boolean;
};

export function createPaletteCommands({
  t,
  client,
  instances,
  current,
  scripts = [],
  demo = false,
}: CatalogOptions): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  const canGlobal = (permission: GlobalPermission) =>
    Boolean(
      client &&
      (demo ||
        client.serverPermissions.some(
          (p) => p.granted && p.globalPermission === permission,
        )),
    );
  const canInstance = (
    instance: InstanceListResponse_Instance | InstanceInfoQueryData,
    permission: InstancePermission,
  ) =>
    demo ||
    instance.instancePermissions.some(
      (p) => p.granted && p.instancePermission === permission,
    );
  const add = (command: PaletteCommand) => commands.push(command);

  add({
    id: "projects",
    label: t("userSidebar.instances"),
    icon: "grid-2x2",
    group: "navigation",
    keywords: ["projects", "instances", "dashboard", "home"],
    destination: { to: "/user" },
  });
  add({
    id: "access",
    label: t("userSidebar.access"),
    icon: "key-round",
    group: "navigation",
    keywords: ["api", "tokens", "webdav"],
    destination: { to: "/user/access" },
  });
  add({
    id: "user-settings",
    label: t("userSidebar.settings"),
    icon: "user-round-cog",
    group: "navigation",
    keywords: ["account", "profile", "email", "username"],
    destination: { to: "/user/settings" },
  });
  add({
    id: "cast",
    label: t("castMenu.title"),
    icon: "cast",
    group: "navigation",
    keywords: ["cast", "screen", "display"],
    destination: { to: "/cast", search: { instance: current?.id } },
  });

  // The current project comes first; stable IDs distinguish identically named projects.
  const ordered = [...instances].sort(
    (a, b) =>
      Number(b.id === current?.id) - Number(a.id === current?.id) ||
      a.friendlyName.localeCompare(b.friendlyName),
  );
  for (const instance of ordered) {
    const project = instance.id === current?.id ? current : instance;
    if (!canInstance(project, InstancePermission.READ_INSTANCE)) continue;
    const params = { instance: project.id };
    const context = project.friendlyName;
    const group = project.id === current?.id ? "currentProject" : "projects";
    const base = {
      context,
      group,
      keywords: [project.id, "project", "instance"],
    } as const;
    add({
      ...base,
      id: `project:${project.id}`,
      label: t("instanceSidebar.overview"),
      icon: project.icon || "folder",
      destination: { to: "/instance/$instance", params },
    });
    if (
      canInstance(project, InstancePermission.INSTANCE_SUBSCRIBE_LOGS) ||
      canInstance(project, InstancePermission.INSTANCE_COMMAND_EXECUTION)
    ) {
      add({
        ...base,
        id: `terminal:${project.id}`,
        label: t("instanceSidebar.terminal"),
        icon: "square-terminal",
        keywords: [...base.keywords, "console", "logs", "commands"],
        destination: { to: "/instance/$instance/terminal", params },
      });
    }
    if (canInstance(project, InstancePermission.READ_BOT_INFO)) {
      add({
        ...base,
        id: `bots:${project.id}`,
        label: t("instanceSidebar.bots"),
        icon: "bot",
        keywords: [...base.keywords, "players", "fleet"],
        destination: { to: "/instance/$instance/bots", params },
      });
    }
    if (canInstance(project, InstancePermission.READ_INSTANCE_AUDIT_LOGS)) {
      add({
        ...base,
        id: `audit:${project.id}`,
        label: t("instanceSidebar.audit-log"),
        icon: "text-search",
        destination: { to: "/instance/$instance/audit-log", params },
      });
    }
    add({
      ...base,
      id: `accounts:${project.id}`,
      label: t("instanceSidebar.accountSettings"),
      icon: "users",
      keywords: [...base.keywords, "minecraft", "accounts", "import"],
      destination: { to: "/instance/$instance/accounts", params },
    });
    add({
      ...base,
      id: `proxies:${project.id}`,
      label: t("instanceSidebar.proxySettings"),
      icon: "waypoints",
      keywords: [...base.keywords, "proxies", "network", "import"],
      destination: { to: "/instance/$instance/proxies", params },
    });
    add({
      ...base,
      id: `scripts:${project.id}`,
      label: t("instanceSidebar.instanceScripts"),
      icon: "scroll-text",
      keywords: [...base.keywords, "automation", "scripts", "editor"],
      destination: { to: "/instance/$instance/scripts", params },
    });
    add({
      ...base,
      id: `plugins:${project.id}`,
      label: t("instanceSidebar.discoverPlugins"),
      icon: "blocks",
      keywords: [...base.keywords, "plugins", "extensions"],
      destination: { to: "/instance/$instance/discover", params },
    });
    add({
      ...base,
      id: `sdk:${project.id}`,
      label: t("sdk.title"),
      icon: "code-xml",
      keywords: [...base.keywords, "sdk", "python", "typescript", "api"],
      destination: { to: "/instance/$instance/sdk", params },
    });
    if (canInstance(project, InstancePermission.UPDATE_INSTANCE_META)) {
      add({
        ...base,
        id: `meta:${project.id}`,
        label: t("instanceSidebar.metaSettings"),
        icon: "settings",
        keywords: [...base.keywords, "rename", "icon"],
        destination: { to: "/instance/$instance/meta", params },
      });
    }
  }

  if (
    current &&
    instances.some((instance) => instance.id === current.id) &&
    canInstance(current, InstancePermission.READ_INSTANCE)
  ) {
    const definitions = new Map(
      current.settingsDefinitions
        .filter((definition) => definition.id)
        .map((definition) => [
          `${definition.id!.namespace}:${definition.id!.key}`,
          definition,
        ]),
    );
    for (const page of current.instanceSettings) {
      if (page.id === "account" || page.id === "proxy") continue;
      const plugin = current.plugins.find(
        (entry) => entry.id === page.owningPluginId,
      );
      // Index setting names and identifiers, never configured values or credentials.
      const keywords = page.entries.flatMap((entry) => {
        const definition = definitions.get(`${entry.namespace}:${entry.key}`);
        const setting = definition?.type.value;
        const names =
          definition?.type.case === "minMax"
            ? [
                definition.type.value.minEntry?.uiName ?? "",
                definition.type.value.maxEntry?.uiName ?? "",
              ]
            : [setting && "uiName" in setting ? setting.uiName : ""];
        return [entry.namespace, entry.key, ...names];
      });
      add({
        id: `settings:${current.id}:${page.id}`,
        label: page.pageName,
        context: current.friendlyName,
        icon: page.iconId || "settings-2",
        group: "settings",
        keywords: [
          page.id,
          page.owningPluginId ?? "",
          plugin?.description ?? "",
          ...keywords,
        ],
        destination: {
          to: "/instance/$instance/settings/$pageId",
          params: { instance: current.id, pageId: page.id },
        },
      });
    }
    if (canInstance(current, InstancePermission.READ_BOT_INFO)) {
      for (const account of current.profile.accounts) {
        add({
          id: `bot:${current.id}:${account.profileId}`,
          label: account.lastKnownName || account.profileId,
          context: current.friendlyName,
          icon: "bot",
          group: "bots",
          keywords: ["bot", "player", account.profileId],
          destination: {
            to: "/instance/$instance/bot/$botId",
            params: { instance: current.id, botId: account.profileId },
          },
        });
      }
    }
    for (const script of scripts) {
      add({
        id: `script:${current.id}:${script.id}`,
        label: script.name,
        context: current.friendlyName,
        icon: "scroll-text",
        group: "scripts",
        keywords: ["script", "automation", script.id, script.description],
        destination: {
          to: "/instance/$instance/script/$scriptId",
          params: { instance: current.id, scriptId: script.id },
        },
      });
    }
    add({
      id: "copy-project-id",
      label: t("commandPalette.copyProjectId"),
      context: current.friendlyName,
      icon: "copy",
      group: "actions",
      action: "copy-project-id",
    });
  }

  if (canGlobal(GlobalPermission.READ_SERVER_CONFIG)) {
    add({
      id: "admin-overview",
      label: t("commandPalette.serverOverview"),
      icon: "chart-area",
      group: "admin",
      destination: { to: "/user/admin" },
    });
    add({
      id: "server-settings",
      label: t("userSidebar.serverSettings"),
      icon: "server",
      group: "admin",
      destination: {
        to: "/user/admin/settings/$pageId",
        params: { pageId: "server" },
      },
    });
    add({
      id: "dev-settings",
      label: t("userSidebar.devSettings"),
      icon: "bug",
      group: "admin",
      destination: {
        to: "/user/admin/settings/$pageId",
        params: { pageId: "dev" },
      },
    });
    if (canGlobal(GlobalPermission.GLOBAL_SUBSCRIBE_LOGS))
      add({
        id: "admin-logs",
        label: t("userSidebar.adminLogs"),
        icon: "logs",
        group: "admin",
        destination: { to: "/user/admin/logs" },
      });
    if (
      canGlobal(GlobalPermission.GLOBAL_SUBSCRIBE_LOGS) ||
      canGlobal(GlobalPermission.GLOBAL_COMMAND_EXECUTION)
    )
      add({
        id: "admin-terminal",
        label: t("userSidebar.adminTerminal"),
        icon: "square-terminal",
        group: "admin",
        destination: { to: "/user/admin/terminal" },
      });
    if (canGlobal(GlobalPermission.READ_USER))
      add({
        id: "admin-users",
        label: t("userSidebar.users"),
        icon: "users",
        group: "admin",
        destination: { to: "/user/admin/users" },
      });
  }
  if (canGlobal(GlobalPermission.CREATE_INSTANCE))
    add({
      id: "create-project",
      label: t("userSidebar.createInstance"),
      icon: "plus",
      group: "actions",
      action: "create-project",
      keywords: ["new", "project", "instance"],
    });
  for (const theme of ["light", "dark", "system"] as const) {
    add({
      id: `theme-${theme}`,
      label: t(`commandPalette.theme.${theme}`),
      icon: theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor",
      group: "actions",
      action: `theme-${theme}`,
      keywords: ["theme", "appearance", theme],
    });
  }
  add({
    id: "copy-url",
    label: t("commandPalette.copyUrl"),
    icon: "link",
    group: "actions",
    action: "copy-url",
  });
  add({
    id: "refresh",
    label: t("commandPalette.refresh"),
    icon: "refresh-cw",
    group: "actions",
    action: "refresh",
  });
  add({
    id: "about",
    label: t("userSidebar.about"),
    icon: "circle-help",
    group: "actions",
    action: "about",
  });
  add({
    id: "clear-recents",
    label: t("commandPalette.clearRecents"),
    icon: "history",
    group: "actions",
    action: "clear-recents",
  });
  return commands;
}

export function searchPaletteCommands(
  commands: PaletteCommand[],
  search: string,
): PaletteCommand[] {
  const tokens = search.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return commands;
  return commands
    .map((command) => {
      const text = [command.label, command.context, ...(command.keywords ?? [])]
        .filter(Boolean)
        .join(" ");
      const ranks = tokens.map((token) => rankItem(text, token));
      return {
        command,
        score: ranks.every((rank) => rank.passed)
          ? ranks.reduce((sum, rank) => sum + rank.rank, 0)
          : 0,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}

const RECENT_LIMIT = 8;
export function readPaletteRecents(
  storage: Pick<Storage, "getItem">,
  key: string,
): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter((id): id is string => typeof id === "string"),
          ),
        ].slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberPaletteCommand(
  recents: string[],
  id: string,
): string[] {
  return [id, ...recents.filter((entry) => entry !== id)].slice(
    0,
    RECENT_LIMIT,
  );
}

export function resolvePaletteRecents(
  commands: PaletteCommand[],
  recents: string[],
): PaletteCommand[] {
  const byId = new Map(
    commands
      .filter((command) => command.destination)
      .map((command) => [command.id, command]),
  );
  return recents.flatMap((id) => byId.get(id) ?? []);
}

export function isPaletteShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "ctrlKey"
    | "metaKey"
    | "altKey"
    | "shiftKey"
    | "repeat"
    | "isComposing"
  >,
): boolean {
  return (
    !event.repeat &&
    !event.isComposing &&
    !event.altKey &&
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "k"
  );
}

export function isPaletteTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=textbox], [role=combobox]",
      ),
    )
  );
}
