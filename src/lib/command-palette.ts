import { rankItem, rankings } from "@tanstack/match-sorter-utils";
import type { LinkOptions } from "@tanstack/react-router";
import type { ClientDataResponse } from "@/generated/soulfire/client_pb";
import {
  BotDesiredState,
  type BotListEntry,
} from "@/generated/soulfire/bot_pb";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import type { InstanceListResponse_Instance } from "@/generated/soulfire/instance_pb";
import type {
  ServerPlugin,
  SettingsDefinition,
  SettingsPage,
} from "@/generated/soulfire/common_pb";
import type { ScriptInfo } from "@/generated/soulfire/script_pb";
import type { InstanceInfoQueryData, ServerInfoQueryData } from "@/lib/types";
import { getBotDisplayState } from "@/lib/bot-fleet";
import {
  getSettingSearchTerms,
  PAGE_HIDDEN_SETTINGS,
} from "@/lib/settings-discovery";
import { getSettingLabel, isFocusedSetting } from "@/lib/settings-focus";

export type PaletteOperation =
  | {
      kind: "bot";
      instanceId: string;
      botIds: string[];
      action: "start" | "stop" | "restart";
    }
  | {
      kind: "script";
      instanceId: string;
      scriptId: string;
      action: "activate" | "deactivate";
    };

export type PaletteStatus = {
  label: string;
  tone: "neutral" | "success" | "warning" | "destructive";
};

export type PaletteAction =
  | "create-project"
  | "about"
  | "copy-url"
  | "copy-project-id"
  | "refresh"
  | "theme-light"
  | "theme-dark"
  | "theme-system"
  | "clear-recents"
  | "browse-project"
  | "browse-all";
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
  projectId?: string;
  description?: string;
  matchedText?: string;
  status?: PaletteStatus;
  icon: string;
  group: PaletteGroup;
  keywords?: readonly string[];
  /** Long server-provided text, such as descriptions. Matches contiguous text. */
  details?: readonly string[];
  /** Only shown for a search or type filter, so the default list stays short. */
  searchOnly?: boolean;
} & (
  | { destination: LinkOptions; action?: never; operation?: never }
  | { destination?: never; action: PaletteAction; operation?: never }
  | { destination?: never; action?: never; operation: PaletteOperation }
);

/** Metadata for a project outside the live context, read for global search. */
export type IndexedProject = {
  project: InstanceInfoQueryData;
  scripts?: readonly ScriptInfo[];
};

type CatalogOptions = {
  t: (key: string, options?: Record<string, string | number>) => string;
  client?: ClientDataResponse;
  instances: InstanceListResponse_Instance[];
  /** The project in context. Only this project gets live statuses and operations. */
  current?: InstanceInfoQueryData;
  scripts?: readonly ScriptInfo[];
  bots?: readonly BotListEntry[];
  indexed?: readonly IndexedProject[];
  server?: Pick<
    ServerInfoQueryData,
    "serverSettings" | "settingsDefinitions" | "plugins"
  >;
  demo?: boolean;
};

type SettingsTarget =
  | { kind: "project"; id: string; name: string }
  | { kind: "server"; name: string };

/** Admin pages with their own fixed commands. */
const STATIC_SERVER_PAGES = new Set(["server", "dev"]);

function settingDestination(
  target: SettingsTarget,
  pageId: string,
  focus?: { focusNamespace: string; focusKey: string },
): LinkOptions {
  if (target.kind === "server")
    return {
      to: "/user/admin/settings/$pageId",
      params: { pageId },
      search: focus,
    };
  const params = { instance: target.id };
  // Account and proxy settings live above their tables, not on a settings page.
  if (pageId === "account")
    return { to: "/instance/$instance/accounts", params, search: focus };
  if (pageId === "proxy")
    return { to: "/instance/$instance/proxies", params, search: focus };
  return {
    to: "/instance/$instance/settings/$pageId",
    params: { ...params, pageId },
    search: focus,
  };
}

/**
 * Page and field results for one settings source. Indexes server-provided
 * names, descriptions, and option labels. Never reads configured values.
 */
