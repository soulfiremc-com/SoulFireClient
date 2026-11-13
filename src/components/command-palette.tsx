import {
  type QueryFunction,
  skipToken,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useMatch,
  useNavigate,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  CornerDownLeftIcon,
  LayersIcon,
  LoaderCircleIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CommandPaletteContext,
  type OpenCommandPalette,
} from "@/components/command-palette-context";
import { AboutContext } from "@/components/dialog/about-dialog";
import { CreateInstanceContext } from "@/components/dialog/create-instance-dialog";
import DynamicIcon from "@/components/dynamic-icon";
import { TransportContext } from "@/components/providers/transport-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import { usePaletteSearchIndex } from "@/hooks/use-palette-search-index";
import { botStatusRpcQueryOptions } from "@/lib/bot-status-query";
import {
  createPaletteCommands,
  isPaletteShortcut,
  isPaletteTypingTarget,
  matchesPaletteFilter,
  PALETTE_FILTERS,
  paletteMatchSegments,
  readPaletteRecents,
  rememberPaletteCommand,
  resolvePaletteRecents,
  searchPaletteCommands,
  type PaletteCommand,
  type PaletteFilter,
  type PaletteGroup,
} from "@/lib/command-palette";
import { isPaletteIndexComplete } from "@/lib/command-palette-index";
import {
  isPaletteOperationPending,
  isPaletteOperationAvailable,
  needsPaletteConfirmation,
  startPaletteOperation,
} from "@/lib/command-palette-operations";
import {
  isPalettePinned,
  PIN_LIMIT,
  type PalettePin,
  palettePinKey,
  prunePalettePins,
  readPalettePins,
  resolvePalettePins,
  togglePalettePin,
} from "@/lib/command-palette-pins";
import { desktop, formatShortcut, isDesktopApp } from "@/lib/desktop";
import { fetchInstanceInfo } from "@/lib/instance-info-query";
import { scriptListQueryOptions } from "@/lib/script-service";
import type { InstanceInfoQueryData } from "@/lib/types";
import { cn, hasGlobalPermission, hasInstancePermission } from "@/lib/utils";
import { getServerAddress } from "@/lib/web-rpc";

const DEFAULT_GROUP_ORDER: PaletteGroup[] = [
  "navigation",
  "currentProject",
  "actions",
  "admin",
  "settings",
  "scripts",
  "bots",
  "projects",
];
const RESULT_LIMIT = 80;
// cmdk handles these keys anywhere in the menu. Buttons keep them for themselves.
const LIST_KEYS = new Set(["Enter", "ArrowUp", "ArrowDown", "Home", "End"]);

type GroupKey = PaletteGroup | "pinned" | "recent" | "results";
type EscapeHandler = () => boolean;

function keepListKeys(event: ReactKeyboardEvent) {
  if (LIST_KEYS.has(event.key)) event.stopPropagation();
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const lastShift = useRef<number | null>(null);
  const shiftPressedAt = useRef<number | null>(null);
  const recentCache = useRef(new Map<string, string[]>());
  const pinCache = useRef(new Map<string, PalettePin[]>());
  const escapeHandler = useRef<EscapeHandler | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const restorePreviousFocus = useRef(true);
  const [initialSearch, setInitialSearch] = useState("");
  const show = useCallback<OpenCommandPalette>((options) => {
    setInitialSearch(options?.search ?? "");
    restorePreviousFocus.current = true;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOpen(true);
  }, []);

  useEffect(() => {
    const hasOtherDialog = () =>
      Boolean(
        document.querySelector(
          '[role="dialog"]:not([data-closed]), [role="alertdialog"]:not([data-closed])',
        ),
      );
    const resetShift = () => {
      lastShift.current = null;
      shiftPressedAt.current = null;
    };
    const down = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        document.pointerLockElement ||
        event.isComposing
      ) {
        resetShift();
        return;
      }
      if (isPaletteShortcut(event) && (open || !hasOtherDialog())) {
        event.preventDefault();
        resetShift();
        if (open) setOpen(false);
        else show();
        return;
      }
      if (
        event.key !== "Shift" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        open ||
        hasOtherDialog() ||
        isPaletteTypingTarget(event.target)
      ) {
        resetShift();
        return;
      }
      shiftPressedAt.current = event.timeStamp;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || shiftPressedAt.current === null) return;
      const duration = event.timeStamp - shiftPressedAt.current;
      shiftPressedAt.current = null;
      if (
        duration > 500 ||
        event.defaultPrevented ||
        event.isComposing ||
        document.pointerLockElement ||
        isPaletteTypingTarget(event.target) ||
        hasOtherDialog()
      ) {
        resetShift();
        return;
      }
      if (
        lastShift.current !== null &&
        event.timeStamp - lastShift.current <= 500
      ) {
        resetShift();
        show();
      } else {
        lastShift.current = event.timeStamp;
      }
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", resetShift);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", resetShift);
    };
  }, [open, show]);

  return (
    <CommandPaletteContext value={show}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={(next, details) => {
          // Escape first leaves a confirmation, the project picker, or a browsed project.
          if (
            !next &&
            details.reason === "escape-key" &&
            escapeHandler.current?.()
          )
            return;
          setOpen(next);
        }}
        title={t("commandPalette.title")}
        description={t("commandPalette.description")}
        finalFocus={() =>
          restorePreviousFocus.current ? previousFocus.current : false
        }
        className="top-[15dvh] flex max-h-[75dvh] flex-col sm:max-w-2xl"
      >
        {open && (
          <CommandPaletteContent
            initialSearch={initialSearch}
            recentCache={recentCache.current}
            pinCache={pinCache.current}
            escapeHandler={escapeHandler}
            onClose={(restoreFocus = true) => {
              restorePreviousFocus.current = restoreFocus;
              setOpen(false);
            }}
          />
        )}
      </CommandDialog>
    </CommandPaletteContext>
  );
}

