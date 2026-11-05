import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useMatch,
  useNavigate,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  CornerDownLeftIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  createContext,
  useCallback,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AboutContext } from "@/components/dialog/about-dialog";
import { CreateInstanceContext } from "@/components/dialog/create-instance-dialog";
import DynamicIcon from "@/components/dynamic-icon";
import { TransportContext } from "@/components/providers/transport-context";
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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import {
  createPaletteCommands,
  isPaletteShortcut,
  isPaletteTypingTarget,
  readPaletteRecents,
  rememberPaletteCommand,
  resolvePaletteRecents,
  searchPaletteCommands,
  type PaletteCommand,
  type PaletteGroup,
} from "@/lib/command-palette";
import { desktop, formatShortcut, isDesktopApp } from "@/lib/desktop";
import { scriptListQueryOptions } from "@/lib/script-service";
import { hasInstancePermission } from "@/lib/utils";
import { getServerAddress } from "@/lib/web-rpc";

const CommandPaletteContext = createContext<(() => void) | null>(null);
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
// Only these groups mix projects. Other rows with a project context belong to
// the current project, which the search header already shows.
const PROJECT_CONTEXT_GROUPS = new Set<PaletteGroup | "recent">([
  "recent",
  "projects",
]);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const lastShift = useRef<number | null>(null);
  const shiftPressedAt = useRef<number | null>(null);
  const recentCache = useRef(new Map<string, string[]>());
  const previousFocus = useRef<HTMLElement | null>(null);
  const show = useCallback(() => {
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
        onOpenChange={setOpen}
        title={t("commandPalette.title")}
        description={t("commandPalette.description")}
        finalFocus={previousFocus}
        className="top-[15dvh] max-h-[75dvh] sm:max-w-2xl"
      >
        {open && (
          <CommandPaletteContent
            recentCache={recentCache.current}
            onClose={() => setOpen(false)}
          />
        )}
      </CommandDialog>
    </CommandPaletteContext>
  );
}

