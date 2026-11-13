import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense } from "react";
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
        <div className="container flex h-full w-full grow flex-col gap-4 py-4">
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
      throttleMs: 300,
    }),
  );

  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(BOT_DISPLAY_STATES).withOptions({ shallow: true }),
  );

  return (
    <div className="container flex h-full w-full grow flex-col gap-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
        <ToggleGroup
          aria-label={t("bots.filterLabel")}
          variant="outline"
          size="sm"
          className="flex-wrap"
          value={[status ?? "all"]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) {
              void setStatus(next === "all" ? null : (next as BotDisplayState));
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
        <BotGridContainer search={search} status={status} />
      </Suspense>
    </div>
  );
}

function OnlineCountBadgeContainer() {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  return <OnlineCountBadge instanceInfo={instanceInfo} />;
}

function BotGridContainer({
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
}