/** The visible search entry in page headers. Icon only on narrow screens. */
export function CommandPaletteTrigger() {
  const show = use(CommandPaletteContext);
  const { t } = useTranslation("common");
  if (!show) return null;
  const shortcut = formatShortcut("Ctrl+K");
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-8 justify-center px-2 font-normal text-muted-foreground sm:w-40 sm:justify-start lg:w-56"
      title={t("commandPalette.shortcutHint", { shortcut })}
      aria-label={t("commandPalette.triggerLabel", { shortcut })}
      aria-keyshortcuts="Control+k Meta+k"
      onClick={() => show()}
    >
      <SearchIcon data-icon="inline-start" />
      <span className="hidden min-w-0 truncate sm:inline">
        {t("commandPalette.trigger")}
      </span>{" "}
      {/* The space keeps the visible text inside the accessible name. */}
      <Kbd
        aria-hidden="true"
        className="ml-auto hidden text-foreground sm:inline-flex"
      >
        {shortcut}
      </Kbd>
    </Button>
  );
}

function readRecents(key: string) {
  try {
    return readPaletteRecents(localStorage, key);
  } catch {
    return [];
  }
}

function readPins(key: string) {
  try {
    return readPalettePins(localStorage, key);
  } catch {
    return [];
  }
}

function CommandPaletteContent({
  initialSearch,
  onClose,
  recentCache,
  pinCache,
  escapeHandler,
}: {
  initialSearch: string;
  onClose: (restoreFocus?: boolean) => void;
  recentCache: Map<string, string[]>;
  pinCache: Map<string, PalettePin[]>;
  escapeHandler: RefObject<EscapeHandler | null>;
}) {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState<PaletteFilter>("all");
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState<PaletteCommand | null>(null);
  const [selected, setSelected] = useState("");
  const [, setPinRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const transport = use(TransportContext);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const { openAbout } = use(AboutContext);
  const { openCreateInstance } = use(CreateInstanceContext);
  const { clientDataQueryOptions, instanceListQueryOptions } = useRouteContext({
    from: "/_dashboard",
  });
  const instanceMatch = useMatch({
    from: "/_dashboard/instance/$instance",
    shouldThrow: false,
  });
  const client = useQuery({
    ...clientDataQueryOptions,
    refetchInterval: false,
  });
  const instances = useQuery({
    ...instanceListQueryOptions,
    refetchInterval: false,
  });
  const accessibleIds = useMemo(
    () =>
      new Set(
        instances.isError
          ? []
          : (instances.data?.instances.map((instance) => instance.id) ?? []),
      ),
    [instances.data, instances.isError],
  );
  // A browsed project can be deleted or revoked while the menu is open.
  const browseRevoked = Boolean(
    browseId && instances.isSuccess && !accessibleIds.has(browseId),
  );
  const browsing = browseRevoked ? null : browseId;
  const routeId = instanceMatch?.params.instance;
  // Search covers every project unless the user picks one. The route project
  // stays in context for live bot status, operations, and ranking.
  const scopeId = browsing ?? routeId;
  const routeInfoFn =
    scopeId === routeId
      ? instanceMatch?.context.instanceInfoQueryOptions.queryFn
      : undefined;
  const infoFn:
    | QueryFunction<InstanceInfoQueryData, string[]>
    | typeof skipToken = !scopeId
    ? skipToken
    : (routeInfoFn ??
      (transport
        ? ({ signal }) =>
            fetchInstanceInfo(transport, scopeId, queryClient, signal)
        : skipToken));
  const info = useQuery({
    queryKey: ["instance-info", scopeId ?? ""],
    queryFn: infoFn,
    refetchInterval: false,
  });
  const infoEnabled = infoFn !== skipToken;
  const scopeProject =
    !info.isError &&
    info.data?.id === scopeId &&
    scopeId &&
    accessibleIds.has(scopeId)
      ? info.data
      : undefined;
  const canReadScope = Boolean(
    scopeProject &&
    hasInstancePermission(scopeProject, InstancePermission.READ_INSTANCE),
  );
  const canReadBots = Boolean(
    canReadScope &&
    scopeProject &&
    scopeProject.profile.accounts.length > 0 &&
    hasInstancePermission(scopeProject, InstancePermission.READ_BOT_INFO),
  );
  const scripts = useQuery({
    ...scriptListQueryOptions(transport, scopeProject?.id ?? ""),
    enabled: canReadScope,
    refetchInterval: false,
  });
  // One list query per open menu keeps bot status current without per-bot requests.
  const bots = useQuery({
    ...botStatusRpcQueryOptions(transport, scopeProject?.id ?? ""),
    enabled: canReadBots,
    refetchInterval: 5_000,
  });
  const demo = transport === null;
  const canReadServer = Boolean(
    client.data &&
    !client.isError &&
    (demo ||
      hasGlobalPermission(client.data, GlobalPermission.READ_SERVER_CONFIG)),
  );
  const indexIds = useMemo(
    () =>
      instances.isError
        ? []
        : (instances.data?.instances ?? [])
            .filter(
              (instance) =>
                instance.id !== scopeId &&
                hasInstancePermission(
                  instance,
                  InstancePermission.READ_INSTANCE,
                ),
            )
            .map((instance) => instance.id),
    [instances.data, instances.isError, scopeId],
  );
  // Global search reads other projects only once someone searches or filters.
  const wantsIndex =
    !browsing && !picking && (search.trim() !== "" || filter !== "all");
  const [indexRequested, setIndexRequested] = useState(wantsIndex);
  if (wantsIndex && !indexRequested) setIndexRequested(true);
  if (browsing && indexRequested) setIndexRequested(false);
  const indexing = indexRequested && !browsing;
  const index = usePaletteSearchIndex({
    active: indexing,
    projectIds: indexIds,
    includeServer: canReadServer,
    transport,
  });
  const indexComplete = isPaletteIndexComplete(index.progress);
  const commands = useMemo(
    () =>
      createPaletteCommands({
        t: (key, options) => t(key, options ?? {}),
        client: client.isError ? undefined : client.data,
        instances: instances.isError ? [] : (instances.data?.instances ?? []),
        current: scopeProject,
        scripts: scripts.isError ? [] : scripts.data?.scripts,
        bots: canReadBots && !bots.isError ? bots.data?.bots : undefined,
        indexed: browsing ? [] : index.projects,
        server: canReadServer && !browsing ? index.server : undefined,
        demo,
      }),
    [
      t,
      client.data,
      client.isError,
      instances.data,
      instances.isError,
      scopeProject,
      scripts.data,
      scripts.isError,
      canReadBots,
      bots.data,
      bots.isError,
      browsing,
      index.projects,
      index.server,
      canReadServer,
      demo,
    ],
  );

  const recentKey = `sf-palette-recents:${JSON.stringify([getServerAddress(), client.data?.id])}`;
  // Recents change only when a destination opens, which also closes the menu.
  const recentIds = useMemo(
    () => recentCache.get(recentKey) ?? readRecents(recentKey),
    [recentCache, recentKey],
  );
  const pinKey = palettePinKey(getServerAddress(), client.data?.id ?? "");
  const pins = pinCache.get(pinKey) ?? readPins(pinKey);

  const query = search.trim();
  const scoped = useMemo(
    () =>
      picking
        ? [
            {
              id: "browse-all",
              label: t("commandPalette.allProjects"),
              icon: "layers",
              group: "projects",
              action: "browse-all",
            } satisfies PaletteCommand,
            ...commands.filter(
              (command) => command.action === "browse-project",
            ),
          ]
        : commands.filter(
            (command) =>
              matchesPaletteFilter(command, filter) &&
              (!browsing ||
                (command.projectId === browsing &&
                  command.action !== "browse-project")),
          ),
    [picking, commands, filter, browsing, t],
  );
  // Field settings and other projects' results wait for a search or filter.
  const listAll = query !== "" || filter !== "all" || picking;
  const pool = useMemo(
    () => (listAll ? scoped : scoped.filter((command) => !command.searchOnly)),
    [listAll, scoped],
  );
  const scopedIds = new Set(scoped.map((command) => command.id));
  const matches = useMemo(
    () =>
      searchPaletteCommands(pool, search, {
        currentProjectId: scopeId,
        recentIds,
      }),
    [pool, search, scopeId, recentIds],
  );
  const groups = new Map<GroupKey, PaletteCommand[]>();
  if (query) {
    // Keep one ranked list so a weaker match never appears above a better one.
    if (matches.length) groups.set("results", matches.slice(0, RESULT_LIMIT));
  } else if (picking) {
    if (matches.length) groups.set("projects", matches.slice(0, RESULT_LIMIT));
  } else {
    const pinned = resolvePalettePins(commands, pins).filter((command) =>
      scopedIds.has(command.id),
    );
    const shown = new Set(pinned.map((command) => command.id));
    const recents = resolvePaletteRecents(scoped, recentIds).filter(
      (command) => !shown.has(command.id),
    );
    for (const command of recents) shown.add(command.id);
    if (pinned.length) groups.set("pinned", pinned);
    if (recents.length) groups.set("recent", recents);
    const rest = matches
      .filter((command) => !shown.has(command.id))
      .sort(
        (a, b) =>
          DEFAULT_GROUP_ORDER.indexOf(a.group) -
          DEFAULT_GROUP_ORDER.indexOf(b.group),
      )
      .slice(0, Math.max(0, RESULT_LIMIT - pinned.length - recents.length));
    for (const command of rest) {
      const group = groups.get(command.group) ?? [];
      group.push(command);
      groups.set(command.group, group);
    }
  }
  const visible = [...groups.values()].flat();
  const firstVisibleId = visible[0]?.id ?? "";
  const selectedVisible = visible.some((command) => command.id === selected);
  useEffect(() => {
    if (!confirming && !selectedVisible) setSelected(firstVisibleId);
  }, [confirming, selected, selectedVisible, firstVisibleId]);
  const selectedCommand = confirming
    ? undefined
    : visible.find((command) => command.id === selected);
  const selectedPinned = Boolean(
    selectedCommand && isPalettePinned(pins, selectedCommand.id),
  );
  const visibleIds = new Set(visible.map((command) => command.id));
  const hiddenCount = matches.filter(
    (command) => !visibleIds.has(command.id),
  ).length;

  const focusInput = () =>
    requestAnimationFrame(() => inputRef.current?.focus());
  const saveRecents = (ids: string[]) => {
    recentCache.set(recentKey, ids);
    if (!client.data) return;
    try {
      localStorage.setItem(recentKey, JSON.stringify(ids));
    } catch {
      // Keep this session's history when browser storage is unavailable.
    }
  };
  const savePins = (next: PalettePin[]) => {
    pinCache.set(pinKey, next);
    setPinRevision((revision) => revision + 1);
    if (!client.data) return;
    try {
      localStorage.setItem(pinKey, JSON.stringify(next));
    } catch {
      // Keep this session's pins when browser storage is unavailable.
    }
  };
  const togglePin = (command: PaletteCommand) => {
    // Pins for deleted or revoked projects free their slots here.
    const current = instances.isSuccess
      ? prunePalettePins(pins, accessibleIds)
      : pins;
    const next = togglePalettePin(current, command);
    if (!next) {
      toast.info(t("commandPalette.pinLimit", { count: PIN_LIMIT }));
      return;
    }
    savePins(next);
  };
  const browseProject = (projectId: string) => {
    setBrowseId(projectId);
    setPicking(false);
    setSearch("");
    focusInput();
  };
  const leaveProject = () => {
    setBrowseId(null);
    setPicking(false);
    setSearch("");
    focusInput();
  };
  const goBack = (): boolean => {
    if (confirming) {
      setConfirming(null);
      focusInput();
      return true;
    }
    if (picking) {
      setPicking(false);
      setSearch("");
      focusInput();
      return true;
    }
    if (browseId) {
      leaveProject();
      return true;
    }
    return false;
  };
  useEffect(() => {
    escapeHandler.current = goBack;
    return () => {
      escapeHandler.current = null;
    };
  });

  const runOperation = (command: PaletteCommand) => {
    const operation = command.operation;
    if (!operation) return;
    if (!isPaletteOperationAvailable(command, commands, scopeProject)) {
      toast.info(t("commandPalette.confirm.unavailable"));
      return;
    }
    if (!transport) {
      onClose();
      toast.info(t("commandPalette.feedback.demo"));
      return;
    }
    if (isPaletteOperationPending(queryClient, operation)) {
      toast.info(t("commandPalette.feedback.busy"));
      return;
    }
    onClose();
    const feedback = `commandPalette.feedback.${operation.action}`;
    const promise = startPaletteOperation(queryClient, transport, operation);
    toast.promise(promise, {
      loading: t(`${feedback}.loading`),
      success: (count) => t(`${feedback}.success`, { count }),
      error: t(`${feedback}.error`),
    });
    promise.catch((error: unknown) => console.error(error));
  };
  const execute = async (command: PaletteCommand) => {
    if (command.action === "browse-project" && command.projectId) {
      browseProject(command.projectId);
      return;
    }
    if (command.action === "browse-all") {
      leaveProject();
      return;
    }
    if (command.operation) {
      if (needsPaletteConfirmation(command)) setConfirming(command);
      else runOperation(command);
      return;
    }
    onClose(!command.destination);
    try {
      if (command.destination) {
        saveRecents(rememberPaletteCommand(recentIds, command.id));
        const destination = command.destination;
        const search = destination.search;
        // Jumping to a field on this page must not reset its table filters.
        if (
          search &&
          typeof search === "object" &&
          router.buildLocation(destination).pathname ===
            router.state.location.pathname
        )
          await navigate({
            ...destination,
            search: (previous) => ({ ...previous, ...search }),
          });
        else await navigate(destination);
        return;
      }
      switch (command.action) {
        case "create-project":
          openCreateInstance();
          break;
        case "about":
          openAbout();
          break;
        case "theme-light":
          setTheme("light");
          break;
        case "theme-dark":
          setTheme("dark");
          break;
        case "theme-system":
          setTheme("system");
          break;
        case "clear-recents":
          saveRecents([]);
          break;
        case "refresh":
          await queryClient.invalidateQueries(
            { type: "active" },
            { throwOnError: true },
          );
          await router.invalidate();
          break;
        case "copy-url":
        case "copy-project-id": {
          const value =
            command.action === "copy-url"
              ? window.location.href
              : command.projectId;
          if (!value) return;
          if (isDesktopApp()) await desktop.clipboard.writeText(value);
          else await navigator.clipboard.writeText(value);
          toast.success(t("commandPalette.copied"));
          break;
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(t("commandPalette.actionError"));
    }
  };

  const loading =
    client.isPending ||
    instances.isPending ||
    (infoEnabled && info.isPending) ||
    (canReadScope && scripts.isPending) ||
    (canReadBots && bots.isPending);
  const failed =
    client.isError ||
    instances.isError ||
    (infoEnabled && info.isError) ||
    (canReadScope && scripts.isError) ||
    (canReadBots && bots.isError);
  const projectName =
    scopeProject?.friendlyName ??
    instances.data?.instances.find((instance) => instance.id === scopeId)
      ?.friendlyName;
  const scopeName =
    browsing && projectName ? projectName : t("commandPalette.allProjects");
  // Progress shows until every source settles. Failures then offer a retry.
  const indexStatus = !indexing
    ? undefined
    : !indexComplete
      ? index.progress.loaded + index.progress.failed < index.progress.total
        ? t("commandPalette.index.progress", {
            done: index.progress.loaded + index.progress.failed,
            total: index.progress.total,
          })
        : t("commandPalette.index.server")
      : index.progress.server === "failed"
        ? index.progress.failed
          ? t("commandPalette.index.failedWithServer", {
              count: index.progress.failed,
            })
          : t("commandPalette.index.serverFailed")
        : index.progress.failed
          ? t("commandPalette.index.failed", { count: index.progress.failed })
          : undefined;
  const indexFailed = Boolean(indexStatus && indexComplete);
  const headingFor = (group: GroupKey) =>
    group === "currentProject" && browsing && browsing !== routeId
      ? t("commandPalette.groups.projectPages")
      : t(`commandPalette.groups.${group}`);

  return (
    <Command
      label={t("commandPalette.title")}
      shouldFilter={false}
      vimBindings={false}
      loop
      value={selected}
      onValueChange={setSelected}
      className="min-h-0 flex-1"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          !event.repeat &&
          !event.nativeEvent.isComposing &&
          event.key.toLowerCase() === "p" &&
          selectedCommand
        ) {
          event.preventDefault();
          togglePin(selectedCommand);
        }
      }}
    >
      {/* Negative margins let the header and footer rules span the padded Command root. */}
      <div className="-mx-1 -mt-1 flex shrink-0 items-center gap-2 border-b pr-3">
        <CommandInput
          ref={inputRef}
          variant="palette"
          autoFocus
          aria-label={t("commandPalette.title")}
          placeholder={
            picking
              ? t("commandPalette.pickProjectPlaceholder")
              : browsing && projectName
                ? t("commandPalette.browsingPlaceholder", {
                    name: projectName,
                  })
                : t("commandPalette.placeholder")
          }
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            if (browseRevoked) setBrowseId(null);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Backspace" &&
              !search &&
              (picking || browseId) &&
              !event.repeat
            ) {
              event.preventDefault();
              goBack();
            }
          }}
        />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="max-w-32 font-normal sm:max-w-48"
            aria-label={t("commandPalette.changeScope", { name: scopeName })}
            aria-pressed={picking}
            onKeyDown={keepListKeys}
            onClick={() => {
              setPicking(!picking);
              setSearch("");
              focusInput();
            }}
          >
            {browsing ? (
              <DynamicIcon
                name={scopeProject?.icon || "folder"}
                aria-hidden="true"
                data-icon="inline-start"
              />
            ) : (
              <LayersIcon aria-hidden="true" data-icon="inline-start" />
            )}
            <span className="min-w-0 truncate">{scopeName}</span>
            <ChevronsUpDownIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
          {browseId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("commandPalette.searchAllProjects")}
              onKeyDown={keepListKeys}
              onClick={leaveProject}
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {!picking && !confirming && (
        <div className="-mx-1 shrink-0 overflow-x-auto border-b px-2 py-1.5">
          <ToggleGroup
            size="sm"
            spacing={1}
            value={[filter]}
            aria-label={t("commandPalette.filterLabel")}
            aria-orientation={undefined}
            onKeyDown={keepListKeys}
            onValueChange={(values) => {
              const next = PALETTE_FILTERS.find((entry) => entry === values[0]);
              if (next) setFilter(next);
              focusInput();
            }}
          >
            {PALETTE_FILTERS.map((entry) => (
              <ToggleGroupItem key={entry} value={entry} className="text-xs">
                {t(`commandPalette.filters.${entry}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {browseRevoked && (
        <p
          role="status"
          className="-mx-1 flex items-center gap-2 border-b px-3 py-2 text-sm"
        >
          <CircleAlertIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-destructive"
          />
          {t("commandPalette.projectUnavailable")}
        </p>
      )}
      {failed && (
        <div
          role="status"
          className="-mx-1 flex items-center gap-2 border-b px-3 py-2 text-sm"
        >
          <CircleAlertIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-destructive"
          />
          <span className="min-w-0 flex-1">
            {t("commandPalette.loadError")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onKeyDown={keepListKeys}
            onClick={() => {
              if (client.isError) void client.refetch();
              if (instances.isError) void instances.refetch();
              if (infoEnabled && info.isError) void info.refetch();
              if (canReadScope && scripts.isError) void scripts.refetch();
              if (canReadBots && bots.isError) void bots.refetch();
            }}
          >
            {t("commandPalette.retry")}
          </Button>
        </div>
      )}
      {indexStatus && !picking && !confirming && (
        <div
          role="status"
          className={cn(
            "-mx-1 flex shrink-0 items-center gap-2 border-b px-3 py-2",
            indexFailed ? "text-sm" : "text-xs text-muted-foreground",
          )}
        >
          {indexFailed ? (
            <CircleAlertIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-destructive"
            />
          ) : (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 motion-safe:animate-spin"
            />
          )}
          <span className="min-w-0 flex-1">{indexStatus}</span>
          {indexFailed && (
            <Button
              variant="outline"
              size="sm"
              onKeyDown={keepListKeys}
              onClick={index.retry}
            >
              {t("commandPalette.retry")}
            </Button>
          )}
        </div>
      )}
      {confirming?.operation?.kind === "bot" ? (
        <OperationConfirmation
          key={confirming.id}
          command={confirming}
          valid={isPaletteOperationAvailable(
            confirming,
            commands,
            scopeProject,
          )}
          onCancel={goBack}
          onConfirm={() => runOperation(confirming)}
        />
      ) : (
        <CommandList className="min-h-0 max-h-[min(28rem,55dvh)]">
          <CommandEmpty>
            <Empty className="p-2">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchXIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {t(
                    indexing && !indexComplete
                      ? "commandPalette.emptyTitlePartial"
                      : "commandPalette.emptyTitle",
                  )}
                </EmptyTitle>
                <EmptyDescription>
                  {t(
                    indexing && !indexComplete
                      ? "commandPalette.emptyHintPartial"
                      : "commandPalette.emptyHint",
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CommandEmpty>
          {[...groups].map(([group, entries]) => (
            <CommandGroup key={group} heading={headingFor(group)}>
              {entries.map((command) => (
                <PaletteRow
                  key={command.id}
                  command={command}
                  search={query}
                  showContext={
                    picking ||
                    (command.projectId
                      ? command.projectId !== browsing
                      : Boolean(command.context))
                  }
                  onSelect={() => {
                    void execute(command);
                  }}
                />
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      )}
      {loading && !confirming && (
        <div
          role="status"
          aria-label={t("commandPalette.loading")}
          className="flex flex-col gap-1 px-3 pt-1 pb-2"
        >
          <div className="flex items-center gap-2 py-1">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <div className="flex items-center gap-2 py-1">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
      )}
      <div className="-mx-1 -mb-1 flex min-h-11 shrink-0 items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        {selectedCommand && (
          <span className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0"
              aria-label={t(
                selectedPinned
                  ? "commandPalette.unpinLabel"
                  : "commandPalette.pinLabel",
                { name: selectedCommand.label },
              )}
              aria-keyshortcuts="Control+p Meta+p"
              // Keep focus in the search field so the selected result stays active.
              onMouseDown={(event) => event.preventDefault()}
              onKeyDown={keepListKeys}
              onClick={() => togglePin(selectedCommand)}
            >
              {selectedPinned ? (
                <PinOffIcon aria-hidden="true" data-icon="inline-start" />
              ) : (
                <PinIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {t(
                selectedPinned ? "commandPalette.unpin" : "commandPalette.pin",
              )}
            </Button>
            <Kbd aria-hidden="true" className="hidden text-foreground sm:flex">
              {formatShortcut("Ctrl+P")}
            </Kbd>
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {hiddenCount > 0
            ? t("commandPalette.moreResults", { count: hiddenCount })
            : t("commandPalette.description")}
        </span>
        {/* Screen readers announce listbox navigation, so this legend is visual only. */}
        <div
          aria-hidden="true"
          className="hidden shrink-0 items-center gap-3 sm:flex"
        >
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd className="text-foreground">
                <ArrowUpIcon className="size-3" />
              </Kbd>
              <Kbd className="text-foreground">
                <ArrowDownIcon className="size-3" />
              </Kbd>
            </KbdGroup>
            {t("commandPalette.keys.navigate")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd className="text-foreground">
              <CornerDownLeftIcon className="size-3" />
            </Kbd>
            {t("commandPalette.keys.select")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd className="text-foreground">Esc</Kbd>
            {t(
              confirming || picking || browseId
                ? "commandPalette.keys.back"
                : "commandPalette.keys.close",
            )}
          </span>
        </div>
      </div>
    </Command>
  );
}

function OperationConfirmation({
  command,
  valid,
  onCancel,
  onConfirm,
}: {
  command: PaletteCommand;
  valid: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("common");
  const titleId = useId();
  const descriptionId = useId();
  const [submitted, setSubmitted] = useState(false);
  const operation = command.operation;
  if (operation?.kind !== "bot") return null;
  const action = operation.action;
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-foreground">
          <DynamicIcon name={command.icon} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="text-sm font-medium">
            {t(`commandPalette.confirm.${action}`, {
              count: operation.botIds.length,
              project: command.context ?? operation.instanceId,
            })}
          </p>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {t("commandPalette.confirm.description")}
          </p>
        </div>
      </div>
      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          {t("commandPalette.confirm.unavailable")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          autoFocus
          onKeyDown={keepListKeys}
          onClick={onCancel}
        >
          {t("commandPalette.confirm.cancel")}
        </Button>
        <Button
          variant={action === "stop" ? "destructive" : "default"}
          disabled={!valid || submitted}
          onKeyDown={keepListKeys}
          onClick={() => {
            // The menu closes after this, but a fast second activation must not resend.
            if (submitted) return;
            setSubmitted(true);
            onConfirm();
          }}
        >
          {t(
            action === "start"
              ? "commandPalette.confirm.confirmStart"
              : action === "stop"
                ? "commandPalette.confirm.confirmStop"
                : "commandPalette.confirm.confirmRestart",
          )}
        </Button>
      </div>
    </div>
  );
}

function Highlighted({ text, search }: { text: string; search: string }) {
  if (!search) return text;
  let offset = 0;
  return paletteMatchSegments(text, search).map((segment) => {
    const start = offset;
    offset += segment.text.length;
    return segment.matched ? (
      <mark
        key={start}
        className="bg-transparent font-semibold text-foreground underline underline-offset-2"
      >
        {segment.text}
      </mark>
    ) : (
      <Fragment key={start}>{segment.text}</Fragment>
    );
  });
}

function MatchReason({ text, search }: { text: string; search: string }) {
  const { t } = useTranslation("common");
  // Split around a placeholder so translations can place the match anywhere.
  const marker = "\u0000";
  const [before, after = ""] = t("commandPalette.matchedBy", {
    text: marker,
  }).split(marker);
  return (
    <>
      {before}
      <Highlighted text={text} search={search} />
      {after}
    </>
  );
}

function PaletteRow({
  command,
  search,
  showContext,
  onSelect,
}: {
  command: PaletteCommand;
  search: string;
  showContext: boolean;
  onSelect: () => void;
}) {
  const reason =
    command.matchedText && command.matchedText !== command.description
      ? command.matchedText
      : undefined;
  return (
    <CommandItem value={command.id} onSelect={onSelect}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground group-data-selected/command-item:text-foreground">
        <DynamicIcon name={command.icon} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="max-w-full min-w-0 shrink-0 truncate">
            <Highlighted text={command.label} search={search} />
          </span>
          {command.context &&
            (showContext ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground group-data-selected/command-item:text-foreground">
                <span className="sr-only">, </span>
                <Highlighted text={command.context} search={search} />
              </span>
            ) : (
              // A scoped search already names this project in the header.
              <span className="sr-only">, {command.context}</span>
            ))}
        </span>
        {(command.description || reason) && (
          <span className="min-w-0 truncate text-xs text-muted-foreground group-data-selected/command-item:text-foreground">
            <span className="sr-only">, </span>
            {command.description && (
              <Highlighted text={command.description} search={search} />
            )}
            {command.description && reason && " · "}
            {reason && <MatchReason text={reason} search={search} />}
          </span>
        )}
      </span>
      {command.status && (
        <Badge
          variant="outline"
          className={cn(
            "font-normal",
            command.status.tone === "success" &&
              "border-success/40 text-success-emphasis",
            command.status.tone === "warning" &&
              "border-warning/40 text-warning-emphasis",
            command.status.tone === "destructive" &&
              "border-destructive/40 text-destructive",
          )}
        >
          <span className="sr-only">, </span>
          {command.status.label}
        </Badge>
      )}
      <span
        data-slot="command-shortcut"
        aria-hidden="true"
        className={cn(
          "hidden shrink-0 group-data-selected/command-item:flex",
          !command.status && "ml-auto",
        )}
      >
        <Kbd className="bg-background text-foreground">
          <CornerDownLeftIcon className="size-3" />
        </Kbd>
      </span>
    </CommandItem>
  );
}
