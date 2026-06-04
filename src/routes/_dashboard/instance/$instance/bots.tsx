import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import {
  infiniteQueryOptions,
  queryOptions,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ClipboardCopyIcon,
  CookieIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MapPinIcon,
  MonitorSmartphoneIcon,
  RotateCcwKeyIcon,
  SearchIcon,
  TicketIcon,
  WifiOffIcon,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  MenuItem,
  MenuSeparator,
} from "@/components/context-menu-primitives.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type {
  BotListEntry,
  BotListResponse,
} from "@/generated/soulfire/bot_pb.ts";
import {
  BotListResponseSchema,
  BotService,
} from "@/generated/soulfire/bot_pb.ts";
import { MinecraftAccountProto_AccountTypeProto } from "@/generated/soulfire/common_pb.ts";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import i18n from "@/lib/i18n";
import { simpleSearchValidateSearch } from "@/lib/parsers.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import {
  getEnumKeyByValue,
  mapUnionToValue,
  type ProfileAccount,
} from "@/lib/types.ts";
import { createTransport } from "@/lib/web-rpc.ts";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_dashboard/instance/$instance/bots")({
  validateSearch: simpleSearchValidateSearch,
  beforeLoad: (props) => {
    const { instance } = props.params;
    const botStatusQueryOptions = queryOptions({
      queryKey: ["bot-status", instance],
      queryFn: async (queryProps): Promise<BotListResponse> => {
        const transport = createTransport();
        if (transport === null) {
          return create(BotListResponseSchema, { bots: [] });
        }
        const botService = createClient(BotService, transport);
        const result = await botService.getBotList(
          { instanceId: instance },
          { signal: queryProps.signal },
        );
        return result;
      },
      refetchInterval: 3_000,
    });
    return {
      botStatusQueryOptions,
      ...staticRouteChrome(() => i18n.t("common:pageName.bots"), {
        kind: "dynamic",
        name: "users",
      }),
    };
  },
  loader: (props) => {
    void props.context.queryClient.prefetchQuery(
      props.context.botStatusQueryOptions,
    );
  },
  component: Bots,
});

type BotWithStatus = ProfileAccount & {
  isOnline: boolean;
  liveState?: BotListEntry["liveState"];
};

const accountTypeToIcon = (
  type: keyof typeof MinecraftAccountProto_AccountTypeProto,
) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "OFFLINE":
        return WifiOffIcon;
      case "MICROSOFT_JAVA_CREDENTIALS":
        return KeyRoundIcon;
      case "MICROSOFT_JAVA_DEVICE_CODE":
        return MonitorSmartphoneIcon;
      case "MICROSOFT_JAVA_REFRESH_TOKEN":
        return RotateCcwKeyIcon;
      case "MICROSOFT_JAVA_COOKIES":
        return CookieIcon;
      case "MICROSOFT_JAVA_ACCESS_TOKEN":
        return TicketIcon;
      case "THE_ALTENING":
        return TicketIcon;
      case "MICROSOFT_BEDROCK_CREDENTIALS":
        return KeyRoundIcon;
      case "MICROSOFT_BEDROCK_DEVICE_CODE":
        return MonitorSmartphoneIcon;
    }
  });

const accountTypeLabel = (
  type: keyof typeof MinecraftAccountProto_AccountTypeProto,
) =>
  mapUnionToValue(type, (key) => {
    switch (key) {
      case "OFFLINE":
        return "Offline";
      case "MICROSOFT_JAVA_CREDENTIALS":
        return "Java";
      case "MICROSOFT_JAVA_DEVICE_CODE":
        return "Java";
      case "MICROSOFT_JAVA_REFRESH_TOKEN":
        return "Java";
      case "MICROSOFT_JAVA_COOKIES":
        return "Java";
      case "MICROSOFT_JAVA_ACCESS_TOKEN":
        return "Java";
      case "THE_ALTENING":
        return "Java";
      case "MICROSOFT_BEDROCK_CREDENTIALS":
        return "Bedrock";
      case "MICROSOFT_BEDROCK_DEVICE_CODE":
        return "Bedrock";
    }
  });

function BotCardSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BotsSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 max-w-sm flex-1" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton list
          <BotCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function Bots() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "controls",
          content: t("breadcrumbs.controls"),
        },
      ]}
      pageName={t("pageName.bots")}
      loadingSkeleton={<BotsSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { t } = useTranslation("instance");
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({
      clearOnDefault: true,
      shallow: true,
      throttleMs: 300,
    }),
  );

  return (
    <div className="container flex h-full w-full grow flex-col gap-4 py-4">
      {/* Search input - always visible, no data needed */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="max-w-sm flex-1">
          <InputGroupAddon>
            <SearchIcon className="text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t("bots.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Suspense
          fallback={
            <Badge variant="outline" className="w-fit">
              {t("bots.onlineCount", { online: "...", total: "..." })}
            </Badge>
          }
        >
          <OnlineCountBadge />
        </Suspense>
      </div>

      {/* Bot grid - needs data */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton list
              <BotCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        <BotGrid search={search} />
      </Suspense>
    </div>
  );
}

function OnlineCountBadge() {
  const { t } = useTranslation("instance");
  const { instanceInfoQueryOptions, botStatusQueryOptions } =
    Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { data: botStatus } = useSuspenseQuery(botStatusQueryOptions);

  const onlineCount = useMemo(() => {
    const statusMap = new Map<string, BotListEntry>();
    for (const entry of botStatus.bots) {
      statusMap.set(entry.profileId, entry);
    }
    return instanceInfo.profile.accounts.filter((account) => {
      const status = statusMap.get(account.profileId);
      return status?.isOnline ?? false;
    }).length;
  }, [instanceInfo.profile.accounts, botStatus.bots]);

  return (
    <Badge variant="outline" className="w-fit">
      {t("bots.onlineCount", {
        online: onlineCount,
        total: instanceInfo.profile.accounts.length,
      })}
    </Badge>
  );
}

function BotGrid({ search }: { search: string }) {
  const { t: tCommon } = useTranslation("common");
  const { t } = useTranslation("instance");
  const navigate = useNavigate();
  const { instanceInfoQueryOptions, botStatusQueryOptions } =
    Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const { data: botStatus } = useSuspenseQuery(botStatusQueryOptions);
  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<BotWithStatus>();
  const copyToClipboard = useCopyToClipboard();

  // Create status map for quick lookup
  const statusMap = useMemo(() => {
    const map = new Map<string, BotListEntry>();
    for (const entry of botStatus.bots) {
      map.set(entry.profileId, entry);
    }
    return map;
  }, [botStatus.bots]);

  // Filter accounts by search
  const filteredAccounts = useMemo(() => {
    const accounts = instanceInfo.profile.accounts;
    if (!search.trim()) return accounts;
    const searchLower = search.toLowerCase();
    return accounts.filter((account) =>
      account.lastKnownName.toLowerCase().includes(searchLower),
    );
  }, [instanceInfo.profile.accounts, search]);

  // Create infinite query options for client-side pagination
  const botsInfiniteQueryOptions = useMemo(
    () =>
      infiniteQueryOptions({
        queryKey: [
          "bots-paginated",
          instanceInfo.id,
          filteredAccounts.map((a) => a.profileId).join(","),
        ],
        queryFn: ({ pageParam }) => {
          const start = pageParam * PAGE_SIZE;
          const end = start + PAGE_SIZE;
          const pageAccounts = filteredAccounts.slice(start, end);
          return {
            accounts: pageAccounts,
            nextPage: end < filteredAccounts.length ? pageParam + 1 : undefined,
            totalCount: filteredAccounts.length,
          };
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextPage,
      }),
    [instanceInfo.id, filteredAccounts],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(botsInfiniteQueryOptions);

  // Merge all pages into flat list with status
  const botsWithStatus = useMemo(() => {
    const allAccounts = data.pages.flatMap((page) => page.accounts);
    return allAccounts.map((account): BotWithStatus => {
      const status = statusMap.get(account.profileId);
      return {
        ...account,
        isOnline: status?.isOnline ?? false,
        liveState: status?.liveState,
      };
    });
  }, [data.pages, statusMap]);

  const totalCount = filteredAccounts.length;
  const loadedCount = botsWithStatus.length;

  // Intersection observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "100px",
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleIntersection]);

  if (filteredAccounts.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center">
        {instanceInfo.profile.accounts.length === 0
          ? t("bots.noBots")
          : t("bots.noBotsFound")}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {botsWithStatus.map((bot) => (
          <BotCard
            key={bot.profileId}
            bot={bot}
            instanceId={instanceInfo.id}
            onContextMenu={(e) => handleContextMenu(e, bot)}
          />
        ))}
      </div>

      {/* Load more trigger / status */}
      <div ref={loadMoreRef} className="flex justify-center py-4">
        {isFetchingNextPage ? (
          <div className="text-muted-foreground flex items-center gap-2">
            <LoaderCircleIcon className="size-4 animate-spin" />
            <span>{t("bots.loadingMore")}</span>
          </div>
        ) : hasNextPage ? (
          <span className="text-muted-foreground text-sm">
            {t("bots.showingCount", {
              loaded: loadedCount,
              total: totalCount,
            })}
          </span>
        ) : loadedCount > PAGE_SIZE ? (
          <span className="text-muted-foreground text-sm">
            {t("bots.allLoaded", { total: totalCount })}
          </span>
        ) : null}
      </div>
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <MenuItem
            onClick={() => {
              void navigate({
                to: "/instance/$instance/bot/$botId",
                params: {
                  instance: instanceInfo.id,
                  botId: contextMenu.data.profileId,
                },
              });
              dismiss();
            }}
          >
            <ExternalLinkIcon />
            {tCommon("contextMenu.bot.goToBot")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.lastKnownName);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUsername")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.profileId);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tCommon("contextMenu.bot.copyUuid")}
          </MenuItem>
          {contextMenu.data.isOnline && contextMenu.data.liveState && (
            <MenuItem
              onClick={() => {
                const { x, y, z } = contextMenu.data.liveState ?? {
                  x: 0,
                  y: 0,
                  z: 0,
                };
                copyToClipboard(
                  `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`,
                );
                dismiss();
              }}
            >
              <ClipboardCopyIcon />
              {tCommon("contextMenu.bot.copyCoordinates")}
            </MenuItem>
          )}
        </ContextMenuPortal>
      )}
    </>
  );
}

