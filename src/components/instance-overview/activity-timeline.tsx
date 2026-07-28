import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import {
  type InstanceAuditLogResponse,
  InstanceAuditLogResponse_AuditLogEntryType,
  InstanceAuditLogResponseSchema,
  InstanceService,
} from "@soulfiremc/sdk/generated/soulfire/instance_pb";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BotIcon,
  type LucideIcon,
  RefreshCwIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { SFTimeAgo } from "@/components/sf-timeago.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { timestampToDate } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";

const MAX_TIMELINE_ENTRIES = 8;

function entryTypeIcon(
  type: InstanceAuditLogResponse_AuditLogEntryType,
): LucideIcon {
  switch (type) {
    case InstanceAuditLogResponse_AuditLogEntryType.EXECUTE_COMMAND:
      return SquareTerminalIcon;
    case InstanceAuditLogResponse_AuditLogEntryType.BOT_RESTART:
      return RefreshCwIcon;
    default:
      return BotIcon;
  }
}

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
  const { data } = useQuery({
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

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">
          {t("overview.timeline.title")}
        </CardTitle>
        {canView && (
          <Button
            variant="ghost"
            size="sm"
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
        )}
      </CardHeader>
      <CardContent>
        {!canView ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("overview.timeline.noPermission")}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("overview.timeline.empty")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {entries.map((entry) => {
              const Icon = entryTypeIcon(entry.type);
              return (
                <li key={entry.id} className="flex items-start gap-3">
                  <span className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm">
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
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
