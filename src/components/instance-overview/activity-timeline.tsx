import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { SFTimeAgo } from "@/components/sf-timeago.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  type InstanceAuditLogResponse,
  InstanceAuditLogResponse_AuditLogEntryType,
  InstanceAuditLogResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import { timestampToDate } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";

const MAX_TIMELINE_ENTRIES = 3;
const LOADING_ROWS = ["action-1", "action-2", "action-3"];

function entryTypeI18nKey(
  type: InstanceAuditLogResponse_AuditLogEntryType,
): string {
  switch (type) {
    case InstanceAuditLogResponse_AuditLogEntryType.EXECUTE_COMMAND:
      return "overview.timeline.types.executeCommand";
    case InstanceAuditLogResponse_AuditLogEntryType.BOT_DESIRED_STATE_CHANGE:
      return "overview.timeline.types.botDesiredStateChange";
    case InstanceAuditLogResponse_AuditLogEntryType.BOT_RESTART:
      return "overview.timeline.types.botRestart";
    default:
      return "overview.timeline.types.unknown";
  }
}

/// Recent instance activity rendered as a timeline from the audit log.
export function ActivityTimeline({
  instanceId,
  canView,
}: {
  instanceId: string;
  canView: boolean;
}) {
  const { t } = useTranslation("instance");
  const { data, isPending, isError } = useQuery({
    queryKey: ["instance-audit-log", instanceId],
    enabled: canView,
    queryFn: async ({ signal }): Promise<InstanceAuditLogResponse> => {
      const transport = createTransport();
      if (transport === null) {
        return create(InstanceAuditLogResponseSchema, { entry: [] });
      }
      const service = createClient(InstanceService, transport);
      return service.getAuditLog({ id: instanceId }, { signal });
    },
    refetchInterval: 5_000,
  });

  const entries = data?.entry.slice(0, MAX_TIMELINE_ENTRIES) ?? [];

  if (!canView) return null;

  return (
    <section
      className="flex min-w-0 flex-col gap-5"
      aria-labelledby="overview-actions-title"
    >
      <h3 id="overview-actions-title" className="text-sm font-medium">
        {t("overview.timeline.title")}
      </h3>
      {isPending ? (
        <div className="flex flex-col gap-4">
          {LOADING_ROWS.map((id) => (
            <div key={id} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : isError && !data ? (
        <p className="text-muted-foreground text-sm">
          {t("overview.loadError")}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("overview.timeline.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {entries.map((entry) => (
            <li key={entry.id} className="flex min-w-0 flex-col gap-1">
              <span className="text-sm wrap-anywhere">
                <span className="font-medium">
                  {entry.user?.username ?? "?"}
                </span>{" "}
                <Trans
                  i18nKey={entryTypeI18nKey(entry.type)}
                  ns="instance"
                  values={{ data: entry.data }}
                />
              </span>
              {entry.timestamp && (
                <span className="text-muted-foreground text-xs">
                  <SFTimeAgo date={timestampToDate(entry.timestamp)} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        nativeButton={false}
        render={
          <Link
            to="/instance/$instance/audit-log"
            params={{ instance: instanceId }}
          />
        }
      >
        {t("overview.timeline.viewAll")}
      </Button>
    </section>
  );
}
