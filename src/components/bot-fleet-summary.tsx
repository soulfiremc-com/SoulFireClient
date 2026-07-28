import type { BotFleetSummary } from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import type { TFunction } from "i18next";
import { CircleAlertIcon, LoaderCircleIcon, RadioIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.tsx";

export function formatBotFleetSummary(
  t: TFunction<"common">,
  summary?: BotFleetSummary,
): string {
  return t("botFleetSummary", {
    online: summary?.onlineBots ?? 0,
    desired: summary?.desiredBots ?? 0,
    total: summary?.totalBots ?? 0,
  });
}

export function BotFleetSummaryBadge({
  summary,
  className,
}: {
  summary?: BotFleetSummary;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const desired = summary?.desiredBots ?? 0;
  const pending = (summary?.startingBots ?? 0) + (summary?.retryingBots ?? 0);
  const failed = summary?.failedBots ?? 0;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-normal",
        failed > 0
          ? "border-destructive/40 text-destructive"
          : desired > 0
            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground",
        className,
      )}
    >
      {failed > 0 ? (
        <CircleAlertIcon className="size-3" />
      ) : pending > 0 ? (
        <LoaderCircleIcon className="size-3 animate-spin" />
      ) : (
        <RadioIcon className="size-3" />
      )}
      <span>{formatBotFleetSummary(t, summary)}</span>
    </Badge>
  );
}
