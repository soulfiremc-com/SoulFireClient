import type { TFunction } from "i18next";
import type { BotFleetSummary } from "@/generated/soulfire/bot_pb";

export function formatBotFleetSummary(
  t: TFunction<"common">,
  summary?: BotFleetSummary,
): string {
  const total = summary?.totalBots ?? 0;
  if (total === 0) return t("botFleetSummaryEmpty");
  return t("botFleetSummary", {
    online: summary?.onlineBots ?? 0,
    desired: summary?.desiredBots ?? 0,
    total,
  });
}
