import { useAtomMount } from "@effect/atom-react";
import { useQueryClient } from "@tanstack/react-query";
import { use } from "react";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { botStatusWatchAtom } from "@/lib/watch-bot-statuses.ts";

export function useBotStatusStream(instanceId: string) {
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  useAtomMount(botStatusWatchAtom(transport, queryClient, instanceId));
}