export function CommandPaletteTrigger() {
  const show = use(CommandPaletteContext);
  const { t } = useTranslation("common");
  const { isMobile, setOpenMobile } = useSidebar();
  if (!show) return null;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={t("commandPalette.shortcutHint", {
            shortcut: formatShortcut("Ctrl+K"),
          })}
          aria-label={t("commandPalette.triggerLabel", {
            shortcut: formatShortcut("Ctrl+K"),
          })}
          aria-keyshortcuts="Control+k Meta+k"
          onClick={() => {
            if (isMobile) setOpenMobile(false);
            show();
          }}
        >
          <SearchIcon />
          <span>{t("commandPalette.trigger")}</span>{" "}
          <Kbd
            aria-hidden="true"
            className="ml-auto text-foreground group-data-[collapsible=icon]:hidden"
          >
            {formatShortcut("Ctrl+K")}
          </Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function readRecents(key: string) {
  try {
    return readPaletteRecents(localStorage, key);
  } catch {
    return [];
  }
}

function CommandPaletteContent({
  onClose,
  recentCache,
}: {
  onClose: () => void;
  recentCache: Map<string, string[]>;
}) {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState("");
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
  const current = useQuery({
    ...instanceMatch?.context.instanceInfoQueryOptions,
    queryKey: ["instance-info", instanceMatch?.params.instance ?? ""],
    queryFn:
      instanceMatch?.context.instanceInfoQueryOptions.queryFn ?? skipToken,
    enabled: Boolean(instanceMatch),
    refetchInterval: false,
  });
  const currentProject =
    !current.isError &&
    !instances.isError &&
    instances.data?.instances.some(
      (instance) => instance.id === current.data?.id,
    )
      ? current.data
      : undefined;
  const canReadCurrent = Boolean(
    currentProject &&
    hasInstancePermission(currentProject, InstancePermission.READ_INSTANCE),
  );
  const scripts = useQuery({
    ...scriptListQueryOptions(transport, currentProject?.id ?? ""),
    enabled: canReadCurrent,
    refetchInterval: false,
  });
  const commands = useMemo(
    () =>
      createPaletteCommands({
        t: (key) => t(key),
        client: client.isError ? undefined : client.data,
        instances: instances.isError ? [] : (instances.data?.instances ?? []),
        current: currentProject,
        scripts: scripts.isError ? [] : scripts.data?.scripts,
        demo: transport === null,
      }),
    [
      t,
      client.data,
      client.isError,
      instances.data,
      instances.isError,
      currentProject,
      scripts.data,
      scripts.isError,
      transport,
    ],
  );
  const recentKey = `sf-palette-recents:${JSON.stringify([getServerAddress(), client.data?.id])}`;
  const recentIds = recentCache.get(recentKey) ?? readRecents(recentKey);
  const recents = resolvePaletteRecents(commands, recentIds);
  const matches = searchPaletteCommands(commands, search);
  const orderedResults = search.trim()
    ? matches
    : [...matches].sort(
        (a, b) =>
          DEFAULT_GROUP_ORDER.indexOf(a.group) -
          DEFAULT_GROUP_ORDER.indexOf(b.group),
      );
  const results = orderedResults.slice(0, RESULT_LIMIT);
  const groups = new Map<PaletteGroup | "recent", PaletteCommand[]>();
  if (!search.trim() && recents.length) groups.set("recent", recents);
  const recentSet = new Set(
    !search.trim() ? recents.map((command) => command.id) : [],
  );
  for (const command of results) {
    if (recentSet.has(command.id)) continue;
    const group = groups.get(command.group) ?? [];
    group.push(command);
    groups.set(command.group, group);
  }

  const saveRecents = (ids: string[]) => {
    recentCache.set(recentKey, ids);
    if (!client.data) return;
    try {
      localStorage.setItem(recentKey, JSON.stringify(ids));
    } catch {
      // Keep this session's history when browser storage is unavailable.
    }
  };
  const execute = async (command: PaletteCommand) => {
    onClose();
    try {
      if (command.destination) {
        saveRecents(rememberPaletteCommand(recentIds, command.id));
        await navigate(command.destination);
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
              : currentProject?.id;
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
    (instanceMatch && current.isPending) ||
    (canReadCurrent && scripts.isPending);
  const failed =
    client.isError ||
    instances.isError ||
    (instanceMatch && current.isError) ||
    (canReadCurrent && scripts.isError);

  return (
    <Command
      label={t("commandPalette.title")}
      shouldFilter={false}
      vimBindings={false}
      loop
    >
      {/* Negative margins let the header and footer rules span the padded Command root. */}
      <div className="-mx-1 -mt-1 flex items-center gap-2 border-b pr-3">
        <CommandInput
          variant="palette"
          autoFocus
          aria-label={t("commandPalette.title")}
          placeholder={t("commandPalette.placeholder")}
          value={search}
          onValueChange={setSearch}
        />
        {currentProject && (
          <span className="flex max-w-32 shrink-0 items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-xs font-medium text-foreground sm:max-w-48">
            <DynamicIcon
              name={currentProject.icon || "folder"}
              aria-hidden="true"
              className="size-3.5 shrink-0"
            />
            <span className="sr-only">
              {t("commandPalette.groups.currentProject")}:{" "}
            </span>
            <span className="min-w-0 truncate">
              {currentProject.friendlyName}
            </span>
          </span>
        )}
      </div>
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
            onClick={() => {
              if (client.isError) void client.refetch();
              if (instances.isError) void instances.refetch();
              if (instanceMatch && current.isError) void current.refetch();
              if (canReadCurrent && scripts.isError) void scripts.refetch();
            }}
          >
            {t("commandPalette.retry")}
          </Button>
        </div>
      )}
      <CommandList className="max-h-[min(28rem,55dvh)]">
        <CommandEmpty>
          <Empty className="p-2">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("commandPalette.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("commandPalette.emptyHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CommandEmpty>
        {[...groups].map(([group, entries]) => (
          <CommandGroup
            key={group}
            heading={t(`commandPalette.groups.${group}`)}
          >
            {entries.map((command) => (
              <PaletteRow
                key={command.id}
                command={command}
                showContext={PROJECT_CONTEXT_GROUPS.has(group)}
                onSelect={() => {
                  void execute(command);
                }}
              />
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      {loading && (
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
      <div className="-mx-1 -mb-1 flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {matches.length > RESULT_LIMIT
            ? t("commandPalette.moreResults", {
                count: matches.length - RESULT_LIMIT,
              })
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
            {t("commandPalette.keys.close")}
          </span>
        </div>
      </div>
    </Command>
  );
}

function PaletteRow({
  command,
  showContext,
  onSelect,
}: {
  command: PaletteCommand;
  showContext: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={command.id} onSelect={onSelect}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground group-data-selected/command-item:text-foreground">
        <DynamicIcon name={command.icon} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="max-w-full min-w-0 shrink-0 truncate">
          {command.label}
        </span>
        {command.context &&
          (showContext ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground group-data-selected/command-item:text-foreground">
              <span className="sr-only">, </span>
              {command.context}
            </span>
          ) : (
            // The header chip shows the current project, so keep its name for screen readers only.
            <span className="sr-only">, {command.context}</span>
          ))}
      </span>
      <span
        data-slot="command-shortcut"
        aria-hidden="true"
        className="ml-auto hidden shrink-0 group-data-selected/command-item:flex"
      >
        <Kbd className="bg-background text-foreground">
          <CornerDownLeftIcon className="size-3" />
        </Kbd>
      </span>
    </CommandItem>
  );
}
