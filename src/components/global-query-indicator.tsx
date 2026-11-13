import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryRefreshFailures } from "@/hooks/use-query-refresh-failures";
import { hasFailedRefresh } from "@/lib/query-refresh-state";

export function GlobalQueryIndicator() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const hasFailures = useQueryRefreshFailures();

  if (hasFailures) {
    return (
      <div role="status">
        <span className="sr-only">{t("queryStatus.stale")}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label={t("queryStatus.retry")}
                onClick={() => {
                  void queryClient.refetchQueries(
                    { type: "active", predicate: hasFailedRefresh },
                    { cancelRefetch: true },
                  );
                }}
              />
            }
          >
            <CircleAlertIcon />
            <span className="hidden sm:inline">{t("queryStatus.failed")}</span>
          </TooltipTrigger>
          <TooltipContent>{t("queryStatus.stale")}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return isFetching ? (
    <RefreshCwIcon className="text-muted-foreground size-4 animate-spin" />
  ) : null;
}