function settingsCommands(
  target: SettingsTarget,
  pages: readonly SettingsPage[],
  definitionList: readonly SettingsDefinition[],
  plugins: readonly Pick<ServerPlugin, "id" | "description">[],
  searchOnlyPages: boolean,
): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  const definitions = new Map(
    definitionList
      .filter((definition) => definition.id)
      .map((definition) => [
        `${definition.id!.namespace}:${definition.id!.key}`,
        definition,
      ]),
  );
  const scope =
    target.kind === "project"
      ? { context: target.name, projectId: target.id }
      : { context: target.name };
  const prefix = target.kind === "project" ? target.id : "server";
  for (const page of pages) {
    const plugin = plugins.find((entry) => entry.id === page.owningPluginId);
    const hidden = PAGE_HIDDEN_SETTINGS[page.id] ?? [];
    const entries = page.entries.flatMap((entry) => {
      if (
        isFocusedSetting(entry, page.enabledIdentifier) ||
        hidden.some((id) => isFocusedSetting(entry, id))
      )
        return [];
      const definition = definitions.get(`${entry.namespace}:${entry.key}`);
      return definition?.type.case ? [{ entry, definition }] : [];
    });
    const pageHasCommand =
      target.kind === "project"
        ? page.id !== "account" && page.id !== "proxy"
        : !STATIC_SERVER_PAGES.has(page.id);
    if (pageHasCommand)
      commands.push({
        ...scope,
        id:
          target.kind === "project"
            ? `settings:${prefix}:${page.id}`
            : `server-settings:${page.id}`,
        label: page.pageName,
        icon: page.iconId || "settings-2",
        group: "settings",
        searchOnly: searchOnlyPages,
        keywords: [
          page.id,
          page.owningPluginId ?? "",
          ...entries.map(({ definition }) => getSettingLabel(definition)),
        ],
        details: plugin?.description ? [plugin.description] : undefined,
        destination: settingDestination(target, page.id),
      });
    for (const { entry, definition } of entries) {
      const label = getSettingLabel(definition);
      commands.push({
        ...scope,
        id:
          target.kind === "project"
            ? `setting:${prefix}:${JSON.stringify([page.id, entry.namespace, entry.key])}`
            : `server-setting:${JSON.stringify([page.id, entry.namespace, entry.key])}`,
        label,
        description: page.pageName,
        icon: page.iconId || "settings-2",
        group: "settings",
        searchOnly: true,
        keywords: [
          entry.namespace,
          entry.key,
          page.id,
          page.owningPluginId ?? "",
        ],
        details: getSettingSearchTerms(definition).filter(
          (text) => text !== label && text !== entry.key,
        ),
        destination: settingDestination(target, page.id, {
          focusNamespace: entry.namespace,
          focusKey: entry.key,
        }),
      });
    }
  }
  return commands;
}

function paletteBotStatus(
  bot: BotListEntry | undefined,
  t: CatalogOptions["t"],
): PaletteStatus {
  const state = getBotDisplayState(bot);
  return {
    label: t(`commandPalette.status.${state}`),
    tone:
      state === "connected"
        ? "success"
        : state === "failed"
          ? "destructive"
          : state === "starting" || state === "retrying"
            ? "warning"
            : "neutral",
  };
}