// Helper to get the avatar URL based on skin texture hash
function getHeadUrl(skinTextureHash?: string): string {
  if (skinTextureHash) {
    return `https://mc-heads.net/head/${skinTextureHash}/48`;
  }
  return "https://mc-heads.net/head/MHF_Steve/48";
}

function BotCard({
  bot,
  instanceId,
  onContextMenu,
}: {
  bot: BotWithStatus;
  instanceId: string;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const typeKey = getEnumKeyByValue(
    MinecraftAccountProto_AccountTypeProto,
    bot.type,
  );
  const Icon = accountTypeToIcon(typeKey);
  const typeLabel = accountTypeLabel(typeKey);

  return (
    <Link
      to="/instance/$instance/bot/$botId"
      params={{ instance: instanceId, botId: bot.profileId }}
      onContextMenu={onContextMenu}
    >
      <Card className="hover:bg-muted/50 h-full cursor-pointer transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <img
              src={getHeadUrl(bot.liveState?.skinTextureHash)}
              alt={bot.lastKnownName}
              className="size-12 rounded"
              loading="lazy"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CardTitle className="truncate text-base">
                {bot.lastKnownName}
              </CardTitle>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  <Icon className="mr-1 size-3" />
                  {typeLabel}
                </Badge>
                <Badge
                  variant={bot.isOnline ? "default" : "secondary"}
                  className="text-xs"
                >
                  {bot.isOnline ? "Online" : "Not Joined"}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        {bot.isOnline && bot.liveState && (
          <CardContent className="pt-0">
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <MapPinIcon className="size-3" />
              <span className="select-text">
                {bot.liveState.x.toFixed(1)}, {bot.liveState.y.toFixed(1)},{" "}
                {bot.liveState.z.toFixed(1)}
              </span>
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
