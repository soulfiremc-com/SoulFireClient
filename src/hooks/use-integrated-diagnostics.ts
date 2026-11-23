import { useQuery } from "@tanstack/react-query";
import type { DesktopIntegratedServerDiagnostics } from "@/lib/desktop-api";
import { desktop, isDesktopApp } from "@/lib/desktop";
import {
  lastIntegratedLogId,
  mergeIntegratedDiagnostics,
} from "@/lib/integrated-diagnostics";

const queryKey = ["integrated-server-diagnostics"];

export function useIntegratedDiagnostics() {
  return useQuery({
    queryKey,
    // Poll only new log lines. The full buffer can be about 1 MB.
    queryFn: async ({ client }) => {
      const previous =
        client.getQueryData<DesktopIntegratedServerDiagnostics>(queryKey);
      return mergeIntegratedDiagnostics(
        previous,
        await desktop.integratedServer.getDiagnostics(
          lastIntegratedLogId(previous),
        ),
      );
    },
    refetchInterval: 1000,
    staleTime: 0,
    retry: false,
    enabled: isDesktopApp(),
  });
}
