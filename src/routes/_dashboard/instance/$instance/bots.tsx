import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import {
  parseAsString,
  parseAsStringLiteral,
  throttle,
  useQueryState,
} from "nuqs";
import { memo, Suspense, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import {
  BotCardSkeleton,
  BotGrid,
  OnlineCountBadge,
} from "@/components/instance-overview/bot-grid.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import i18n from "@/lib/i18n";
import { BOT_DISPLAY_STATES, type BotDisplayState } from "@/lib/bot-fleet.ts";
import { botListValidateSearch } from "@/lib/parsers.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { isOneOf } from "@/lib/is-one-of";

const BOT_SKELETON_IDS = [
  "bot-1",
  "bot-2",
  "bot-3",
  "bot-4",
  "bot-5",
  "bot-6",
  "bot-7",
  "bot-8",
] as const;

export const Route = createFileRoute("/_dashboard/instance/$instance/bots")({
  validateSearch: botListValidateSearch,
  beforeLoad: (props) => {
    const { instance } = props.params;
    return {
      botStatusQueryOptions: botStatusQueryOptions(instance),
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

function BotGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {BOT_SKELETON_IDS.map((id) => (
        <BotCardSkeleton key={id} />
      ))}
    </div>
  );
}

function Bots() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[{ id: "controls", content: t("breadcrumbs.controls") }]}
      pageName={t("pageName.bots")}
      loadingSkeleton={
        <div className="container flex size-full grow flex-col gap-4">
          <BotGridSkeleton />
        </div>
      }
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
      limitUrlUpdates: throttle(300),
    }),
  );

  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(BOT_DISPLAY_STATES).withOptions({ shallow: true }),
  );
  // Typing and filter clicks update the controls first. The grid follows
  // without blocking input and keeps its old cards until the new ones load.
  const deferredSearch = useDeferredValue(search);
  const deferredStatus = useDeferredValue(status);

  return (
    <div className="container flex size-full grow flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <InputGroup className="max-w-sm min-w-56 flex-1">
          <InputGroupAddon>
            <SearchIcon className="text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={t("bots.searchPlaceholder")}
            placeholder={t("bots.searchPlaceholder")}
            value={search}
            onChange={(e) => void setSearch(e.target.value)}
          />
        </InputGroup>
        {/* Scroll the segmented filter on narrow screens instead of wrapping it. */}
        <div className="-m-1 overflow-x-auto p-1">
          <ToggleGroup
            aria-label={t("bots.filterLabel")}
            variant="outline"
            size="sm"
            value={[status ?? "all"]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === "all") {
                void setStatus(null);
              } else if (isOneOf(next, BOT_DISPLAY_STATES)) {
                void setStatus(next);
              }
            }}
          >
            <ToggleGroupItem value="all">{t("bots.filterAll")}</ToggleGroupItem>
            {BOT_DISPLAY_STATES.filter((state) => state !== "stopping").map(
              (state) => (
                <ToggleGroupItem key={state} value={state}>
                  {t(`bots.displayState.${state}`)}
                </ToggleGroupItem>
              ),
            )}
          </ToggleGroup>
        </div>
        <Suspense
          fallback={
            <Badge variant="outline" className="w-fit">
              {t("bots.onlineCount", { online: "...", total: "..." })}
            </Badge>
          }
        >
          <OnlineCountBadgeContainer />
        </Suspense>
      </div>

      <Suspense fallback={<BotGridSkeleton />}>
        <BotGridContainer search={deferredSearch} status={deferredStatus} />
      </Suspense>
    </div>
  );
}

function OnlineCountBadgeContainer() {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  return <OnlineCountBadge instanceInfo={instanceInfo} />;
}

const BotGridContainer = memo(function BotGridContainer({
  search,
  status,
}: {
  search: string;
  status: BotDisplayState | null;
}) {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  return (
    <BotGrid instanceInfo={instanceInfo} search={search} status={status} />
  );
});
