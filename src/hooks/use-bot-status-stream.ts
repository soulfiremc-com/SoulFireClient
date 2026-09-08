import { useQueryClient } from "@tanstack/react-query";
import { use, useEffect } from "react";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { watchBotStatuses } from "@/lib/watch-bot-statuses.ts";

export function useBotStatusStream(instanceId: string) {
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  useEffect(() => {
    if (transport === null) return;
    return watchBotStatuses(transport, queryClient, instanceId);
  }, [instanceId, queryClient, transport]);
}