export function createPaletteCommands({
  t,
  client,
  instances,
  current,
  scripts = [],
  bots,
  indexed = [],
  server,
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
      projectId: project.id,
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
    // Browsing loads one project's bots, scripts, and settings inside the menu.
    add({
      ...base,
      id: `browse-project:${project.id}`,
      label: t("commandPalette.browseProject"),
      icon: "folder-search",
      keywords: [...base.keywords, "browse", "switch"],
      action: "browse-project",
    });
  }

  if (
    current &&
    instances.some((instance) => instance.id === current.id) &&
    canInstance(current, InstancePermission.READ_INSTANCE)
  ) {
    commands.push(
      ...settingsCommands(
        { kind: "project", id: current.id, name: current.friendlyName },
        current.instanceSettings,
        current.settingsDefinitions,
        current.plugins,
        false,
      ),
    );
    const botSnapshot = canInstance(current, InstancePermission.READ_BOT_INFO)
      ? bots
      : undefined;
    const byBotId = new Map(botSnapshot?.map((bot) => [bot.profileId, bot]));
    if (canInstance(current, InstancePermission.READ_BOT_INFO)) {
      for (const account of current.profile.accounts) {
        add({
          id: `bot:${current.id}:${account.profileId}`,
          label: account.lastKnownName || account.profileId,
          context: current.friendlyName,
          projectId: current.id,
          status: botSnapshot
            ? paletteBotStatus(byBotId.get(account.profileId), t)
            : undefined,
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
        projectId: current.id,
        status: {
          label: t(
            `commandPalette.status.${script.paused ? "paused" : "active"}`,
          ),
          tone: script.paused ? "neutral" : "success",
        },
        icon: "scroll-text",
        group: "scripts",
        keywords: ["script", "automation", script.id],
        details: script.description ? [script.description] : undefined,
        destination: {
          to: "/instance/$instance/script/$scriptId",
          params: { instance: current.id, scriptId: script.id },
        },
      });
    }
    if (canInstance(current, InstancePermission.CONTROL_BOTS)) {
      const accounts = current.profile.accounts;
      const addBotOperation = (
        id: string,
        label: string,
        action: "start" | "stop" | "restart",
        botIds: string[],
        description?: string,
      ) => {
        if (!botIds.length) return;
        add({
          id,
          label,
          description,
          context: current.friendlyName,
          projectId: current.id,
          icon:
            action === "start"
              ? "play"
              : action === "stop"
                ? "square"
                : "rotate-cw",
          group: "actions",
          keywords: ["bot", "bots", "fleet", action, ...botIds],
          operation: { kind: "bot", action, instanceId: current.id, botIds },
        });
      };
      for (const account of accounts) {
        const name = account.lastKnownName || account.profileId;
        const bot = byBotId.get(account.profileId);
        const running =
          bot?.status?.desiredState === BotDesiredState.RUNNING ||
          bot?.isOnline;
        if (!botSnapshot || !running)
          addBotOperation(
            `start-bot:${current.id}:${account.profileId}`,
            t("commandPalette.operations.startBot", { name }),
            "start",
            [account.profileId],
          );
        if (!botSnapshot || running) {
          addBotOperation(
            `stop-bot:${current.id}:${account.profileId}`,
            t("commandPalette.operations.stopBot", { name }),
            "stop",
            [account.profileId],
          );
          addBotOperation(
            `restart-bot:${current.id}:${account.profileId}`,
            t("commandPalette.operations.restartBot", { name }),
            "restart",
            [account.profileId],
          );
        }
      }
      const stopped = accounts
        .filter((account) => {
          const bot = byBotId.get(account.profileId);
          return (
            bot?.status?.desiredState !== BotDesiredState.RUNNING &&
            !bot?.isOnline
          );
        })
        .map((account) => account.profileId);
      const running = accounts
        .filter((account) => {
          const bot = byBotId.get(account.profileId);
          return (
            bot?.status?.desiredState === BotDesiredState.RUNNING ||
            bot?.isOnline
          );
        })
        .map((account) => account.profileId);
      const failed = botSnapshot
        ? accounts
            .filter(
              (account) =>
                getBotDisplayState(byBotId.get(account.profileId)) === "failed",
            )
            .map((account) => account.profileId)
        : [];
      addBotOperation(
        `start-bots:${current.id}`,
        t("commandPalette.operations.startBots", { count: stopped.length }),
        "start",
        stopped,
      );
      addBotOperation(
        `stop-bots:${current.id}`,
        t("commandPalette.operations.stopBots", {
          count: botSnapshot ? running.length : accounts.length,
        }),
        "stop",
        botSnapshot ? running : accounts.map((account) => account.profileId),
      );
      addBotOperation(
        `retry-bots:${current.id}`,
        t("commandPalette.operations.retryBots", { count: failed.length }),
        "restart",
        failed,
      );
    }
    if (canInstance(current, InstancePermission.EXECUTE_SCRIPTS)) {
      for (const script of scripts) {
        const action = script.paused ? "activate" : "deactivate";
        add({
          id: `${action}-script:${current.id}:${script.id}`,
          label: t(`commandPalette.operations.${action}Script`, {
            name: script.name,
          }),
          context: current.friendlyName,
          projectId: current.id,
          icon: script.paused ? "play" : "pause",
          group: "actions",
          keywords: ["script", "automation", script.id, script.name],
          operation: {
            kind: "script",
            action,
            instanceId: current.id,
            scriptId: script.id,
          },
        });
      }
    }
    add({
      id: `copy-project-id:${current.id}`,
      label: t("commandPalette.copyProjectId"),
      context: current.friendlyName,
      projectId: current.id,
      icon: "copy",
      group: "actions",
      action: "copy-project-id",
    });
  }

  // Other projects come from the global index. They get destinations only:
  // no live status and no operations, because those need the project in context.
  const listed = new Map(instances.map((instance) => [instance.id, instance]));
  for (const { project, scripts: projectScripts } of indexed) {
    const entry = listed.get(project.id);
    if (
      project.id === current?.id ||
      !entry ||
      !canInstance(entry, InstancePermission.READ_INSTANCE) ||
      !canInstance(project, InstancePermission.READ_INSTANCE)
    )
      continue;
    const context = entry.friendlyName;
    commands.push(
      ...settingsCommands(
        { kind: "project", id: project.id, name: context },
        project.instanceSettings,
        project.settingsDefinitions,
        project.plugins,
        true,
      ),
    );
    if (
      canInstance(entry, InstancePermission.READ_BOT_INFO) &&
      canInstance(project, InstancePermission.READ_BOT_INFO)
    ) {
      for (const account of project.profile.accounts) {
        add({
          id: `bot:${project.id}:${account.profileId}`,
          label: account.lastKnownName || account.profileId,
          context,
          projectId: project.id,
          icon: "bot",
          group: "bots",
          searchOnly: true,
          keywords: ["bot", "player", account.profileId],
          destination: {
            to: "/instance/$instance/bot/$botId",
            params: { instance: project.id, botId: account.profileId },
          },
        });
      }
    }
    for (const script of projectScripts ?? []) {
      add({
        id: `script:${project.id}:${script.id}`,
        label: script.name,
        context,
        projectId: project.id,
        icon: "scroll-text",
        group: "scripts",
        searchOnly: true,
        keywords: ["script", "automation", script.id],
        details: script.description ? [script.description] : undefined,
        destination: {
          to: "/instance/$instance/script/$scriptId",
          params: { instance: project.id, scriptId: script.id },
        },
      });
    }
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
    if (server)
      commands.push(
        ...settingsCommands(
          { kind: "server", name: t("commandPalette.serverContext") },
          server.serverSettings,
          server.settingsDefinitions,
          server.plugins,
          false,
        ),
      );
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
  options: { currentProjectId?: string; recentIds?: readonly string[] } = {},
): PaletteCommand[] {
  const tokens = search.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return commands;
  return commands
    .map((command) => {
      const sources = [
        { text: command.label, weight: 8, strict: false },
        { text: command.context ?? "", weight: 3, strict: false },
        { text: command.description ?? "", weight: 2, strict: false },
        ...(command.keywords ?? []).map((text) => ({
          text,
          weight: 1.5,
          strict: false,
        })),
        // Scattered letters match almost any long description, so require substrings.
        ...(command.details ?? []).map((text) => ({
          text,
          weight: 1,
          strict: true,
        })),
      ];
      const passes = (source: (typeof sources)[number], token: string) =>
        rankItem(
          source.text,
          token,
          source.strict ? { threshold: rankings.CONTAINS } : undefined,
        );
      const ranks = tokens.map((token) =>
        Math.max(
          ...sources.map((source) => {
            const rank = passes(source, token);
            return rank.passed ? rank.rank * source.weight : 0;
          }),
        ),
      );
      let score = ranks.every((rank) => rank > 0)
        ? ranks.reduce((sum, rank) => sum + rank, 0)
        : 0;
      if (score) {
        const label = normalizePaletteText(command.label);
        const query = normalizePaletteText(search.trim());
        if (label === query) score += 500;
        else if (label.startsWith(query)) score += 120;
        if (command.projectId && command.projectId === options.currentProjectId)
          score += 2;
        const recentIndex = options.recentIds?.indexOf(command.id) ?? -1;
        if (recentIndex >= 0) score += Math.max(0, 2 - recentIndex * 0.25);
      }
      // Explain a match the label does not show, preferring readable words.
      const reasons = sources.slice(2).filter((source) => source.text);
      const matchedText =
        score && tokens.some((token) => !rankItem(command.label, token).passed)
          ? (
              reasons.find((source) =>
                tokens.some(
                  (token) =>
                    rankItem(source.text, token, {
                      threshold: rankings.CONTAINS,
                    }).passed,
                ),
              ) ??
              reasons.find((source) =>
                tokens.some((token) => passes(source, token).passed),
              )
            )?.text
          : undefined;
      return {
        command: matchedText ? { ...command, matchedText } : command,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}

export type PaletteFilter =
  | "all"
  | "projects"
  | "bots"
  | "scripts"
  | "settings"
  | "actions";
export const PALETTE_FILTERS: readonly PaletteFilter[] = [
  "all",
  "projects",
  "bots",
  "scripts",
  "settings",
  "actions",
];

/** Type filters overlap: a bot operation is both a bot result and an action. */
export function matchesPaletteFilter(
  command: PaletteCommand,
  filter: PaletteFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "projects":
      return (
        command.group === "projects" ||
        command.group === "currentProject" ||
        command.action === "browse-project"
      );
    case "bots":
      return command.group === "bots" || command.operation?.kind === "bot";
    case "scripts":
      return (
        command.group === "scripts" || command.operation?.kind === "script"
      );
    case "settings":
      return command.group === "settings";
    case "actions":
      return Boolean(command.action || command.operation);
  }
}

function normalizePaletteText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Split display text into plain and matched spans without interpreting markup. */
export function paletteMatchSegments(
  value: string,
  search: string,
): { text: string; matched: boolean }[] {
  const positions: { start: number; end: number }[] = [];
  let normalized = "";
  let offset = 0;
  for (const character of value) {
    const plain = normalizePaletteText(character);
    if (!plain && positions.length)
      positions[positions.length - 1].end = offset + character.length;
    for (const unit of plain) {
      normalized += unit;
      for (let index = 0; index < unit.length; index++)
        positions.push({ start: offset, end: offset + character.length });
    }
    offset += character.length;
  }
  const matched = new Set<number>();
  for (const token of normalizePaletteText(search)
    .trim()
    .split(/\s+/)
    .filter(Boolean)) {
    let found = false;
    for (
      let start = normalized.indexOf(token);
      start >= 0;
      start = normalized.indexOf(token, start + token.length)
    ) {
      found = true;
      for (let index = start; index < start + token.length; index++)
        matched.add(index);
    }
    if (!found && rankItem(value, token).passed) {
      const indexes: number[] = [];
      let from = 0;
      for (const character of token) {
        const index = normalized.indexOf(character, from);
        if (index < 0) break;
        indexes.push(index);
        from = index + character.length;
      }
      if (indexes.length === [...token].length)
        indexes.forEach((index) => matched.add(index));
    }
  }
  const mask = Array.from({ length: value.length }, () => false);
  for (const index of matched) {
    const position = positions[index];
    if (position)
      for (let at = position.start; at < position.end; at++) mask[at] = true;
  }
  const segments: { text: string; matched: boolean }[] = [];
  for (let index = 0; index < value.length; index++) {
    const last = segments[segments.length - 1];
    if (last?.matched === mask[index]) last.text += value[index];
    else segments.push({ text: value[index], matched: mask[index] });
  }
  return segments;
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
